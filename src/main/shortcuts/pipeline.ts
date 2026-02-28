import { clipboard } from '../ctx.js';
import { callLLM } from '../assistant.js';
import { getSelectedText, tryPaste } from '../paste.js';
import { recordAssistantExchange } from '../history-store.js';
import type { ShortcutDefinition, ShortcutStep, ShortcutDefaults } from './schema.js';
import { captureScreenshot, ScreenshotCaptureError } from './screenshot.js';
import { getRuntimeOrchestrator } from '../runtime/runtime-services.js';

export type ShortcutExecutionContext = {
  capturedImage?: Buffer;
  extractedText?: string;
  selectedText?: string;
  assistantResponse?: string;
};

export type ShortcutRuntimeError = {
  code:
    | 'NOT_IMPLEMENTED_OCR_PROVIDER'
    | 'OCR_PROVIDER_DISABLED'
    | 'OCR_MISSING_CAPTURE'
    | 'OUTPUT_TEXT_MISSING_INPUT'
    | 'INVALID_PIPELINE_STEP'
    | 'SCREENSHOT_CAPTURE_FAILED'
    | 'SCREENSHOT_SELECTION_CANCELLED'
    | 'SCREENSHOT_ACTIVE_WINDOW_NOT_FOUND'
    | 'OCR_VISION_REQUEST_FAILED'
    | 'OCR_CLI_UNAVAILABLE'
    | 'OCR_CLI_EXEC_FAILED';
  message: string;
  shortcutId?: string;
  stepType?: string;
};

function asRuntimeError(code: ShortcutRuntimeError['code'], message: string, shortcutId?: string, stepType?: string): ShortcutRuntimeError {
  return { code, message, shortcutId, stepType };
}

function resolveAssistantInputMode(step: Extract<ShortcutStep, { stepType: 'assistant_prompt' }>, defaults: ShortcutDefaults): 'prompt_plus_selection' | 'prompt_only' {
  return step.inputMode === 'prompt_only' ? 'prompt_only' : defaults.assistantInputMode;
}

function resolveOutputMode(step: Extract<ShortcutStep, { stepType: 'output_text' }>, defaults: ShortcutDefaults): 'paste_then_clipboard' | 'clipboard_only' {
  return step.outputMode === 'clipboard_only' ? 'clipboard_only' : defaults.textOutputMode;
}

async function executeAssistantStep(
  shortcut: ShortcutDefinition,
  step: Extract<ShortcutStep, { stepType: 'assistant_prompt' }>,
  defaults: ShortcutDefaults,
  context: ShortcutExecutionContext
): Promise<void> {
  const mode = resolveAssistantInputMode(step, defaults);
  const prompt = step.prompt.trim();

  if (mode === 'prompt_plus_selection') {
    context.selectedText = await getSelectedText();
  }

  const finalPrompt = context.selectedText
    ? prompt
      ? `${prompt}\n\n${context.selectedText}`
      : context.selectedText
    : prompt;

  const response = await callLLM(finalPrompt);
  context.assistantResponse = response;

  if (response) {
    try {
      await recordAssistantExchange({
        prompt: finalPrompt,
        response,
        metadata: {
          source: 'shortcut-pipeline',
          shortcutId: shortcut.id,
          shortcutLabel: shortcut.label
        }
      });
    } catch (err) {
      console.error('[shortcuts] failed to record assistant exchange', err);
    }
  }
}

async function executeOutputStep(
  step: Extract<ShortcutStep, { stepType: 'output_text' }>,
  defaults: ShortcutDefaults,
  context: ShortcutExecutionContext,
  shortcutId: string
): Promise<void> {
  const outputText = (context.assistantResponse || context.extractedText || '').trim();
  if (!outputText) {
    throw asRuntimeError('OUTPUT_TEXT_MISSING_INPUT', 'output_text requires assistant or OCR text in context.', shortcutId, step.stepType);
  }

  const mode = resolveOutputMode(step, defaults);
  clipboard.writeText(outputText);

  if (mode === 'paste_then_clipboard') {
    const pasteResult = await tryPaste(outputText, { force: true });
    if (!pasteResult.ok) {
      console.error('[shortcuts] output paste failed', {
        shortcutId,
        method: pasteResult.method,
        reason: pasteResult.reason
      });
    } else {
      console.log('[shortcuts] output paste succeeded', {
        shortcutId,
        method: pasteResult.method
      });
    }
    // Always restore full response as clipboard source of truth.
    clipboard.writeText(outputText);
  }
}

