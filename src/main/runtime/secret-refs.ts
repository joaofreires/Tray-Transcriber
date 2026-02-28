import type { SecretsService } from './secrets-service.js';

const SECRET_REF_GROUPS: string[][] = [
  ['providers.llm.openai_compatible.api_key', 'llm.openai.api_key'],
  ['providers.ocr.llm_vision.api_key', 'ocr.vision.api_key'],
  ['providers.stt.openai_compatible.api_key', 'stt.openai.api_key'],
  ['providers.stt.deepgram.api_key', 'stt.deepgram.api_key'],
  ['providers.stt.google.api_key', 'stt.google.api_key']
];

const PROVIDER_DEFAULT_SECRET_REFS: Record<string, string[]> = {
  'llm.openai_compatible': ['providers.llm.openai_compatible.api_key', 'llm.openai.api_key'],
  'ocr.llm_vision': [
    'providers.ocr.llm_vision.api_key',
    'ocr.vision.api_key',
    'providers.llm.openai_compatible.api_key',
    'llm.openai.api_key'
  ],
  'stt.remote.openai_compatible': ['providers.stt.openai_compatible.api_key', 'stt.openai.api_key'],
  'stt.remote.deepgram': ['providers.stt.deepgram.api_key', 'stt.deepgram.api_key'],
  'stt.remote.google': ['providers.stt.google.api_key', 'stt.google.api_key']
};

function trim(value: unknown): string {
  return String(value || '').trim();
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = trim(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function getAliasGroup(ref: string): string[] {
  const normalized = trim(ref);
  if (!normalized) return [];
  const group = SECRET_REF_GROUPS.find((entry) => entry.includes(normalized));
  return Array.isArray(group) ? [...group] : [];
}

export function canonicalSecretRef(ref: string): string {
  const normalized = trim(ref);
  if (!normalized) return '';
  const group = getAliasGroup(normalized);
  if (!group.length) return normalized;
  return group[0];
}

export function defaultSecretRefsForProvider(providerId: string): string[] {
  const entries = PROVIDER_DEFAULT_SECRET_REFS[trim(providerId)] || [];
  return uniqueNonEmpty(entries);
}

export function resolveSecretRefCandidates(secretRef: string, providerId?: string, extraRefs: string[] = []): string[] {
  const explicit = trim(secretRef);
  if (explicit) {
    return uniqueNonEmpty([explicit, ...getAliasGroup(explicit), ...extraRefs]);
  }
  return uniqueNonEmpty([...(providerId ? defaultSecretRefsForProvider(providerId) : []), ...extraRefs]);
}

export async function resolveSecretValue(
  secrets: SecretsService,
  options: {
    providerId?: string;
    secretRef?: string;
    extraRefs?: string[];
    envVarNames?: string[];
  }
): Promise<string> {
  for (const ref of resolveSecretRefCandidates(options.secretRef || '', options.providerId, options.extraRefs || [])) {
    const value = trim(await secrets.getSecret(ref));
    if (value) return value;
  }
  const envVarNames = Array.isArray(options.envVarNames) ? options.envVarNames : [];
  for (const key of envVarNames) {
    const value = trim(process.env[String(key || '').trim()]);
    if (value) return value;
  }
  return '';
}
