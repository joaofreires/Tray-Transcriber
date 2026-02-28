import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn()
}));

vi.mock('../ctx.js', () => ({
  fetchFn: fetchMock
}));

import { createLlmVisionRuntimeProvider } from '../runtime/providers/ocr-llm-vision.js';

function makeSecrets(value = '') {
  return {
    getSecret: vi.fn().mockResolvedValue(value)
  } as any;
}

describe('runtime LLM vision OCR provider', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    delete process.env.OPENAI_API_KEY;
  });

  it('allows local endpoint without API key', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: 'local ocr ok' })
    });

    const provider = createLlmVisionRuntimeProvider(makeSecrets(''));
    const result = await provider.extractText({
      image: Buffer.from('png-bytes'),
      profile: {
        id: 'ocr-local',
        providerId: 'ocr.llm_vision',
        label: 'local',
        endpoint: 'http://127.0.0.1:1234',
        model: 'gpt-oss-vision'
      }
    } as any);

    expect(result.text).toBe('local ocr ok');
    const headers = fetchMock.mock.calls[0]?.[1]?.headers || {};
    expect(headers.Authorization).toBeUndefined();
  });

  it('allows non-local endpoint without api key and sends no auth header', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: 'remote no-key ok' })
    });

    const provider = createLlmVisionRuntimeProvider(makeSecrets(''));
    const result = await provider.extractText({
      image: Buffer.from('png-bytes'),
      profile: {
        id: 'ocr-remote',
        providerId: 'ocr.llm_vision',
        label: 'remote',
        endpoint: 'https://api.openai.com',
        model: 'gpt-4o-mini'
      }
    } as any);

    expect(result.text).toBe('remote no-key ok');
    const headers = fetchMock.mock.calls[0]?.[1]?.headers || {};
    expect(headers.Authorization).toBeUndefined();
  });

  it('uses secretRef api key for non-local endpoint', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: 'remote ocr ok' })
    });

    const provider = createLlmVisionRuntimeProvider({
      getSecret: vi.fn().mockImplementation(async (ref: string) => (ref === 'ocr.vision.api_key' ? 'secret-key' : ''))
    } as any);

    const result = await provider.extractText({
      image: Buffer.from('png-bytes'),
      profile: {
        id: 'ocr-remote',
        providerId: 'ocr.llm_vision',
        label: 'remote',
        endpoint: 'https://api.openai.com',
        model: 'gpt-4o-mini',
        secretRef: 'ocr.vision.api_key'
      }
    } as any);

    expect(result.text).toBe('remote ocr ok');
    const headers = fetchMock.mock.calls[0]?.[1]?.headers || {};
    expect(headers.Authorization).toBe('Bearer secret-key');
  });

  it('falls back to legacy ocr secret ref when profile uses new naming', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: 'alias ocr key ok' })
    });

    const provider = createLlmVisionRuntimeProvider({
      getSecret: vi.fn().mockImplementation(async (ref: string) => (ref === 'ocr.vision.api_key' ? 'legacy-ocr-key' : ''))
    } as any);

    const result = await provider.extractText({
      image: Buffer.from('png-bytes'),
      profile: {
        id: 'ocr-remote',
        providerId: 'ocr.llm_vision',
        label: 'remote',
        endpoint: 'https://api.openai.com',
        model: 'gpt-4o-mini',
        secretRef: 'providers.ocr.llm_vision.api_key'
      }
    } as any);

    expect(result.text).toBe('alias ocr key ok');
    const headers = fetchMock.mock.calls[0]?.[1]?.headers || {};
    expect(headers.Authorization).toBe('Bearer legacy-ocr-key');
  });

  it('falls back to llm secret ref when ocr ref is empty', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: 'llm fallback key ok' })
    });

    const provider = createLlmVisionRuntimeProvider({
      getSecret: vi.fn().mockImplementation(async (ref: string) => (ref === 'providers.llm.openai_compatible.api_key' ? 'llm-shared-key' : ''))
    } as any);

    const result = await provider.extractText({
      image: Buffer.from('png-bytes'),
      profile: {
        id: 'ocr-remote',
        providerId: 'ocr.llm_vision',
        label: 'remote',
        endpoint: 'https://api.openai.com',
        model: 'gpt-4o-mini',
        secretRef: ''
      }
    } as any);

    expect(result.text).toBe('llm fallback key ok');
    const headers = fetchMock.mock.calls[0]?.[1]?.headers || {};
    expect(headers.Authorization).toBe('Bearer llm-shared-key');
  });
});
