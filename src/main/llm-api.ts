export type LlmApiFlavor = 'responses' | 'chat_completions';

export type ResolvedLlmEndpoint = {
  endpoint: string;
  flavor: LlmApiFlavor;
};

function isOpenAiHost(hostname: string): boolean {
  const value = String(hostname || '').toLowerCase();
  return value === 'api.openai.com' || value.endsWith('.openai.com');
}

function ensureScheme(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  if (/^(localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?$/i.test(raw)) {
    return `http://${raw}`;
  }
  return `https://${raw}`;
}

export function normalizeLlmHost(endpointInput: string): string {
  const prepared = ensureScheme(endpointInput);
  if (!prepared) return '';

  try {
    const parsed = new URL(prepared);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_err) {
    return String(endpointInput || '').trim().replace(/\/+$/, '');
  }
}

function buildResponsesEndpoint(host: string): string {
  const normalizedHost = normalizeLlmHost(host);
  if (!normalizedHost) return '';
  try {
    const parsed = new URL(normalizedHost);
    parsed.pathname = '/v1/responses';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch (_err) {
    return `${normalizedHost.replace(/\/+$/, '')}/v1/responses`;
  }
}

function parseOutputTextArray(outputText: unknown): string {
  if (!Array.isArray(outputText)) return '';
  let text = '';
  for (const entry of outputText) {
    if (typeof entry === 'string') {
      text += entry;
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    if (typeof (entry as any).text === 'string') {
      text += String((entry as any).text);
      continue;
    }
    if (typeof (entry as any).output_text === 'string') {
      text += String((entry as any).output_text);
    }
  }
  return text;
}

function parseContentArray(content: unknown): string {
  if (!Array.isArray(content)) return '';
  let text = '';
  for (const part of content) {
    if (typeof part === 'string') {
      text += part;
      continue;
    }
    if (!part || typeof part !== 'object') continue;
    if (typeof (part as any).text === 'string') {
      text += String((part as any).text);
      continue;
    }
    if (typeof (part as any).output_text === 'string') {
      text += String((part as any).output_text);
      continue;
    }
    if (typeof (part as any).content === 'string') {
      text += String((part as any).content);
    }
  }
  return text;
}

function parseOutputArray(output: unknown): string {
  if (!Array.isArray(output)) return '';
  let text = '';
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    if (typeof (item as any).text === 'string') {
      text += String((item as any).text);
    }
    text += parseContentArray((item as any).content);
  }
  return text;
}

export function resolveLlmEndpoint(endpointInput: string): ResolvedLlmEndpoint {
  const raw = String(endpointInput || '').trim();
  if (!raw) {
    return {
      endpoint: '',
      flavor: 'responses'
    };
  }

  const host = normalizeLlmHost(raw);
  if (!host) {
    return {
      endpoint: raw,
      flavor: 'chat_completions'
    };
  }

  let flavor: LlmApiFlavor = 'responses';
  try {
    const parsed = new URL(host);
    if (!isOpenAiHost(parsed.hostname)) {
      // We still default to OpenAI-compatible Responses API for non-OpenAI hosts.
      flavor = 'responses';
    }
  } catch (_err) {
    // Keep default responses flavor for host-like strings.
  }

  return {
    endpoint: buildResponsesEndpoint(host),
    flavor
  };
}

export function extractTextFromLlmResponse(payload: any): string {
  if (!payload || typeof payload !== 'object') return '';

  if (typeof payload.output_text === 'string') {
    return payload.output_text;
  }

  const fromOutputTextArray = parseOutputTextArray(payload.output_text);
  if (fromOutputTextArray) return fromOutputTextArray;

  const fromOutput = parseOutputArray(payload.output);
  if (fromOutput) return fromOutput;

  if (payload.response && typeof payload.response === 'object') {
    const nested = extractTextFromLlmResponse(payload.response);
    if (nested) return nested;
  }

  const legacyContent = payload?.choices?.[0]?.message?.content;
  if (typeof legacyContent === 'string') return legacyContent;

  const legacyContentArray = parseContentArray(legacyContent);
  if (legacyContentArray) return legacyContentArray;

  const legacyText = payload?.choices?.[0]?.text;
  if (typeof legacyText === 'string') return legacyText;

  return '';
}

export function extractTextDeltaFromLlmStreamEvent(payload: any): string {
  if (!payload || typeof payload !== 'object') return '';

  const type = String(payload.type || '').toLowerCase();
  if (type === 'response.output_text.delta' && typeof payload.delta === 'string') {
    return payload.delta;
  }

  if (typeof payload?.output_text?.delta === 'string') {
    return payload.output_text.delta;
  }

  if (typeof payload.text_delta === 'string') {
    return payload.text_delta;
  }

  const legacy = payload?.choices?.[0]?.delta?.content || payload?.choices?.[0]?.text;
  return typeof legacy === 'string' ? legacy : '';
}
