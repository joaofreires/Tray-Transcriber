import { fetchFn } from '../../ctx.js';
import type {
  LlmMessage,
  LlmProvider,
  LlmRespondRequest,
  LlmRespondResponse,
  ProviderStatus
} from '../types.js';
import { normalizeBaseEndpoint } from './common.js';

function normalizeMessages(request: LlmRespondRequest): LlmMessage[] {
  if (Array.isArray(request.messages) && request.messages.length) {
    return request.messages
      .filter((entry) => entry && typeof entry.content === 'string' && entry.content.trim())
      .map((entry) => ({ role: entry.role, content: entry.content }));
  }
  const prompt = String(request.prompt || '').trim();
  return prompt ? [{ role: 'user', content: prompt }] : [];
}

export function createOllamaLlmProvider(): LlmProvider {
  return {
    descriptor: {
      id: 'llm.ollama',
      capability: 'llm',
      displayName: 'Ollama',
      kind: 'local',
      requiresInstall: true,
      supportsLocalPath: true
    },

    async getStatus(): Promise<ProviderStatus> {
      const endpoint = normalizeBaseEndpoint('http://127.0.0.1:11434', 'http://127.0.0.1:11434');
      try {
        const response = await fetchFn(`${endpoint}/api/tags`, { method: 'GET' } as any);
        return {
          providerId: 'llm.ollama',
          capability: 'llm',
          installed: response.ok,
          health: response.ok ? 'healthy' : 'degraded',
          message: response.ok ? 'Ollama reachable' : `Ollama returned ${response.status}`
        };
      } catch (err: any) {
        return {
          providerId: 'llm.ollama',
          capability: 'llm',
          installed: false,
          health: 'unavailable',
          message: err?.message || String(err)
        };
      }
    },

    async respond(request: LlmRespondRequest): Promise<LlmRespondResponse> {
      const profile = request.profile;
      const endpoint = normalizeBaseEndpoint(String(profile?.endpoint || ''), 'http://127.0.0.1:11434');
      const model = String(profile?.model || 'llama3.1:8b').trim();
      const messages = normalizeMessages(request);
      if (!messages.length) return { text: '' };

      const payload = {
        model,
        messages,
        stream: !!request.onChunk
      };

      const response = await fetchFn(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      } as any);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Ollama request failed ${response.status}: ${body || 'empty response'}`);
      }

      if (!request.onChunk) {
        const data = await response.json();
        return { text: String(data?.message?.content || '').trim() };
      }

      const reader = (response.body as any).getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            const chunk = String(event?.message?.content || '');
            if (chunk) {
              fullText += chunk;
              request.onChunk(chunk);
            }
          } catch {
            // ignore malformed chunk
          }
        }
      }

      return { text: fullText.trim() };
    }
  };
}
