import { config } from '../ctx.js';
import {
  normalizeOcrMode,
  providerIdForMode,
  type OcrMode,
  type OcrProviderId
} from '../ocr-schema.js';
import { createLlmVisionOcrProvider } from './ocr-provider-llm-vision.js';
import { createLocalTesseractOcrProvider } from './ocr-provider-local-tesseract.js';
import type { OcrProvider } from './ocr-provider-types.js';

export type OcrProviderResolutionResult =
  | {
      ok: true;
      provider: OcrProvider;
      providerId: OcrProviderId;
      activeMode: OcrMode;
    }
  | {
      ok: false;
      code: 'NOT_IMPLEMENTED_OCR_PROVIDER' | 'OCR_PROVIDER_DISABLED';
      message: string;
      providerId: string;
      activeMode: OcrMode;
    };

const providers = new Map<string, OcrProvider>();
let builtinsRegistered = false;

function ensureBuiltinsRegistered(): void {
  if (builtinsRegistered) return;
  builtinsRegistered = true;
  registerOcrProvider(createLlmVisionOcrProvider());
  registerOcrProvider(createLocalTesseractOcrProvider());
}

export function registerOcrProvider(provider: OcrProvider): void {
  providers.set(provider.id, provider);
}

export function getActiveOcrMode(): OcrMode {
  return normalizeOcrMode(config?.ocr?.mode);
}

export function getActiveOcrProviderId(): OcrProviderId {
  return providerIdForMode(getActiveOcrMode());
}

export function resolveOcrProvider(providerId: string): OcrProviderResolutionResult {
  ensureBuiltinsRegistered();

  const activeMode = getActiveOcrMode();
  const activeProviderId = providerIdForMode(activeMode);
  const requested = String(providerId || '').trim().toLowerCase();
  const resolvedProviderId = requested || activeProviderId;

  if (resolvedProviderId !== 'llm_vision' && resolvedProviderId !== 'local_tesseract') {
    return {
      ok: false,
      code: 'NOT_IMPLEMENTED_OCR_PROVIDER',
      message: `OCR provider "${resolvedProviderId || '(empty)'}" is not recognized.`,
      providerId: resolvedProviderId,
      activeMode
    };
  }

  if (resolvedProviderId !== activeProviderId) {
    return {
      ok: false,
      code: 'OCR_PROVIDER_DISABLED',
      message: `OCR provider "${resolvedProviderId}" is disabled while mode "${activeMode}" is active.`,
      providerId: resolvedProviderId,
      activeMode
    };
  }

  const provider = providers.get(resolvedProviderId);
  if (!provider) {
    return {
      ok: false,
      code: 'NOT_IMPLEMENTED_OCR_PROVIDER',
      message: `OCR provider "${resolvedProviderId}" is not available yet.`,
      providerId: resolvedProviderId,
      activeMode
    };
  }

  return {
    ok: true,
    provider,
    providerId: resolvedProviderId,
    activeMode
  };
}

export function listOcrProviders(): string[] {
  ensureBuiltinsRegistered();
  return Array.from(providers.keys());
}

export function clearOcrProviders(): void {
  providers.clear();
  builtinsRegistered = false;
}
