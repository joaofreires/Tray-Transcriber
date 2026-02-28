import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn()
}));

vi.mock('../ctx.js', () => ({
  fetchFn: fetchMock
}));

import { createOpenAiCompatibleLlmProvider } from '../runtime/providers/llm-openai-compatible.js';

function makeSecrets(value = '') {
  return {
    getSecret: vi.fn().mockResolvedValue(value)
  } as any;
}

describe('OpenAI-compatible LLM provider', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    delete process.env.OPENAI_API_KEY;
  });

  it('allows local endpoint without API key', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: 'local ok' })
    });

    const provider = createOpenAiCompatibleLlmProvider(
      'llm.openai_compatible',
      'OpenAI-compatible LLM',
      'https://api.openai.com'
    )(makeSecrets(''));

    const text = await provider.respond({
      prompt: 'hello',
      profile: {
        id: 'p1',
        providerId: 'llm.openai_compatible',
        label: 'Local',
        endpoint: 'http://127.0.0.1:1234',
        model: 'gpt-oss'
      }
    } as any);

    expect(text.text).toBe('local ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call[1]?.headers?.Authorization).toBeUndefined();
  });

  it('allows private network endpoint without API key', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: 'lan ok' })
    });

    const provider = createOpenAiCompatibleLlmProvider(
      'llm.openai_compatible',
      'OpenAI-compatible LLM',
      'https://api.openai.com'
    )(makeSecrets(''));

    const text = await provider.respond({
      prompt: 'hello',
      profile: {
        id: 'p-lan',
        providerId: 'llm.openai_compatible',
        label: 'LAN',
        endpoint: 'http://192.168.31.183:1234',
        model: 'gpt-oss-20b'
      }
    } as any);

    expect(text.text).toBe('lan ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call[1]?.headers?.Authorization).toBeUndefined();
  });

  it('requires API key for non-local endpoint', async () => {
    const provider = createOpenAiCompatibleLlmProvider(
      'llm.openai_compatible',
      'OpenAI-compatible LLM',
      'https://api.openai.com'
    )(makeSecrets(''));

    await expect(
      provider.respond({
        prompt: 'hello',
        profile: {
          id: 'p2',
          providerId: 'llm.openai_compatible',
          label: 'Remote',
          endpoint: 'https://api.openai.com',
          model: 'gpt-4o-mini'
        }
      } as any)
    ).rejects.toThrow('requires an API key');
  });

  it('uses profile secretRef key for remote endpoint auth', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: 'remote ok' })
    });

    const provider = createOpenAiCompatibleLlmProvider(
      'llm.openai_compatible',
      'OpenAI-compatible LLM',
      'https://api.openai.com'
    )({
      getSecret: vi.fn().mockImplementation(async (ref: string) => (ref === 'llm.openai.api_key' ? 'dummy-key' : ''))
    } as any);

    const text = await provider.respond({
      prompt: 'hello',
      profile: {
        id: 'p3',
        providerId: 'llm.openai_compatible',
        label: 'Remote',
        endpoint: 'https://api.openai.com',
        model: 'gpt-4o-mini',
        secretRef: 'llm.openai.api_key'
      }
    } as any);

    expect(text.text).toBe('remote ok');
    expect(fetchMock.mock.calls[0][1]?.headers?.Authorization).toBe('Bearer dummy-key');
  });

  it('falls back to legacy secret key when profile uses providers.* naming', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: 'remote alias ok' })
    });

    const provider = createOpenAiCompatibleLlmProvider(
      'llm.openai_compatible',
      'OpenAI-compatible LLM',
      'https://api.openai.com'
    )({
      getSecret: vi.fn().mockImplementation(async (ref: string) => (ref === 'llm.openai.api_key' ? 'legacy-key' : ''))
    } as any);

    const text = await provider.respond({
      prompt: 'hello',
      profile: {
        id: 'p3b',
        providerId: 'llm.openai_compatible',
        label: 'Remote',
        endpoint: 'https://api.openai.com',
        model: 'gpt-4o-mini',
        secretRef: 'providers.llm.openai_compatible.api_key'
      }
    } as any);

    expect(text.text).toBe('remote alias ok');
    expect(fetchMock.mock.calls[0][1]?.headers?.Authorization).toBe('Bearer legacy-key');
  });

  it('uses profile endpoint/model/systemPrompt as source of truth', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: 'profile endpoint used' })
    });

    const provider = createOpenAiCompatibleLlmProvider(
      'llm.openai_compatible',
      'OpenAI-compatible LLM',
      'https://fallback.example.com'
    )({
      getSecret: vi.fn().mockResolvedValue('dummy-key')
    } as any);

    const text = await provider.respond({
      prompt: 'hello',
      profile: {
        id: 'p4',
        providerId: 'llm.openai_compatible',
        label: 'Profile config',
        endpoint: 'http://127.0.0.1:1234',
        model: 'local-model',
        options: { systemPrompt: 'profile system prompt' }
      }
    } as any);

    expect(text.text).toBe('profile endpoint used');
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:1234/v1/responses');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body || '{}'));
    expect(body.model).toBe('local-model');
    expect(body.instructions).toBe('profile system prompt');
  });
});
