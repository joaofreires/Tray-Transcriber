import { describe, expect, it } from 'vitest';
import { buildSettingsSavePayload } from '../settings/save-payload';
import { emptyConfig } from '../settings/types';

describe('buildSettingsSavePayload', () => {
  it('removes deprecated top-level assistant fields from save payload', () => {
    const config = emptyConfig() as any;
    config.assistantName = 'Legacy';
    config.llmEndpoint = 'http://legacy.example';
    config.llmModel = 'legacy-model';
    config.llmApiKey = 'legacy-key';
    config.llmSystemPrompt = 'legacy prompt';
    config.ocr = { mode: 'local_tesseract' };

    const payload = buildSettingsSavePayload(config);

    expect(payload.assistantName).toBeUndefined();
    expect(payload.llmEndpoint).toBeUndefined();
    expect(payload.llmModel).toBeUndefined();
    expect(payload.llmApiKey).toBeUndefined();
    expect(payload.llmSystemPrompt).toBeUndefined();
    expect(payload.ocr).toBeUndefined();
    expect(payload.providers).toBeTruthy();
  });
});
