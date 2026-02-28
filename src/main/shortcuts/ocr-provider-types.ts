import type { ShortcutExecutionContext } from './pipeline.js';
import type { OcrProviderId } from '../ocr-schema.js';

export type OcrExtractOptions = {
  providerId?: string;
  languageHint?: string;
};

export interface OcrProvider {
  id: OcrProviderId;
  extractText: (image: Buffer, options: OcrExtractOptions, context: ShortcutExecutionContext) => Promise<string>;
}

export type OcrProviderExecutionErrorCode =
  | 'OCR_VISION_REQUEST_FAILED'
  | 'OCR_CLI_UNAVAILABLE'
  | 'OCR_CLI_EXEC_FAILED';

export class OcrProviderExecutionError extends Error {
  code: OcrProviderExecutionErrorCode;

  constructor(code: OcrProviderExecutionErrorCode, message: string) {
    super(message);
    this.name = 'OcrProviderExecutionError';
    this.code = code;
  }
}
