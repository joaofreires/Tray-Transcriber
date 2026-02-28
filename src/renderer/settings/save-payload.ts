import { clone, type SettingsConfig } from './types';

export function buildSettingsSavePayload(nextDraft: SettingsConfig): Record<string, unknown> {
  const payload = clone(nextDraft) as Record<string, unknown>;
  // Profile values are the source of truth; keep legacy top-level fields write-disabled.
  delete payload.assistantName;
  delete payload.llmEndpoint;
  delete payload.llmModel;
  delete payload.llmApiKey;
  delete payload.llmSystemPrompt;
  delete payload.ocr;
  return payload;
}
