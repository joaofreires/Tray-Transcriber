import { fetchFn } from '../../ctx.js';
import { extractTextFromLlmResponse, resolveLlmEndpoint } from '../../llm-api.js';
import type { SecretsService } from '../secrets-service.js';
import { resolveSecretValue } from '../secret-refs.js';
import type {
  OcrExtractRequest,
  OcrExtractResponse,
  OcrProvider,
  ProviderStatus
} from '../types.js';
import { profileOptionNumber, profileOptionString } from './common.js';

export function createLlmVisionRuntimeProvider(secrets: SecretsService): OcrProvider {
  return {
    descriptor: {
      id: 'ocr.llm_vision',
      capability: 'ocr',
      displayName: 'LLM Vision OCR',
      kind: 'remote',
      requiresInstall: false,
      supportsLocalPath: false
    },

    async getStatus(): Promise<ProviderStatus> {
      return {
        providerId: 'ocr.llm_vision',
        capability: 'ocr',
        installed: true,
        health: 'healthy',
        message: 'Vision provider available'
      };
    },

    async extractText(request: OcrExtractRequest): Promise<OcrExtractResponse> {
      const profile = request.profile;
      const endpoint = resolveLlmEndpoint(String(profile?.endpoint || '')).endpoint;
      const model = String(profile?.model || '').trim();
      if (!endpoint || !model) throw new Error('LLM vision OCR requires endpoint and model');

      const key = await resolveSecretValue(secrets, {
        providerId: 'ocr.llm_vision',
        secretRef: String(profile?.secretRef || '').trim(),
        envVarNames: ['OPENAI_API_KEY']
      });

      const systemPrompt = profileOptionString(
        profile,
        'systemPrompt',
        'Extract all visible text verbatim. Preserve line breaks. No summary.'
      );
      const timeoutMs = Math.max(1000, Math.min(300000, Math.round(profileOptionNumber(profile, 'requestTimeoutMs', 30000))));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const imageData = request.image.toString('base64');
        const payload = {
          model,
          stream: false,
          instructions: systemPrompt,
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: 'Extract the text from this image exactly as written.' },
                { type: 'input_image', image_url: `data:image/png;base64,${imageData}` }
              ]
            }
          ]
        };

        const response = await fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(key
              ? { Authorization: `Bearer ${key}` }
              : {})
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        } as any);

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`Vision OCR failed ${response.status}: ${body || 'empty response'}`);
        }

        const data = await response.json();
        return { text: extractTextFromLlmResponse(data).trim() };
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
