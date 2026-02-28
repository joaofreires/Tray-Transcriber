import { beforeEach, describe, expect, it, vi } from 'vitest';

const { configRef } = vi.hoisted(() => ({
  configRef: {
    ocr: {
      mode: 'llm_vision'
    }
  } as any
}));

vi.mock('../ctx.js', () => ({
  config: configRef
}));

import {
  clearOcrProviders,
  getActiveOcrProviderId,
  resolveOcrProvider,
  type OcrProviderResolutionResult
} from '../shortcuts/ocr-providers.js';

describe('ocr provider resolution', () => {
  beforeEach(() => {
    clearOcrProviders();
    configRef.ocr = { mode: 'llm_vision' };
  });

  it('resolves active provider when provider id is blank', () => {
    const resolved = resolveOcrProvider('');
    expect(getActiveOcrProviderId()).toBe('llm_vision');
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.providerId).toBe('llm_vision');
    }
  });

  it('returns OCR_PROVIDER_DISABLED for provider incompatible with current mode', () => {
    const resolved: OcrProviderResolutionResult = resolveOcrProvider('local_tesseract');
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      const failure = resolved as Extract<OcrProviderResolutionResult, { ok: false }>;
      expect(failure.code).toBe('OCR_PROVIDER_DISABLED');
    }
  });

  it('resolves local_tesseract provider when local mode is active', () => {
    configRef.ocr = { mode: 'local_tesseract' };
    const resolved = resolveOcrProvider('');
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.providerId).toBe('local_tesseract');
    }
  });

  it('returns NOT_IMPLEMENTED_OCR_PROVIDER for unknown provider id', () => {
    const resolved: OcrProviderResolutionResult = resolveOcrProvider('unknown_provider');
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      const failure = resolved as Extract<OcrProviderResolutionResult, { ok: false }>;
      expect(failure.code).toBe('NOT_IMPLEMENTED_OCR_PROVIDER');
    }
  });
});
