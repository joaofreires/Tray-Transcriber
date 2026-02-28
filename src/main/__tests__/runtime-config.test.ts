import { describe, expect, it } from 'vitest';
import { normalizeRuntimeConfig } from '../runtime/runtime-config.js';

describe('runtime config normalization', () => {
  it('enforces configVersion=3 and provides provider defaults', () => {
    const normalized = normalizeRuntimeConfig({ configVersion: 1 });
    expect(normalized.configVersion).toBe(3);
    expect(normalized.providers.stt.activeProviderId).toBeTruthy();
    expect(normalized.providers.llm.activeProviderId).toBeTruthy();
    expect(normalized.providers.ocr.activeProviderId).toBeTruthy();
  });

  it('derives compatibility fields from active profiles', () => {
    const normalized: any = normalizeRuntimeConfig({
      providers: {
        stt: {
          activeProviderId: 'stt.local.whisperx',
          activeProfileId: 's',
          profiles: [{ id: 's', providerId: 'stt.local.whisperx', label: 's', model: 'tiny', language: 'pt', options: { useWorker: true } }]
        },
        llm: {
          activeProviderId: 'llm.ollama',
          activeProfileId: 'l',
          profiles: [{ id: 'l', providerId: 'llm.ollama', label: 'l', endpoint: 'http://127.0.0.1:11434', model: 'llama3', options: { assistantName: 'Nova' } }]
        },
        ocr: {
          activeProviderId: 'ocr.local_tesseract',
          activeProfileId: 'o',
          profiles: [{ id: 'o', providerId: 'ocr.local_tesseract', label: 'o', localPath: 'tesseract' }]
        }
      }
    });

    expect(normalized.asrEngine).toBe('whisperx');
    expect(normalized.model).toBe('tiny');
    expect(normalized.language).toBe('pt');
    expect(normalized.assistantName).toBe('Nova');
    expect(normalized.llmEndpoint).toBe('http://127.0.0.1:11434');
  });

  it('seeds active profile from legacy assistant values when profile fields are missing', () => {
    const normalized: any = normalizeRuntimeConfig({
      llmEndpoint: 'http://127.0.0.1:1234',
      llmModel: 'gpt-oss-20b',
      assistantName: 'Atlas',
      llmSystemPrompt: 'Be concise.',
      providers: {
        llm: {
          activeProviderId: 'llm.openai_compatible',
          activeProfileId: 'llm-openai-default',
          profiles: [
            {
              id: 'llm-openai-default',
              providerId: 'llm.openai_compatible',
              label: 'OpenAI-compatible',
              endpoint: '',
              model: '',
              options: {}
            }
          ]
        }
      }
    });

    const profile = normalized.providers.llm.profiles[0];
    expect(profile.endpoint).toBe('http://127.0.0.1:1234');
    expect(profile.model).toBe('gpt-oss-20b');
    expect(profile.options.assistantName).toBe('Atlas');
    expect(profile.options.systemPrompt).toBe('Be concise.');
    expect(normalized.llmEndpoint).toBe('http://127.0.0.1:1234');
    expect(normalized.llmModel).toBe('gpt-oss-20b');
  });

  it('uses providers.* secret ref naming for new default profiles', () => {
    const normalized: any = normalizeRuntimeConfig({});
    const llmProfile = normalized.providers.llm.profiles.find((entry: any) => entry.providerId === 'llm.openai_compatible');
    const ocrProfile = normalized.providers.ocr.profiles.find((entry: any) => entry.providerId === 'ocr.llm_vision');
    const sttOpenAiProfile = normalized.providers.stt.profiles.find((entry: any) => entry.providerId === 'stt.remote.openai_compatible');

    expect(llmProfile?.secretRef).toBe('providers.llm.openai_compatible.api_key');
    expect(ocrProfile?.secretRef).toBe('providers.ocr.llm_vision.api_key');
    expect(sttOpenAiProfile?.secretRef).toBe('providers.stt.openai_compatible.api_key');
  });

  it('normalizes legacy secret refs to providers.* naming', () => {
    const normalized: any = normalizeRuntimeConfig({
      providers: {
        llm: {
          activeProviderId: 'llm.openai_compatible',
          activeProfileId: 'llm-1',
          profiles: [{ id: 'llm-1', providerId: 'llm.openai_compatible', label: 'llm', secretRef: 'llm.openai.api_key' }]
        },
        ocr: {
          activeProviderId: 'ocr.llm_vision',
          activeProfileId: 'ocr-1',
          profiles: [{ id: 'ocr-1', providerId: 'ocr.llm_vision', label: 'ocr', secretRef: 'ocr.vision.api_key' }]
        },
        stt: {
          activeProviderId: 'stt.remote.deepgram',
          activeProfileId: 'stt-1',
          profiles: [{ id: 'stt-1', providerId: 'stt.remote.deepgram', label: 'stt', secretRef: 'stt.deepgram.api_key' }]
        }
      }
    });

    expect(normalized.providers.llm.profiles[0]?.secretRef).toBe('providers.llm.openai_compatible.api_key');
    expect(normalized.providers.ocr.profiles[0]?.secretRef).toBe('providers.ocr.llm_vision.api_key');
    expect(normalized.providers.stt.profiles[0]?.secretRef).toBe('providers.stt.deepgram.api_key');
  });
});
