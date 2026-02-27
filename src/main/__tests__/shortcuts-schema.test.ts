import { describe, expect, it } from 'vitest';
import { normalizeShortcutConfig, validateShortcuts } from '../shortcuts/schema.js';

describe('shortcut schema normalization', () => {
  it('migrates legacy hotkey + assistantShortcuts into v2 shortcuts config', () => {
    const legacy = {
      hotkey: 'CommandOrControl+Shift+Space',
      holdToTalk: true,
      holdStopOnModifierRelease: true,
      pasteMode: 'paste',
      assistantShortcuts: [{ shortcut: 'CommandOrControl+Shift+L', prompt: 'Rewrite selection' }]
    };

    const result = normalizeShortcutConfig(legacy);
    expect(result.migrated).toBe(true);
    expect(result.normalizedConfig.shortcutsVersion).toBe(2);
    expect(Array.isArray(result.normalizedConfig.shortcuts)).toBe(true);

    const shortcuts = result.normalizedConfig.shortcuts;
    expect(shortcuts.length).toBe(2);
    expect(shortcuts[0].steps[0].stepType).toBe('record_hold_to_talk');
    expect(shortcuts[1].steps[0].stepType).toBe('assistant_prompt');
    expect(shortcuts[1].steps[1].stepType).toBe('output_text');
    if (shortcuts[1].steps[1].stepType === 'output_text') {
      expect(shortcuts[1].steps[1].outputMode).toBe('paste_then_clipboard');
    }

    expect((result.normalizedConfig as any).hotkey).toBeUndefined();
    expect((result.normalizedConfig as any).assistantShortcuts).toBeUndefined();
  });
});

describe('shortcut schema validation', () => {
  it('rejects duplicate enabled shortcut accelerators', () => {
    const validation = validateShortcuts([
      {
        id: 'a',
        label: 'A',
        enabled: true,
        shortcut: 'CommandOrControl+1',
        steps: [{ stepType: 'assistant_prompt', prompt: 'one' }, { stepType: 'output_text' }]
      },
      {
        id: 'b',
        label: 'B',
        enabled: true,
        shortcut: 'CommandOrControl+1',
        steps: [{ stepType: 'assistant_prompt', prompt: 'two' }, { stepType: 'output_text' }]
      }
    ] as any);

    expect(validation.ok).toBe(false);
    expect(validation.errors.some((err) => err.code === 'SHORTCUT_CONFLICT')).toBe(true);
  });

  it('rejects ocr_extract when screenshot_capture is missing', () => {
    const validation = validateShortcuts([
      {
        id: 'ocr-invalid',
        label: 'OCR Invalid',
        enabled: true,
        shortcut: 'CommandOrControl+2',
        steps: [{ stepType: 'ocr_extract' }, { stepType: 'output_text' }]
      }
    ] as any);

    expect(validation.ok).toBe(false);
    expect(validation.errors.some((err) => err.code === 'OCR_REQUIRES_SCREENSHOT')).toBe(true);
  });

  it('accepts choose_each_time screenshot mode', () => {
    const normalized = normalizeShortcutConfig({
      shortcuts: [
        {
          id: 'chooser',
          label: 'Chooser',
          enabled: true,
          shortcut: 'CommandOrControl+6',
          steps: [
            { stepType: 'screenshot_capture', mode: 'choose_each_time' },
            { stepType: 'ocr_extract' },
            { stepType: 'output_text' }
          ]
        }
      ]
    } as any);

    expect(normalized.validation.ok).toBe(true);
    const step = (normalized.normalizedConfig.shortcuts[0].steps[0] as any);
    expect(step.mode).toBe('choose_each_time');
  });

  it('rejects non-record pipelines that do not end with output_text', () => {
    const validation = validateShortcuts([
      {
        id: 'bad-terminal',
        label: 'Bad Terminal',
        enabled: true,
        shortcut: 'CommandOrControl+3',
        steps: [{ stepType: 'assistant_prompt', prompt: 'x' }]
      }
    ] as any);

    expect(validation.ok).toBe(false);
    expect(validation.errors.some((err) => err.code === 'PIPELINE_TERMINAL_REQUIRED')).toBe(true);
  });

  it('allows only one enabled recording shortcut', () => {
    const validation = validateShortcuts([
      {
        id: 'rec-1',
        label: 'Rec 1',
        enabled: true,
        shortcut: 'CommandOrControl+4',
        steps: [{ stepType: 'record_toggle' }]
      },
      {
        id: 'rec-2',
        label: 'Rec 2',
        enabled: true,
        shortcut: 'CommandOrControl+5',
        steps: [{ stepType: 'record_press_to_talk' }]
      }
    ] as any);

    expect(validation.ok).toBe(false);
    expect(validation.errors.some((err) => err.code === 'MULTIPLE_RECORDING_SHORTCUTS')).toBe(true);
  });

  it('rejects OCR provider bindings that do not match active OCR mode', () => {
    const normalized = normalizeShortcutConfig({
      ocr: { mode: 'llm_vision' },
      shortcutDefaults: {
        assistantInputMode: 'prompt_plus_selection',
        textOutputMode: 'paste_then_clipboard',
        ocrProviderId: 'local_tesseract'
      },
      shortcuts: [
        {
          id: 'ocr-inactive',
          label: 'OCR inactive',
          enabled: true,
          shortcut: 'CommandOrControl+7',
          steps: [
            { stepType: 'screenshot_capture', mode: 'region' },
            { stepType: 'ocr_extract', providerId: 'local_tesseract' },
            { stepType: 'output_text' }
          ]
        }
      ]
    } as any);

    expect(normalized.validation.ok).toBe(false);
    expect(normalized.validation.errors.some((err) => err.code === 'OCR_PROVIDER_INACTIVE')).toBe(true);
  });
});
