export type OcrMode = 'llm_vision' | 'local_tesseract';
export type OcrProviderId = OcrMode;

export type OcrSettings = {
  mode: OcrMode;
  vision: {
    systemPrompt: string;
    requestTimeoutMs: number;
  };
  localTesseract: {
    binaryPath: string;
    language: string;
    extraArgs: string;
    timeoutMs: number;
  };
};

export const DEFAULT_OCR_SETTINGS: OcrSettings = {
  mode: 'llm_vision',
  vision: {
    systemPrompt: 'Extract all visible text verbatim. Preserve line breaks. No summary.',
    requestTimeoutMs: 30000
  },
  localTesseract: {
    binaryPath: 'tesseract',
    language: 'eng',
    extraArgs: '',
    timeoutMs: 15000
  }
};

function sanitizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeTimeout(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1000, Math.min(300000, Math.round(parsed)));
}

export function normalizeOcrMode(value: unknown): OcrMode {
  return value === 'local_tesseract' ? 'local_tesseract' : 'llm_vision';
}

export function providerIdForMode(mode: OcrMode): OcrProviderId {
  return mode === 'local_tesseract' ? 'local_tesseract' : 'llm_vision';
}

export function normalizeOcrProviderId(value: unknown): string {
  return sanitizeString(value).toLowerCase();
}

export function normalizeOcrSettings(raw: unknown): OcrSettings {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const mode = normalizeOcrMode(input.mode);

  return {
    mode,
    vision: {
      systemPrompt: sanitizeString(input.vision?.systemPrompt) || DEFAULT_OCR_SETTINGS.vision.systemPrompt,
      requestTimeoutMs: sanitizeTimeout(input.vision?.requestTimeoutMs, DEFAULT_OCR_SETTINGS.vision.requestTimeoutMs)
    },
    localTesseract: {
      binaryPath: sanitizeString(input.localTesseract?.binaryPath) || DEFAULT_OCR_SETTINGS.localTesseract.binaryPath,
      language: sanitizeString(input.localTesseract?.language) || DEFAULT_OCR_SETTINGS.localTesseract.language,
      extraArgs: sanitizeString(input.localTesseract?.extraArgs),
      timeoutMs: sanitizeTimeout(input.localTesseract?.timeoutMs, DEFAULT_OCR_SETTINGS.localTesseract.timeoutMs)
    }
  };
}
