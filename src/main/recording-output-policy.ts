import { isRecordingStep, type ShortcutDefinition, type TextOutputMode } from './shortcuts/schema.js';

export type RecordingOutputMode = 'paste_then_clipboard' | 'clipboard_only';

function normalizeOutputMode(value: unknown): RecordingOutputMode {
  return value === 'clipboard_only' ? 'clipboard_only' : 'paste_then_clipboard';
}

function getGlobalDefaultMode(config: any): RecordingOutputMode {
  return String(config?.pasteMode || '').trim() === 'paste' ? 'paste_then_clipboard' : 'clipboard_only';
}

function getShortcutDefaultMode(config: any): RecordingOutputMode {
  return normalizeOutputMode(config?.shortcutDefaults?.textOutputMode);
}

function findEnabledRecordingShortcut(config: any): ShortcutDefinition | null {
  const shortcuts = Array.isArray(config?.shortcuts) ? config.shortcuts : [];
  for (const shortcut of shortcuts) {
    if (!shortcut?.enabled) continue;
    if (!Array.isArray(shortcut.steps) || !shortcut.steps.length) continue;
    if (isRecordingStep(shortcut.steps[0])) return shortcut as ShortcutDefinition;
  }
  return null;
}

export function resolveRecordingOutputMode(config: any): RecordingOutputMode {
  const globalDefault = getGlobalDefaultMode(config);
  const recordingShortcut = findEnabledRecordingShortcut(config);
  if (!recordingShortcut) return globalDefault;

  const outputStep = (recordingShortcut.steps || []).find((step: any) => step?.stepType === 'output_text') as
    | { stepType: 'output_text'; outputMode?: TextOutputMode }
    | undefined;

  if (!outputStep) return globalDefault;
  if (outputStep.outputMode) return normalizeOutputMode(outputStep.outputMode);
  return getShortcutDefaultMode(config);
}
