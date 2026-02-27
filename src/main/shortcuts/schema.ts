import {
  buildShortcutDefaultsFromLegacy,
  migrateLegacyAssistantShortcuts,
  migrateLegacyRecordingShortcut,
  stripLegacyShortcutKeys
} from './compat.js';
import {
  normalizeOcrMode,
  normalizeOcrProviderId,
  providerIdForMode
} from '../ocr-schema.js';

export const SHORTCUTS_VERSION = 2;

export type AssistantInputMode = 'prompt_plus_selection' | 'prompt_only';
export type TextOutputMode = 'paste_then_clipboard' | 'clipboard_only';
export type ScreenshotMode = 'region' | 'active_window' | 'full_screen' | 'choose_each_time';

export type ShortcutStep =
  | { stepType: 'record_toggle' }
  | { stepType: 'record_press_to_talk' }
  | { stepType: 'record_hold_to_talk'; holdStopOnModifierRelease?: boolean }
  | { stepType: 'screenshot_capture'; mode: ScreenshotMode }
  | { stepType: 'ocr_extract'; providerId?: string; languageHint?: string }
  | { stepType: 'assistant_prompt'; prompt: string; inputMode?: AssistantInputMode }
  | { stepType: 'output_text'; outputMode?: TextOutputMode };

export type ShortcutDefinition = {
  id: string;
  label: string;
  enabled: boolean;
  shortcut: string;
  steps: ShortcutStep[];
};

export type ShortcutDefaults = {
  assistantInputMode: AssistantInputMode;
  textOutputMode: TextOutputMode;
  ocrProviderId: string;
};

export type ShortcutValidationError = {
  code:
    | 'SHORTCUT_REQUIRED'
    | 'SHORTCUT_CONFLICT'
    | 'MULTIPLE_RECORDING_SHORTCUTS'
    | 'PIPELINE_EMPTY'
    | 'PIPELINE_TERMINAL_REQUIRED'
    | 'RECORDING_PIPELINE_INVALID'
    | 'ASSISTANT_PROMPT_REQUIRED'
    | 'OCR_REQUIRES_SCREENSHOT'
    | 'OUTPUT_TEXT_POSITION_INVALID'
    | 'OCR_PROVIDER_UNKNOWN'
    | 'OCR_PROVIDER_INACTIVE';
  message: string;
  shortcutId?: string;
  field?: string;
  stepIndex?: number;
};

export type ShortcutValidationResult = {
  ok: boolean;
  errors: ShortcutValidationError[];
};

export type ShortcutConfigShape = {
  shortcutsVersion: number;
  shortcutDefaults: ShortcutDefaults;
  shortcuts: ShortcutDefinition[];
};

export type ShortcutNormalizeResult = {
  normalizedConfig: Record<string, unknown> & ShortcutConfigShape;
  validation: ShortcutValidationResult;
  migrated: boolean;
};

const DEFAULT_SHORTCUT_DEFAULTS: ShortcutDefaults = {
  assistantInputMode: 'prompt_plus_selection',
  textOutputMode: 'paste_then_clipboard',
  ocrProviderId: ''
};

function sanitizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDefaults(raw: any): ShortcutDefaults {
  const assistantInputMode = raw?.assistantInputMode === 'prompt_only' ? 'prompt_only' : 'prompt_plus_selection';
  const textOutputMode = raw?.textOutputMode === 'clipboard_only' ? 'clipboard_only' : 'paste_then_clipboard';
  const ocrProviderId = normalizeOcrProviderId(raw?.ocrProviderId);
  return {
    assistantInputMode,
    textOutputMode,
    ocrProviderId
  };
}

function normalizeStep(rawStep: any, defaults: ShortcutDefaults): ShortcutStep | null {
  const stepType = sanitizeString(rawStep?.stepType);
  if (!stepType) return null;

  if (stepType === 'record_toggle') return { stepType };
  if (stepType === 'record_press_to_talk') return { stepType };
  if (stepType === 'record_hold_to_talk') {
    return {
      stepType,
      holdStopOnModifierRelease: !!rawStep?.holdStopOnModifierRelease
    };
  }

  if (stepType === 'screenshot_capture') {
    const mode = rawStep?.mode;
    if (mode === 'active_window' || mode === 'full_screen' || mode === 'choose_each_time') {
      return { stepType, mode };
    }
    return { stepType, mode: 'region' };
  }

  if (stepType === 'ocr_extract') {
    return {
      stepType,
      providerId: normalizeOcrProviderId(rawStep?.providerId),
      languageHint: sanitizeString(rawStep?.languageHint)
    };
  }

  if (stepType === 'assistant_prompt') {
    return {
      stepType,
      prompt: sanitizeString(rawStep?.prompt),
      inputMode: rawStep?.inputMode === 'prompt_only' ? 'prompt_only' : defaults.assistantInputMode
    };
  }

  if (stepType === 'output_text') {
    return {
      stepType,
      outputMode: rawStep?.outputMode === 'clipboard_only' ? 'clipboard_only' : defaults.textOutputMode
    };
  }

  return null;
}

