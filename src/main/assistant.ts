import { createRequire } from 'node:module';
import { config, clipboard } from './ctx.js';
import { tryPaste, getSelectedText } from './paste.js';
import { setTrayBusy } from './tray-manager.js';
import { recordAssistantExchange } from './history-store.js';
import { getRuntimeOrchestrator } from './runtime/runtime-services.js';
const require = createRequire(import.meta.url);

// Per-session conversation history.
let llmHistory: Array<{ role: string; content: string }> = [];
type AssistantCallOptions = {
  sessionId?: string;
  metadata?: Record<string, unknown>;
};

function resolveAssistantName(): string {
  try {
    const runtime = getRuntimeOrchestrator();
    const active = runtime.getActiveProviderProfile('llm');
    const fromProfile = String(active.profile?.options?.assistantName || '').trim();
    if (fromProfile) return fromProfile;
  } catch {}
  return String(config?.assistantName || '').trim();
}

// ── LLM client ────────────────────────────────────────────────────────────────
export async function callLLM(prompt: string, onChunk?: (chunk: string) => void): Promise<string> {
  if (!prompt) return '';
  const runtime = getRuntimeOrchestrator();
  const messages = llmHistory.map((message) => ({
    role: message.role as 'user' | 'assistant',
    content: message.content
  }));
  messages.push({ role: 'user', content: prompt });

  return runtime.respondLlm({
    messages: messages as any,
    stream: !!onChunk,
    onChunk
  });
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
      const pasteResult = await tryPaste(remaining);
      if (!pasteResult.ok) {
        console.warn('[assistant] paste failed, keeping clipboard only', {
          method: pasteResult.method,
          reason: pasteResult.reason
        });
      }
      setTimeout(() => clipboard.writeText(response), 500);
    }
  }
}

// ── Assistant dispatch ────────────────────────────────────────────────────────
export function shouldHandleAsAssistant(text: string): boolean {
  const name = resolveAssistantName();
  if (!text || !name) return false;
  return new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text.trim());
}

export async function handleAssistant(text: string, opts?: AssistantCallOptions): Promise<string | null> {
  if (!shouldHandleAsAssistant(text)) return null;
  const name = resolveAssistantName();
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
