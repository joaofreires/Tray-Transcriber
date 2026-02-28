import { describe, expect, it } from 'vitest';
import { captureHotkeyFromEvent } from '../components/hotkey-accelerator';

function keyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides
  } as KeyboardEvent;
}

describe('hotkey-accelerator', () => {
  it('converts a valid combo to normalized accelerator format', () => {
    const result = captureHotkeyFromEvent(
      keyEvent({ key: 'p', ctrlKey: true, shiftKey: true }),
      { isMac: false }
    );

    expect(result.kind).toBe('set');
    if (result.kind !== 'set') return;
    expect(result.accelerator).toBe('Control+Shift+P');
    expect(result.display).toBe('Control + Shift + P');
  });

  it('accepts function keys', () => {
    const result = captureHotkeyFromEvent(keyEvent({ key: 'F1', ctrlKey: true }), { isMac: false });

    expect(result.kind).toBe('set');
    if (result.kind !== 'set') return;
    expect(result.accelerator).toBe('Control+F1');
  });

  it('accepts punctuation keys and normalizes to named tokens', () => {
    const result = captureHotkeyFromEvent(keyEvent({ key: ';', code: 'Semicolon', ctrlKey: true }), { isMac: false });

    expect(result.kind).toBe('set');
    if (result.kind !== 'set') return;
    expect(result.accelerator).toBe('Control+Semicolon');
    expect(result.display).toBe('Control + ;');
  });

  it('accepts PrintScreen', () => {
    const result = captureHotkeyFromEvent(
      keyEvent({ key: 'PrintScreen', code: 'PrintScreen', ctrlKey: true }),
      { isMac: false }
    );

    expect(result.kind).toBe('set');
    if (result.kind !== 'set') return;
    expect(result.accelerator).toBe('Control+PrintScreen');
    expect(result.display).toBe('Control + PrintScreen');
  });

  it('accepts bare PrintScreen without modifiers', () => {
    const result = captureHotkeyFromEvent(
      keyEvent({ key: 'PrintScreen', code: 'PrintScreen' }),
      { isMac: false }
    );

    expect(result.kind).toBe('set');
    if (result.kind !== 'set') return;
    expect(result.accelerator).toBe('PrintScreen');
    expect(result.display).toBe('PrintScreen');
  });

  it('accepts numeric keys', () => {
    const result = captureHotkeyFromEvent(keyEvent({ key: '2', ctrlKey: true, altKey: true }), { isMac: false });

    expect(result.kind).toBe('set');
    if (result.kind !== 'set') return;
    expect(result.accelerator).toBe('Control+Alt+2');
  });

  it('returns cancel for Escape without modifiers', () => {
    const result = captureHotkeyFromEvent(keyEvent({ key: 'Escape' }), { isMac: false });
    expect(result).toEqual({ kind: 'cancel' });
  });

  it('returns clear for Backspace without modifiers', () => {
    const result = captureHotkeyFromEvent(keyEvent({ key: 'Backspace' }), { isMac: false });
    expect(result).toEqual({ kind: 'clear' });
  });

  it('rejects modifier-only key combos', () => {
    const result = captureHotkeyFromEvent(keyEvent({ key: 'Control', ctrlKey: true }), { isMac: false });

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toContain('non-modifier');
  });

  it('requires at least one modifier key', () => {
    const result = captureHotkeyFromEvent(keyEvent({ key: 'p' }), { isMac: false });

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toContain('at least one modifier');
  });

  it('rejects unsupported keys', () => {
    const result = captureHotkeyFromEvent(keyEvent({ key: 'MediaPlayPause', ctrlKey: true }), { isMac: false });

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toContain('Unsupported key');
  });
});
