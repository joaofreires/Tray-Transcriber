import { describe, expect, it } from 'vitest';
import { resolveRecordingOutputMode } from '../recording-output-policy.js';

describe('resolveRecordingOutputMode', () => {
  it('returns global paste mode when no recording output step exists', () => {
    const mode = resolveRecordingOutputMode({
      pasteMode: 'paste',
      shortcuts: [
        {
          id: 'recording-main',
          enabled: true,
          steps: [{ stepType: 'record_hold_to_talk' }]
        }
      ]
    });

    expect(mode).toBe('paste_then_clipboard');
  });

  it('uses recording output_text explicit mode when provided', () => {
    const mode = resolveRecordingOutputMode({
      pasteMode: 'paste',
      shortcuts: [
        {
          id: 'recording-main',
          enabled: true,
          steps: [{ stepType: 'record_hold_to_talk' }, { stepType: 'output_text', outputMode: 'clipboard_only' }]
        }
      ]
    });

    expect(mode).toBe('clipboard_only');
  });

  it('uses shortcutDefaults output mode when recording output_text has no explicit outputMode', () => {
    const mode = resolveRecordingOutputMode({
      pasteMode: 'clipboard',
      shortcutDefaults: { textOutputMode: 'paste_then_clipboard' },
      shortcuts: [
        {
          id: 'recording-main',
          enabled: true,
          steps: [{ stepType: 'record_hold_to_talk' }, { stepType: 'output_text' }]
        }
      ]
    });

    expect(mode).toBe('paste_then_clipboard');
  });

  it('falls back to clipboard mode when paste mode is not enabled and no recording shortcut exists', () => {
    const mode = resolveRecordingOutputMode({
      pasteMode: 'clipboard',
      shortcuts: [
        {
          id: 'assistant-1',
          enabled: true,
          steps: [{ stepType: 'assistant_prompt', prompt: 'x' }, { stepType: 'output_text' }]
        }
      ]
    });

    expect(mode).toBe('clipboard_only');
  });
});
