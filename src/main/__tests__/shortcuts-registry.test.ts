import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  registerMock,
  unregisterMock,
  clearRecordingRegistrationMock,
  configureRecordingShortcutMock,
  registerHotkeyMock,
  enqueueShortcutExecutionMock,
  clearShortcutExecutionQueueMock
} = vi.hoisted(() => ({
  registerMock: vi.fn(),
  unregisterMock: vi.fn(),
  clearRecordingRegistrationMock: vi.fn(),
  configureRecordingShortcutMock: vi.fn(),
  registerHotkeyMock: vi.fn(),
  enqueueShortcutExecutionMock: vi.fn(),
  clearShortcutExecutionQueueMock: vi.fn()
}));

vi.mock('../ctx.js', () => ({
  globalShortcut: {
    register: registerMock,
    unregister: unregisterMock
  }
}));

vi.mock('../hotkeys.js', () => ({
  clearRecordingRegistration: clearRecordingRegistrationMock,
  configureRecordingShortcut: configureRecordingShortcutMock,
  registerHotkey: registerHotkeyMock
}));

vi.mock('../shortcuts/executor.js', () => ({
  enqueueShortcutExecution: enqueueShortcutExecutionMock,
  clearShortcutExecutionQueue: clearShortcutExecutionQueueMock
}));

import { registerShortcutHandlers } from '../shortcuts/registry.js';

function makeConfig(shortcut: string) {
  return {
    shortcutsVersion: 2,
    shortcutDefaults: {
      assistantInputMode: 'prompt_plus_selection',
      textOutputMode: 'paste_then_clipboard',
      ocrProviderId: ''
    },
    shortcuts: [
      {
        id: 'shortcut-1',
        label: 'Shortcut One',
        enabled: true,
        shortcut,
        steps: [
          { stepType: 'assistant_prompt', prompt: 'Rewrite this' },
          { stepType: 'output_text' }
        ]
      }
    ]
  } as any;
}

describe('registerShortcutHandlers', () => {
  beforeEach(() => {
    registerMock.mockReset();
    unregisterMock.mockReset();
    clearRecordingRegistrationMock.mockReset();
    configureRecordingShortcutMock.mockReset();
    registerHotkeyMock.mockReset();
    enqueueShortcutExecutionMock.mockReset();
    clearShortcutExecutionQueueMock.mockReset();
  });

  it('returns likely reserved issue for PrintScreen registration failure', () => {
    registerMock.mockReturnValue(false);
    const report = registerShortcutHandlers(makeConfig('PrintScreen'));

    expect(report.registeredAccelerators).toEqual([]);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].code).toBe('LIKELY_OS_RESERVED');
    expect(report.issues[0].shortcutId).toBe('shortcut-1');
  });

  it('returns register failed issue for non-PrintScreen registration failure', () => {
    registerMock.mockReturnValue(false);
    const report = registerShortcutHandlers(makeConfig('Control+M'));

    expect(report.registeredAccelerators).toEqual([]);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].code).toBe('REGISTER_FAILED');
  });

  it('reports successful registration when shortcut is available', () => {
    registerMock.mockReturnValue(true);
    const report = registerShortcutHandlers(makeConfig('Control+M'));

    expect(report.issues).toHaveLength(0);
    expect(report.registeredAccelerators).toEqual(['Control+M']);
  });
});
