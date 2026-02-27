import { config, fetchFn } from '../ctx.js';
import { OcrProviderExecutionError, type OcrProvider } from './ocr-provider-types.js';
import { extractTextFromLlmResponse, resolveLlmEndpoint } from '../llm-api.js';

const DEFAULT_PROMPT = 'Extract all visible text verbatim. Preserve line breaks. No summary.';

function resolveTimeoutMs(): number {
  const raw = Number(config?.ocr?.vision?.requestTimeoutMs);
  if (!Number.isFinite(raw)) return 30000;
  return Math.max(1000, Math.min(300000, Math.round(raw)));
}

export function createLlmVisionOcrProvider(): OcrProvider {
  return {
    id: 'llm_vision',
    async extractText(image: Buffer) {
      const resolved = resolveLlmEndpoint(String(config?.llmEndpoint || '').trim());
      const endpoint = resolved.endpoint;
      const model = String(config?.llmModel || '').trim();
      const key = String(config?.llmApiKey || (process.env as any).OPENAI_API_KEY || '').trim();

      if (!endpoint || !model || !key) {
        throw new OcrProviderExecutionError(
          'OCR_VISION_REQUEST_FAILED',
          'LLM vision OCR requires llmEndpoint, llmModel, and llmApiKey.'
        );
      }

      const systemPrompt = String(config?.ocr?.vision?.systemPrompt || '').trim() || DEFAULT_PROMPT;
      const timeoutMs = resolveTimeoutMs();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const imageData = image.toString('base64');
        const payload = {
          model,
          stream: false,
          instructions: systemPrompt,
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: 'Extract the text from this image exactly as written.' },
                {
                  type: 'input_image',
                  image_url: `data:image/png;base64,${imageData}`
                }
              ]
            }
          ]
        };

        const response = await fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        } as any);

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new OcrProviderExecutionError(
            'OCR_VISION_REQUEST_FAILED',
            `Vision OCR request failed ${response.status}: ${body || 'empty response body'}`
          );
        }

        const data: any = await response.json();
        return extractTextFromLlmResponse(data).trim();
      } catch (err: any) {
        if (err instanceof OcrProviderExecutionError) {
          throw err;
        }
        const message = err?.name === 'AbortError'
          ? `Vision OCR timed out after ${timeoutMs}ms`
          : `Vision OCR request failed: ${err?.message || String(err)}`;
        throw new OcrProviderExecutionError('OCR_VISION_REQUEST_FAILED', message);
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
