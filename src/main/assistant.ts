import { createRequire } from 'node:module';
import { config, clipboard, fetchFn } from './ctx.js';
import { tryPaste, getSelectedText } from './paste.js';
import { setTrayBusy } from './tray-manager.js';
import { recordAssistantExchange } from './history-store.js';
const require = createRequire(import.meta.url);

// Per-session conversation history.
let llmHistory: Array<{ role: string; content: string }> = [];
type AssistantCallOptions = {
  sessionId?: string;
  metadata?: Record<string, unknown>;
};

// ── LLM client ────────────────────────────────────────────────────────────────
export async function callLLM(prompt: string, onChunk?: (chunk: string) => void): Promise<string> {
  if (!prompt) return '';
  const endpoint = config.llmEndpoint;
  const model = config.llmModel;
  const key = config.llmApiKey || (process.env as any).OPENAI_API_KEY;
  if (!key) throw new Error('no LLM API key configured');

  const messages: any[] = [];
  if (config.llmSystemPrompt) messages.push({ role: 'system', content: config.llmSystemPrompt });
  for (const m of llmHistory) messages.push(m);
  messages.push({ role: 'user', content: prompt });

  const body = JSON.stringify({ model, messages, stream: !!onChunk });
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  const resp = await fetchFn(endpoint, { method: 'POST', headers, body } as any);
  if (!resp.ok) throw new Error(`LLM request failed ${resp.status}: ${await resp.text()}`);

  if (!onChunk) {
    const data: any = await resp.json();
    return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
  }

  // Streaming response.
  const reader = (resp.body as any).getReader();
  const decoder = new TextDecoder('utf-8');
  let fullContent = '';
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t || t === 'data: [DONE]') continue;
      if (t.startsWith('data: ')) {
        try {
          const data: any = JSON.parse(t.slice(6));
          const chunk = data?.choices?.[0]?.delta?.content || data?.choices?.[0]?.text || '';
          if (chunk) { fullContent += chunk; onChunk(chunk); }
        } catch (_) {}
      }
    }
  }
  return fullContent;
}

function recordHistory(prompt: string, response: string): void {
  llmHistory.push({ role: 'user', content: prompt });
  llmHistory.push({ role: 'assistant', content: response });
  if (llmHistory.length > 10) llmHistory = llmHistory.slice(llmHistory.length - 10);
}

function tryStreamPaste(chunk: string, context: { firstChunk: boolean; failed: boolean; typed: number; selection: string }): void {
  if (config?.pasteMode !== 'paste' || context.failed) return;
  if (context.firstChunk) {
    if (context.selection) {
      try { require('robotjs').keyTap('backspace'); } catch (_) { context.failed = true; return; }
    }
    context.firstChunk = false;
  }
  try { require('robotjs').typeString(chunk); context.typed += chunk.length; }
  catch (_) { context.failed = true; }
}

async function finalizePaste(response: string, ctx: { firstChunk: boolean; failed: boolean; typed: number }): Promise<void> {
  if (!response) return;
  clipboard.writeText(response);
  if (config?.pasteMode === 'paste' && (ctx.firstChunk || ctx.failed)) {
    const remaining = response.substring(ctx.typed);
    if (remaining) {
      clipboard.writeText(remaining);
      tryPaste(remaining);
      setTimeout(() => clipboard.writeText(response), 500);
    }
  }
}

// ── Assistant dispatch ────────────────────────────────────────────────────────
export function shouldHandleAsAssistant(text: string): boolean {
  const name = config?.assistantName?.trim();
  if (!text || !name) return false;
  return new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text.trim());
}

export async function handleAssistant(text: string, opts?: AssistantCallOptions): Promise<string | null> {
  if (!shouldHandleAsAssistant(text)) return null;
  const name = config.assistantName.trim();
  const remainder = text.trim().replace(new RegExp('^' + name, 'i'), '').trim();
  const selection = await getSelectedText();
  const prompt = selection ? (remainder ? `${remainder}\n\n${selection}` : selection) : remainder;
  console.log('[assistant] trigger=%s prompt=%s', name, prompt);
  setTrayBusy(true);
  try {
    const ctx = { firstChunk: true, failed: false, typed: 0, selection };
    const response = await callLLM(prompt, (chunk) => tryStreamPaste(chunk, ctx));
    console.log('[assistant] response=', response);
    if (response) {
      recordHistory(prompt, response);
      const historyMetadata = {
        ...(opts?.metadata ?? {}),
        source: opts?.metadata?.source ?? 'assistant'
      };
      try {
        await recordAssistantExchange({
          sessionId: opts?.sessionId,
          prompt,
          response,
          metadata: historyMetadata
        });
      } catch (err) {
        console.error('[assistant] history record failed', err);
      }
      await finalizePaste(response, ctx);
    }
    return response;
  } catch (err) {
    console.error('[assistant] error', err);
    return null;
  } finally {
    setTrayBusy(false);
  }
}

export async function handleAssistantShortcut(basePrompt: string): Promise<void> {
  const selection = await getSelectedText();
  const prompt = selection ? (basePrompt ? `${basePrompt}\n\n${selection}` : selection) : basePrompt;
  console.log('[assistant] shortcut prompt=', prompt);
  setTrayBusy(true);
  try {
    const ctx = { firstChunk: true, failed: false, typed: 0, selection };
    const response = await callLLM(prompt, (chunk) => tryStreamPaste(chunk, ctx));
    console.log('[assistant] shortcut response=', response);
    if (response) {
      recordHistory(prompt, response);
      try {
        await recordAssistantExchange({
          prompt,
          response,
          metadata: { source: 'shortcut' }
        });
      } catch (err) {
        console.error('[assistant] shortcut history record failed', err);
      }
      await finalizePaste(response, ctx);
    }
  } catch (err) {
    console.error('[assistant] shortcut error', err);
  } finally {
    setTrayBusy(false);
  }
}