function normalizeShortcut(rawShortcut: any, index: number, defaults: ShortcutDefaults): ShortcutDefinition {
  const steps = Array.isArray(rawShortcut?.steps)
    ? rawShortcut.steps
        .map((step: any) => normalizeStep(step, defaults))
        .filter((step: ShortcutStep | null): step is ShortcutStep => !!step)
    : [];

  return {
    id: sanitizeString(rawShortcut?.id) || `shortcut-${index + 1}`,
    label: sanitizeString(rawShortcut?.label) || `Shortcut ${index + 1}`,
    enabled: rawShortcut?.enabled !== false,
    shortcut: sanitizeString(rawShortcut?.shortcut),
    steps
  };
}

export function isRecordingStep(step: ShortcutStep | undefined): boolean {
  return !!step && (step.stepType === 'record_toggle' || step.stepType === 'record_press_to_talk' || step.stepType === 'record_hold_to_talk');
}

export function validateShortcuts(shortcuts: ShortcutDefinition[]): ShortcutValidationResult {
  const errors: ShortcutValidationError[] = [];
  const acceleratorMap = new Map<string, string>();
  let enabledRecordingShortcuts = 0;

  shortcuts.forEach((shortcut) => {
    if (!shortcut.enabled) return;

    if (!shortcut.shortcut) {
      errors.push({
        code: 'SHORTCUT_REQUIRED',
        message: `Shortcut "${shortcut.label}" is enabled but has no accelerator.`,
        shortcutId: shortcut.id,
        field: 'shortcut'
      });
    } else {
      const key = shortcut.shortcut.toLowerCase();
      const existing = acceleratorMap.get(key);
      if (existing && existing !== shortcut.id) {
        errors.push({
          code: 'SHORTCUT_CONFLICT',
          message: `Shortcut "${shortcut.label}" conflicts with another enabled shortcut.`,
          shortcutId: shortcut.id,
          field: 'shortcut'
        });
      } else {
        acceleratorMap.set(key, shortcut.id);
      }
    }

    const steps = shortcut.steps;
    if (!steps.length) {
      errors.push({
        code: 'PIPELINE_EMPTY',
        message: `Shortcut "${shortcut.label}" has no steps.`,
        shortcutId: shortcut.id,
        field: 'steps'
      });
      return;
    }

    const first = steps[0];
    if (isRecordingStep(first)) {
      enabledRecordingShortcuts += 1;
      if (steps.length !== 1) {
        errors.push({
          code: 'RECORDING_PIPELINE_INVALID',
          message: `Recording shortcut "${shortcut.label}" must contain exactly one recording step.`,
          shortcutId: shortcut.id,
          field: 'steps'
        });
      }
      return;
    }

    let sawScreenshotCapture = false;

    steps.forEach((step, index) => {
      if (step.stepType === 'screenshot_capture') {
        sawScreenshotCapture = true;
      }

      if (step.stepType === 'assistant_prompt' && !sanitizeString(step.prompt)) {
        errors.push({
          code: 'ASSISTANT_PROMPT_REQUIRED',
          message: `Shortcut "${shortcut.label}" has an assistant step without prompt text.`,
          shortcutId: shortcut.id,
          stepIndex: index,
          field: 'prompt'
        });
      }

      if (step.stepType === 'ocr_extract' && !sawScreenshotCapture) {
        errors.push({
          code: 'OCR_REQUIRES_SCREENSHOT',
          message: `Shortcut "${shortcut.label}" runs OCR before screenshot capture.`,
          shortcutId: shortcut.id,
          stepIndex: index,
          field: 'steps'
        });
      }

      if (step.stepType === 'output_text' && index !== steps.length - 1) {
        errors.push({
          code: 'OUTPUT_TEXT_POSITION_INVALID',
          message: `Shortcut "${shortcut.label}" must place output_text as the last step.`,
          shortcutId: shortcut.id,
          stepIndex: index,
          field: 'steps'
        });
      }
    });

    const last = steps[steps.length - 1];
    if (last.stepType !== 'output_text') {
      errors.push({
        code: 'PIPELINE_TERMINAL_REQUIRED',
        message: `Shortcut "${shortcut.label}" must end with output_text unless it is a recording shortcut.`,
        shortcutId: shortcut.id,
        field: 'steps'
      });
      return;
    }

  });

  if (enabledRecordingShortcuts > 1) {
    errors.push({
      code: 'MULTIPLE_RECORDING_SHORTCUTS',
      message: 'Only one enabled recording shortcut is allowed.'
    });
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

const KNOWN_OCR_PROVIDER_IDS = new Set(['llm_vision', 'local_tesseract']);

export function validateOcrProviderBindings(
  shortcuts: ShortcutDefinition[],
  shortcutDefaults: ShortcutDefaults,
  ocrMode: string
): ShortcutValidationResult {
  const errors: ShortcutValidationError[] = [];
  const activeMode = normalizeOcrMode(ocrMode);
  const activeProviderId = providerIdForMode(activeMode);

  if (shortcutDefaults.ocrProviderId) {
    if (!KNOWN_OCR_PROVIDER_IDS.has(shortcutDefaults.ocrProviderId)) {
      errors.push({
        code: 'OCR_PROVIDER_UNKNOWN',
        message: `Default OCR provider "${shortcutDefaults.ocrProviderId}" is not recognized.`,
        field: 'shortcutDefaults.ocrProviderId'
      });
    } else if (shortcutDefaults.ocrProviderId !== activeProviderId) {
      errors.push({
        code: 'OCR_PROVIDER_INACTIVE',
        message: `Default OCR provider "${shortcutDefaults.ocrProviderId}" is inactive for mode "${activeMode}".`,
        field: 'shortcutDefaults.ocrProviderId'
      });
    }
  }

  shortcuts.forEach((shortcut) => {
    if (!shortcut.enabled) return;
    shortcut.steps.forEach((step, stepIndex) => {
      if (step.stepType !== 'ocr_extract' || !step.providerId) return;
      if (!KNOWN_OCR_PROVIDER_IDS.has(step.providerId)) {
        errors.push({
          code: 'OCR_PROVIDER_UNKNOWN',
          message: `Shortcut "${shortcut.label}" uses unknown OCR provider "${step.providerId}".`,
          shortcutId: shortcut.id,
          field: 'providerId',
          stepIndex
        });
        return;
      }
      if (step.providerId !== activeProviderId) {
        errors.push({
          code: 'OCR_PROVIDER_INACTIVE',
          message: `Shortcut "${shortcut.label}" uses OCR provider "${step.providerId}" while active mode is "${activeMode}".`,
          shortcutId: shortcut.id,
          field: 'providerId',
          stepIndex
        });
      }
    });
  });

  return {
    ok: errors.length === 0,
    errors
  };
}

function shouldMigrateLegacy(rawConfig: any): boolean {
  if (!rawConfig || typeof rawConfig !== 'object') return true;
  if (rawConfig.shortcutsVersion === SHORTCUTS_VERSION && Array.isArray(rawConfig.shortcuts)) return false;
  if (Array.isArray(rawConfig.shortcuts)) return true;
  if (rawConfig.hotkey || rawConfig.assistantShortcuts) return true;
  return true;
}

function ensureShortcutList(rawConfig: any, defaults: ShortcutDefaults): ShortcutDefinition[] {
  if (Array.isArray(rawConfig?.shortcuts)) {
    return rawConfig.shortcuts.map((item: any, index: number) => normalizeShortcut(item, index, defaults));
  }

  const migrated: ShortcutDefinition[] = [];
  const recording = migrateLegacyRecordingShortcut(rawConfig);
  if (recording) migrated.push(normalizeShortcut(recording, migrated.length, defaults));

  migrateLegacyAssistantShortcuts(rawConfig).forEach((item) => {
    migrated.push(normalizeShortcut(item, migrated.length, defaults));
  });

  return migrated;
}

export function normalizeShortcutConfig(rawConfig: Record<string, unknown>): ShortcutNormalizeResult {
  const migrateLegacy = shouldMigrateLegacy(rawConfig);
  const defaultsFromLegacy = buildShortcutDefaultsFromLegacy(rawConfig);
  const shortcutDefaults = normalizeDefaults({
    ...DEFAULT_SHORTCUT_DEFAULTS,
    ...(migrateLegacy ? defaultsFromLegacy : {}),
    ...(rawConfig as any)?.shortcutDefaults
  });

  const shortcuts = ensureShortcutList(rawConfig, shortcutDefaults);

  const normalizedConfig = {
    ...(rawConfig as any),
    shortcutsVersion: SHORTCUTS_VERSION,
    shortcutDefaults,
    shortcuts
  } as Record<string, unknown> & ShortcutConfigShape;

  stripLegacyShortcutKeys(normalizedConfig);

  const shortcutValidation = validateShortcuts(shortcuts);
  const ocrValidation = validateOcrProviderBindings(
    shortcuts,
    shortcutDefaults,
    (rawConfig as any)?.ocr?.mode
  );
  const validation: ShortcutValidationResult = {
    ok: shortcutValidation.ok && ocrValidation.ok,
    errors: [...shortcutValidation.errors, ...ocrValidation.errors]
  };

  return {
    normalizedConfig,
    validation,
    migrated: migrateLegacy
  };
}
