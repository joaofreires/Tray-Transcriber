import { describe, expect, it } from 'vitest';
import { applyLegacyAssistantOverrides } from '../config-legacy-bridge.js';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

describe('applyLegacyAssistantOverrides', () => {
  it('updates active llm profile when legacy llm fields changed', () => {
    const previous = {
      llmEndpoint: 'https://api.openai.com',
      llmModel: 'gpt-5-nano',
      assistantName: 'Luna',
      llmSystemPrompt: '',
      providers: {
        llm: {
          activeProviderId: 'llm.openai_compatible',
          activeProfileId: 'llm-openai-default',
          profiles: [
            {
              id: 'llm-openai-default',
              providerId: 'llm.openai_compatible',
              endpoint: 'https://api.openai.com',
              model: 'gpt-5-nano',
              options: { assistantName: 'Luna', systemPrompt: '' }
            }
          ]
        }
      }
    };

    const next = deepClone(previous) as any;
    next.llmEndpoint = 'http://127.0.0.1:1234';
    next.llmModel = 'local-model';
    next.assistantName = 'Jarvis';
    next.llmSystemPrompt = 'You are local.';

    applyLegacyAssistantOverrides(next, previous as any);

    const profile = next.providers.llm.profiles[0];
    expect(profile.endpoint).toBe('http://127.0.0.1:1234');
    expect(profile.model).toBe('local-model');
    expect(profile.options.assistantName).toBe('Jarvis');
    expect(profile.options.systemPrompt).toBe('You are local.');
  });

  it('does not override profile when legacy llm fields were unchanged', () => {
    const previous = {
      llmEndpoint: 'https://api.openai.com',
      llmModel: 'gpt-5-nano',
      assistantName: 'Luna',
      llmSystemPrompt: '',
      providers: {
        llm: {
          activeProviderId: 'llm.openai_compatible',
          activeProfileId: 'llm-openai-default',
          profiles: [
            {
              id: 'llm-openai-default',
              providerId: 'llm.openai_compatible',
              endpoint: 'https://custom.example.com',
              model: 'custom-model',
              options: { assistantName: 'Custom', systemPrompt: 'custom prompt' }
            }
          ]
        }
      }
    };

    const next = deepClone(previous);

    applyLegacyAssistantOverrides(next as any, previous as any);

    const profile = (next as any).providers.llm.profiles[0];
    expect(profile.endpoint).toBe('https://custom.example.com');
    expect(profile.model).toBe('custom-model');
    expect(profile.options.assistantName).toBe('Custom');
    expect(profile.options.systemPrompt).toBe('custom prompt');
  });

  it('creates an llm profile when missing and fields changed', () => {
    const previous = {
      llmEndpoint: '',
      llmModel: '',
      assistantName: '',
      llmSystemPrompt: '',
      providers: {
        llm: {
          activeProviderId: 'llm.openai_compatible',
          activeProfileId: 'missing',
          profiles: []
        }
      }
    };

    const next = deepClone(previous) as any;
    next.llmEndpoint = 'http://localhost:1234';
    next.llmModel = 'gpt-local';

    applyLegacyAssistantOverrides(next, previous as any);

    expect(Array.isArray(next.providers.llm.profiles)).toBe(true);
    expect(next.providers.llm.profiles.length).toBe(1);
    expect(next.providers.llm.profiles[0].endpoint).toBe('http://localhost:1234');
    expect(next.providers.llm.profiles[0].model).toBe('gpt-local');
  });
});
