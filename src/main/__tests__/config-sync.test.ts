import { describe, expect, it, vi } from 'vitest';
import {
  broadcastConfigChanged,
  getChangedConfigPaths,
  isShortcutOnlyUpdate,
  shouldRestartWorkerForConfigChanges
} from '../config-sync.js';

describe('config sync helpers', () => {
  it('collects nested changed keys as dot paths', () => {
    const previous = {
      providers: {
        stt: { activeProviderId: 'stt.local.whisperx' },
        llm: { activeProviderId: 'llm.openai_compatible' }
      },
      cursorBusy: false
    };
    const next = {
      providers: {
        stt: { activeProviderId: 'stt.local.whisperx' },
        llm: { activeProviderId: 'llm.ollama' }
      },
      cursorBusy: true
    };

    const changed = getChangedConfigPaths(previous, next);
    expect(changed).toContain('providers.llm.activeProviderId');
    expect(changed).toContain('cursorBusy');
  });

  it('flags shortcut-only updates', () => {
    expect(isShortcutOnlyUpdate(['shortcuts', 'shortcutDefaults.textOutputMode'])).toBe(true);
    expect(isShortcutOnlyUpdate(['shortcuts', 'providers.llm.activeProviderId'])).toBe(false);
  });

  it('restarts worker only for runtime-sensitive paths', () => {
    expect(shouldRestartWorkerForConfigChanges(['cursorBusy'])).toBe(false);
    expect(shouldRestartWorkerForConfigChanges(['providers.stt.activeProviderId'])).toBe(true);
    expect(shouldRestartWorkerForConfigChanges(['workerHost'])).toBe(true);
  });

  it('broadcasts config changes to non-destroyed windows only', () => {
    const sendLive = vi.fn();
    const sendDead = vi.fn();
    const payload = {
      changedKeys: ['providers.llm.activeProviderId'],
      config: { providers: { llm: { activeProviderId: 'llm.ollama' } } }
    };

    const liveWindow = {
      isDestroyed: () => false,
      webContents: { send: sendLive }
    };
    const deadWindow = {
      isDestroyed: () => true,
      webContents: { send: sendDead }
    };

    broadcastConfigChanged([liveWindow, deadWindow, null], payload);

    expect(sendLive).toHaveBeenCalledWith('config-changed', payload);
    expect(sendDead).not.toHaveBeenCalled();
  });
});
