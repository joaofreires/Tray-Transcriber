import type {
  ShortcutDefinition,
  ShortcutDefaults,
  ShortcutStep,
  TextOutputMode
} from './schema.js';

function sanitizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function makeShortcutId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function normalizeLegacyOutputMode(pasteMode: unknown): TextOutputMode {
  return String(pasteMode || '').trim() === 'paste' ? 'paste_then_clipboard' : 'clipboard_only';
}

export function buildShortcutDefaultsFromLegacy(raw: any): ShortcutDefaults {
  return {
    assistantInputMode: 'prompt_plus_selection',
    textOutputMode: normalizeLegacyOutputMode(raw?.pasteMode),
    ocrProviderId: ''
  };
}

export function migrateLegacyRecordingShortcut(raw: any): ShortcutDefinition | null {
  const shortcut = sanitizeString(raw?.hotkey);
  if (!shortcut) return null;

  const mode = raw?.holdToTalk
    ? 'record_hold_to_talk'
    : raw?.pressToTalk
      ? 'record_press_to_talk'
      : 'record_toggle';

  const step: ShortcutStep =
    mode === 'record_hold_to_talk'
      ? { stepType: 'record_hold_to_talk', holdStopOnModifierRelease: !!raw?.holdStopOnModifierRelease }
      : mode === 'record_press_to_talk'
        ? { stepType: 'record_press_to_talk' }
        : { stepType: 'record_toggle' };

  return {
    id: 'recording-main',
    label: 'Recording',
    enabled: true,
    shortcut,
    steps: [step]
  };
}

export function migrateLegacyAssistantShortcuts(raw: any): ShortcutDefinition[] {
  if (!Array.isArray(raw?.assistantShortcuts)) return [];

  const outputMode = normalizeLegacyOutputMode(raw?.pasteMode);
  const migrated: ShortcutDefinition[] = [];

  raw.assistantShortcuts.forEach((entry: any, index: number) => {
    const shortcut = sanitizeString(entry?.shortcut);
    const prompt = sanitizeString(entry?.prompt);
    if (!shortcut || !prompt) return;

    migrated.push({
      id: makeShortcutId('assistant', index),
      label: `Assistant ${index + 1}`,
      enabled: true,
      shortcut,
      steps: [
        { stepType: 'assistant_prompt', prompt, inputMode: 'prompt_plus_selection' },
        { stepType: 'output_text', outputMode }
      ]
    });
  });

  return migrated;
}

export function stripLegacyShortcutKeys<T extends Record<string, unknown>>(config: T): T {
  delete config.hotkey;
  delete config.holdToTalk;
  delete config.pressToTalk;
  delete config.assistantShortcuts;
  delete config.holdStopOnModifierRelease;
  delete config.holdHotkey;
  return config;
}
