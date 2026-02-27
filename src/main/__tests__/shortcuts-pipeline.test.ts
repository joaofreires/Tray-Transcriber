import { describe, expect, it, vi } from 'vitest';

const {
  writeTextMock,
  callLLMMock,
  getSelectedTextMock,
  tryPasteMock,
  recordAssistantExchangeMock,
  captureScreenshotMock,
  resolveOcrProviderMock,
  providerExtractMock
} = vi.hoisted(() => ({
  writeTextMock: vi.fn(),
  callLLMMock: vi.fn(),
  getSelectedTextMock: vi.fn(),
  tryPasteMock: vi.fn(),
  recordAssistantExchangeMock: vi.fn(),
  captureScreenshotMock: vi.fn(),
  resolveOcrProviderMock: vi.fn(),
  providerExtractMock: vi.fn()
}));

vi.mock('../ctx.js', () => ({
  clipboard: {
    writeText: writeTextMock
  }
}));

vi.mock('../assistant.js', () => ({
  callLLM: callLLMMock
}));

vi.mock('../paste.js', () => ({
  getSelectedText: getSelectedTextMock,
  tryPaste: tryPasteMock
}));

vi.mock('../history-store.js', () => ({
  recordAssistantExchange: recordAssistantExchangeMock
}));

vi.mock('../shortcuts/screenshot.js', () => ({
  captureScreenshot: captureScreenshotMock,
  ScreenshotCaptureError: class ScreenshotCaptureError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
}));

vi.mock('../shortcuts/ocr-providers.js', () => ({
  resolveOcrProvider: resolveOcrProviderMock
}));

import { runShortcutPipeline } from '../shortcuts/pipeline.js';

describe('shortcut pipeline', () => {
  it('executes assistant prompt and keeps clipboard as source of truth', async () => {
    writeTextMock.mockReset();
    callLLMMock.mockReset();
    getSelectedTextMock.mockReset();
    tryPasteMock.mockReset();
    recordAssistantExchangeMock.mockReset();

    callLLMMock.mockResolvedValue('Assistant response');
    getSelectedTextMock.mockResolvedValue('selected text');
    tryPasteMock.mockResolvedValue({ ok: true, method: 'xdotool' });
    recordAssistantExchangeMock.mockResolvedValue(undefined);

    const shortcut = {
      id: 'assistant-shortcut',
      label: 'Assistant',
      enabled: true,
      shortcut: 'CommandOrControl+L',
      steps: [
        { stepType: 'assistant_prompt', prompt: 'Rewrite this', inputMode: 'prompt_plus_selection' },
        { stepType: 'output_text', outputMode: 'paste_then_clipboard' }
      ]
    } as any;

    const context = await runShortcutPipeline(shortcut, {
      assistantInputMode: 'prompt_plus_selection',
      textOutputMode: 'paste_then_clipboard',
      ocrProviderId: ''
    });

    expect(callLLMMock).toHaveBeenCalledWith('Rewrite this\n\nselected text');
    expect(tryPasteMock).toHaveBeenCalledWith('Assistant response', { force: true });
    expect(writeTextMock).toHaveBeenCalledTimes(2);
    expect(writeTextMock).toHaveBeenLastCalledWith('Assistant response');
    expect(context.assistantResponse).toBe('Assistant response');
  });

  it('executes screenshot->ocr->output pipeline using resolved OCR provider', async () => {
    writeTextMock.mockReset();
    captureScreenshotMock.mockReset();
    resolveOcrProviderMock.mockReset();
    providerExtractMock.mockReset();

    captureScreenshotMock.mockResolvedValue(Buffer.from('image-bytes'));
    providerExtractMock.mockResolvedValue('OCR text');
    resolveOcrProviderMock.mockReturnValue({
      ok: true,
      provider: {
        id: 'llm_vision',
        extractText: providerExtractMock
      },
      providerId: 'llm_vision',
      activeMode: 'llm_vision'
    });

    const shortcut = {
      id: 'ocr-shortcut',
      label: 'OCR',
      enabled: true,
      shortcut: 'CommandOrControl+Shift+2',
      steps: [
        { stepType: 'screenshot_capture', mode: 'region' },
        { stepType: 'ocr_extract', providerId: '' },
        { stepType: 'output_text', outputMode: 'clipboard_only' }
      ]
    } as any;

    const context = await runShortcutPipeline(shortcut, {
      assistantInputMode: 'prompt_plus_selection',
      textOutputMode: 'paste_then_clipboard',
      ocrProviderId: ''
    });

    expect(captureScreenshotMock).toHaveBeenCalledWith('region');
    expect(resolveOcrProviderMock).toHaveBeenCalled();
    expect(providerExtractMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock).toHaveBeenCalledWith('OCR text');
    expect(context.extractedText).toBe('OCR text');
  });

  it('returns typed runtime error when region selection is cancelled', async () => {
    captureScreenshotMock.mockReset();
    captureScreenshotMock.mockRejectedValue({
      code: 'SCREENSHOT_SELECTION_CANCELLED',
      message: 'cancelled'
    });

    const shortcut = {
      id: 'screenshot-shortcut',
      label: 'Screenshot',
      enabled: true,
      shortcut: 'CommandOrControl+Shift+2',
      steps: [{ stepType: 'screenshot_capture', mode: 'region' }]
    } as any;

    await expect(
      runShortcutPipeline(shortcut, {
        assistantInputMode: 'prompt_plus_selection',
        textOutputMode: 'paste_then_clipboard',
        ocrProviderId: ''
      })
    ).rejects.toMatchObject({ code: 'SCREENSHOT_SELECTION_CANCELLED' });
  });

  it('returns typed runtime error when output_text has no input', async () => {
    const shortcut = {
      id: 'output-only',
      label: 'Output only',
      enabled: true,
      shortcut: 'CommandOrControl+Shift+3',
      steps: [{ stepType: 'output_text', outputMode: 'clipboard_only' }]
    } as any;

    await expect(
      runShortcutPipeline(shortcut, {
        assistantInputMode: 'prompt_plus_selection',
        textOutputMode: 'paste_then_clipboard',
        ocrProviderId: ''
      })
    ).rejects.toMatchObject({ code: 'OUTPUT_TEXT_MISSING_INPUT' });
  });
});
