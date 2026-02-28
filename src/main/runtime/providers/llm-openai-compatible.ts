import net from 'node:net';
import { fetchFn } from '../../ctx.js';
import {
  extractTextDeltaFromLlmStreamEvent,
  extractTextFromLlmResponse,
  resolveLlmEndpoint
} from '../../llm-api.js';
import type { SecretsService } from '../secrets-service.js';
import { resolveSecretValue } from '../secret-refs.js';
import type {
  LlmMessage,
  LlmProvider,
  LlmRespondRequest,
  LlmRespondResponse,
  ProviderStatus
} from '../types.js';

function toInput(messages: LlmMessage[]): any[] {
  return messages.map((message) => ({
    role: message.role,
    content: [{ type: 'input_text', text: message.content }]
  }));
}

function defaultMessages(request: LlmRespondRequest): LlmMessage[] {
  if (Array.isArray(request.messages) && request.messages.length) {
    return request.messages
      .filter((entry) => entry && typeof entry.content === 'string' && entry.content.trim())
      .map((entry) => ({ role: entry.role, content: entry.content }));
  }
  const prompt = String(request.prompt || '').trim();
  if (!prompt) return [];
  return [{ role: 'user', content: prompt }];
}

function isLocalHost(hostname: string): boolean {
  const value = String(hostname || '').trim().toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '::1' || value.endsWith('.local');
}

function isPrivateIpAddress(host: string): boolean {
  const value = String(host || '').trim();
  const ipType = net.isIP(value);
  if (ipType === 4) {
    if (value.startsWith('10.')) return true;
    if (value.startsWith('192.168.')) return true;
    if (value.startsWith('169.254.')) return true;
    if (value.startsWith('127.')) return true;
    const parts = value.split('.').map((part) => Number(part));
    if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    return false;
  }
  if (ipType === 6) {
    const normalized = value.toLowerCase();
    if (normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
    if (normalized.startsWith('fe80:')) return true; // link-local
    return false;
  }
  return false;
}

function isLikelyLocalEndpoint(endpoint: string): boolean {
  try {
    const parsed = new URL(endpoint);
    const host = String(parsed.hostname || '').trim().toLowerCase();
    return (
      isLocalHost(host) ||
      isPrivateIpAddress(host) ||
      host.endsWith('.lan') ||
      host.endsWith('.home') ||
      host.endsWith('.home.arpa')
    );
  } catch {
    return false;
  }
}

export function createOpenAiCompatibleLlmProvider(providerId: 'llm.openai_compatible' | 'llm.lmstudio', displayName: string, fallbackEndpoint: string): (secrets: SecretsService) => LlmProvider {
  return (secrets: SecretsService): LlmProvider => ({
    descriptor: {
      id: providerId,
      capability: 'llm',
      displayName,
      kind: providerId === 'llm.openai_compatible' ? 'remote' : 'local',
      requiresInstall: providerId === 'llm.lmstudio',
      supportsLocalPath: providerId === 'llm.lmstudio'
    },

    async getStatus(): Promise<ProviderStatus> {
      return {
        providerId,
        capability: 'llm',
        installed: true,
        health: 'healthy',
        message: 'LLM provider ready'
      };
    },

    async respond(request: LlmRespondRequest): Promise<LlmRespondResponse> {
      const profile = request.profile;
      const endpointInput = String(profile?.endpoint || fallbackEndpoint);
      const endpoint = resolveLlmEndpoint(endpointInput).endpoint;
      const model = String(profile?.model || 'gpt-5-nano').trim();
      if (!endpoint) throw new Error(`${displayName}: endpoint is required`);
      if (!model) throw new Error(`${displayName}: model is required`);

      const authKey = await resolveSecretValue(secrets, {
        providerId,
        secretRef: String(profile?.secretRef || ''),
        envVarNames: ['OPENAI_API_KEY']
      });

      if (providerId === 'llm.openai_compatible' && !authKey && !isLikelyLocalEndpoint(endpointInput)) {
        throw new Error('OpenAI-compatible provider requires an API key for non-local endpoints');
      }

      const messages = defaultMessages(request);
      if (!messages.length) return { text: '' };

      const payload: any = {
        model,
        input: toInput(messages),
        stream: !!request.onChunk
      };
      const systemPrompt = String(profile?.options?.systemPrompt || '').trim();
      if (systemPrompt) payload.instructions = systemPrompt;

      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authKey
            ? { Authorization: `Bearer ${authKey}` }
            : {})
        },
        body: JSON.stringify(payload)
      } as any);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`${displayName} request failed ${response.status}: ${body || 'empty response'}`);
      }

      if (!request.onChunk) {
        const data = await response.json();
        return { text: extractTextFromLlmResponse(data).trim() };
      }

      const reader = (response.body as any).getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data:')) continue;
          try {
            const payload = JSON.parse(trimmed.replace(/^data:\s*/, ''));
            const delta = extractTextDeltaFromLlmStreamEvent(payload);
            if (delta) {
              fullText += delta;
              request.onChunk(delta);
              continue;
            }
            const finalText = extractTextFromLlmResponse(payload?.response || payload);
            if (finalText && !fullText) {
              fullText += finalText;
              request.onChunk(finalText);
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }

      return { text: fullText.trim() };
    }
  });
}
