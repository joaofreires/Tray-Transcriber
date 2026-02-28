import { beforeEach, describe, expect, it, vi } from 'vitest';

const { configRef, fetchFnMock } = vi.hoisted(() => ({
  configRef: {
    llmEndpoint: 'https://example.invalid',
    llmModel: 'gpt-vision',
    llmApiKey: 'test-key',
    ocr: {
      vision: {
        systemPrompt: 'OCR prompt',
        requestTimeoutMs: 10000
      }
    }
  } as any,
  fetchFnMock: vi.fn()
}));

vi.mock('../ctx.js', () => ({
  config: configRef,
  fetchFn: fetchFnMock
}));

import { createLlmVisionOcrProvider } from '../shortcuts/ocr-provider-llm-vision.js';

describe('LLM vision OCR provider', () => {
  beforeEach(() => {
    fetchFnMock.mockReset();
    configRef.llmEndpoint = 'https://example.invalid';
    configRef.llmModel = 'gpt-vision';
    configRef.llmApiKey = 'test-key';
    configRef.ocr = {
      vision: {
        systemPrompt: 'OCR prompt',
        requestTimeoutMs: 10000
      }
    };
  });

  it('builds multimodal request and returns extracted text', async () => {
    fetchFnMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              { type: 'output_text', text: 'Line one\\n' },
              { type: 'output_text', text: 'Line two' }
            ]
          }
        ]
      })
    });

    const provider = createLlmVisionOcrProvider();
    const result = await provider.extractText(Buffer.from('png-bytes'), {}, {} as any);

    expect(result).toBe('Line one\\nLine two');
    expect(fetchFnMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchFnMock.mock.calls[0];
    expect(url).toBe('https://example.invalid/v1/responses');
    const body = JSON.parse(String(request.body || '{}'));
    expect(body.model).toBe('gpt-vision');
    expect(body.instructions).toBe('OCR prompt');
    expect(Array.isArray(body.input)).toBe(true);
    expect(body.input[0].content[1].image_url).toContain('data:image/png;base64,');
  });

  it('returns typed error when vision request fails', async () => {
    fetchFnMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad request'
    });

    const provider = createLlmVisionOcrProvider();
    await expect(provider.extractText(Buffer.from('png-bytes'), {}, {} as any)).rejects.toMatchObject({
      code: 'OCR_VISION_REQUEST_FAILED'
    });
  });
});