async function executeScreenshotStep(
  step: Extract<ShortcutStep, { stepType: 'screenshot_capture' }>,
  context: ShortcutExecutionContext,
  shortcutId: string
): Promise<void> {
  try {
    const startedAt = Date.now();
    context.capturedImage = await captureScreenshot(step.mode);
    console.log('[shortcuts] screenshot captured', {
      shortcutId,
      mode: step.mode,
      bytes: context.capturedImage?.byteLength || 0,
      elapsedMs: Date.now() - startedAt
    });
  } catch (err: any) {
    if (err instanceof ScreenshotCaptureError) {
      throw asRuntimeError(err.code, err.message, shortcutId, step.stepType);
    }
    const code = err?.code;
    if (code === 'SCREENSHOT_SELECTION_CANCELLED' || code === 'SCREENSHOT_ACTIVE_WINDOW_NOT_FOUND' || code === 'SCREENSHOT_CAPTURE_FAILED') {
      throw asRuntimeError(code, String(err?.message || err), shortcutId, step.stepType);
    }
    throw asRuntimeError(
      'SCREENSHOT_CAPTURE_FAILED',
      `Screenshot capture failed: ${err?.message || String(err)}`,
      shortcutId,
      step.stepType
    );
  }
}

async function executeOcrStep(
  step: Extract<ShortcutStep, { stepType: 'ocr_extract' }>,
  defaults: ShortcutDefaults,
  context: ShortcutExecutionContext,
  shortcutId: string
): Promise<void> {
  if (!context.capturedImage) {
    throw asRuntimeError('OCR_MISSING_CAPTURE', 'ocr_extract requires capturedImage in context.', shortcutId, step.stepType);
  }

  try {
    const startedAt = Date.now();
    const runtime = getRuntimeOrchestrator();
    const requestedProviderId = (step.providerId || defaults.ocrProviderId || '').trim().toLowerCase();
    if (requestedProviderId) {
      runtime.setActiveProvider('ocr', requestedProviderId);
    }
    context.extractedText = (await runtime.extractOcr({
      image: context.capturedImage,
      languageHint: step.languageHint
    })).trim();

    console.log('[shortcuts] ocr extracted text', {
      shortcutId,
      providerId: requestedProviderId || 'active',
      textLength: context.extractedText.length,
      elapsedMs: Date.now() - startedAt
    });
  } catch (err: any) {
    throw asRuntimeError('OCR_CLI_EXEC_FAILED', `OCR execution failed: ${err?.message || String(err)}`, shortcutId, step.stepType);
  }
}

export async function runShortcutPipeline(shortcut: ShortcutDefinition, defaults: ShortcutDefaults): Promise<ShortcutExecutionContext> {
  const context: ShortcutExecutionContext = {};

  for (const step of shortcut.steps) {
    if (step.stepType === 'record_toggle' || step.stepType === 'record_press_to_talk' || step.stepType === 'record_hold_to_talk') {
      throw asRuntimeError('INVALID_PIPELINE_STEP', `Recording step ${step.stepType} must be handled by recording hotkey registration.`, shortcut.id, step.stepType);
    }

    if (step.stepType === 'screenshot_capture') {
      await executeScreenshotStep(step, context, shortcut.id);
      continue;
    }

    if (step.stepType === 'ocr_extract') {
      await executeOcrStep(step, defaults, context, shortcut.id);
      continue;
    }

    if (step.stepType === 'assistant_prompt') {
      await executeAssistantStep(shortcut, step, defaults, context);
      continue;
    }

    if (step.stepType === 'output_text') {
      await executeOutputStep(step, defaults, context, shortcut.id);
      continue;
    }
  }

  return context;
}
