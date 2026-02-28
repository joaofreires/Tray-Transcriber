import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  spawnMock,
  writeTextMock,
  readTextMock,
  configRef
} = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  writeTextMock: vi.fn(),
  readTextMock: vi.fn(),
  configRef: { pasteMode: 'paste' }
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock
}));

vi.mock('../ctx.js', () => ({
  config: configRef,
  clipboard: {
    writeText: writeTextMock,
    readText: readTextMock
  }
}));

function spawnProcess(status: number, stdout = '', stderr = ''): any {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  queueMicrotask(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', status);
  });

  return proc;
}

const originalSessionType = process.env.XDG_SESSION_TYPE;
const originalDisplay = process.env.DISPLAY;
const originalWaylandDisplay = process.env.WAYLAND_DISPLAY;

beforeEach(() => {
  vi.resetModules();
  spawnMock.mockReset();
  writeTextMock.mockReset();
  readTextMock.mockReset();
  configRef.pasteMode = 'paste';
});

afterEach(() => {
  if (typeof originalSessionType === 'undefined') delete process.env.XDG_SESSION_TYPE;
  else process.env.XDG_SESSION_TYPE = originalSessionType;

  if (typeof originalDisplay === 'undefined') delete process.env.DISPLAY;
  else process.env.DISPLAY = originalDisplay;

  if (typeof originalWaylandDisplay === 'undefined') delete process.env.WAYLAND_DISPLAY;
  else process.env.WAYLAND_DISPLAY = originalWaylandDisplay;
});

describe('paste backend routing', () => {
  it('uses xdotool directly on x11 and skips wtype', async () => {
    process.env.XDG_SESSION_TYPE = 'x11';
    process.env.DISPLAY = ':1';
    delete process.env.WAYLAND_DISPLAY;

    spawnMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'xdotool') return spawnProcess(0, '/usr/bin/xdotool\n');
      if (cmd === 'xdotool') return spawnProcess(0);
      if (cmd === 'which' && args[0] === 'wtype') return spawnProcess(0, '/usr/bin/wtype\n');
      return spawnProcess(1, '', 'not found');
    });

    const { tryPasteViaSystem } = await import('../paste.js');
    const result = await tryPasteViaSystem();

    expect(result).toEqual({ ok: true, method: 'xdotool' });
    expect(spawnMock.mock.calls.some(([cmd]) => cmd === 'wtype')).toBe(false);
  });

  it('tries wtype first on wayland and falls back to xdotool when DISPLAY is available', async () => {
    process.env.XDG_SESSION_TYPE = 'wayland';
    process.env.WAYLAND_DISPLAY = 'wayland-0';
    process.env.DISPLAY = ':1';

    spawnMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'wtype') return spawnProcess(0, '/usr/bin/wtype\n');
      if (cmd === 'wtype') return spawnProcess(1, '', 'wayland connection failed');
      if (cmd === 'which' && args[0] === 'xdotool') return spawnProcess(0, '/usr/bin/xdotool\n');
      if (cmd === 'xdotool') return spawnProcess(0);
      return spawnProcess(1, '', 'not found');
    });

    const { tryPasteViaSystem } = await import('../paste.js');
    const result = await tryPasteViaSystem();

    expect(result).toEqual({ ok: true, method: 'xdotool' });
    const calls = spawnMock.mock.calls.map(([cmd]) => cmd);
    expect(calls.indexOf('wtype')).toBeGreaterThan(-1);
    expect(calls.indexOf('xdotool')).toBeGreaterThan(calls.indexOf('wtype'));
  });

  it('returns structured failure on wayland when wtype is unavailable and x11 fallback is not appropriate', async () => {
    process.env.XDG_SESSION_TYPE = 'wayland';
    process.env.WAYLAND_DISPLAY = 'wayland-0';
    delete process.env.DISPLAY;

    spawnMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'wtype') return spawnProcess(1, '', 'not found');
      return spawnProcess(1, '', 'not found');
    });

    const { tryPasteViaSystem } = await import('../paste.js');
    const result = await tryPasteViaSystem();

    expect(result.ok).toBe(false);
    expect(result.reason || '').toContain('wtype not found');
    expect(spawnMock.mock.calls.some(([cmd]) => cmd === 'xdotool')).toBe(false);
  });
});
