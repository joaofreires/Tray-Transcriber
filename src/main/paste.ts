import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { config, clipboard } from './ctx.js';
const require = createRequire(import.meta.url);

// ── System-level paste ────────────────────────────────────────────────────────

type SystemPasteMethod = 'osascript' | 'powershell' | 'wtype' | 'xdotool';
type PasteMethod = SystemPasteMethod | 'robotjs';
type ActionType = 'paste' | 'copy';

export type PasteResult = {
  ok: boolean;
  method?: PasteMethod;
  reason?: string;
};

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number | null;
  reason?: string;
};

const commandAvailabilityCache = new Map<string, boolean>();
let backendInfoLogged = false;

function runCommand(cmd: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    try {
      const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk ?? '');
      });
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk ?? '');
      });

      child.on('error', (err: any) => {
        if (settled) return;
        settled = true;
        resolve({
          ok: false,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          status: null,
          reason: err?.message || String(err)
        });
      });

      child.on('close', (status) => {
        if (settled) return;
        settled = true;
        const out = stdout.trim();
        const err = stderr.trim();
        const ok = status === 0;
        resolve({
          ok,
          stdout: out,
          stderr: err,
          status: typeof status === 'number' ? status : null,
          reason: ok ? undefined : err || `exit ${status ?? 'null'}`
        });
      });
    } catch (err: any) {
      resolve({
        ok: false,
        stdout: '',
        stderr: '',
        status: null,
        reason: err?.message || String(err)
      });
    }
  });
}

async function hasCmd(cmd: string): Promise<boolean> {
  if (commandAvailabilityCache.has(cmd)) {
    return !!commandAvailabilityCache.get(cmd);
  }

  const result = await runCommand('which', [cmd]);
  commandAvailabilityCache.set(cmd, result.ok);
  return result.ok;
}

type LinuxSessionType = 'x11' | 'wayland' | 'unknown';

function detectLinuxSessionType(): LinuxSessionType {
  const raw = String(process.env.XDG_SESSION_TYPE || '').trim().toLowerCase();
  if (raw === 'x11' || raw === 'wayland') return raw;
  if (process.env.WAYLAND_DISPLAY) return 'wayland';
  if (process.env.DISPLAY) return 'x11';
  return 'unknown';
}

function preferredBackend(sessionType: LinuxSessionType): string {
  if (process.platform === 'darwin') return 'osascript';
  if (process.platform === 'win32') return 'powershell';
  if (sessionType === 'x11') return 'xdotool';
  if (sessionType === 'wayland') return 'wtype';
  return 'xdotool';
}

function logBackendInfoOnce(): void {
  if (backendInfoLogged) return;
  backendInfoLogged = true;
  const sessionType = detectLinuxSessionType();
  console.log('[paste] backend routing', {
    platform: process.platform,
    sessionType,
    preferredBackend: preferredBackend(sessionType),
    hasDisplay: !!process.env.DISPLAY,
    hasWaylandDisplay: !!process.env.WAYLAND_DISPLAY
  });
}

async function runSystemAction(method: SystemPasteMethod, action: ActionType): Promise<PasteResult> {
  if (method === 'osascript') {
    const script =
      action === 'paste'
        ? 'tell application "System Events" to keystroke "v" using command down'
        : 'tell application "System Events" to keystroke "c" using command down';
    const result = await runCommand('osascript', ['-e', script]);
    if (!result.ok) return { ok: false, method, reason: result.reason };
    return { ok: true, method };
  }

  if (method === 'powershell') {
    const script =
      action === 'paste'
        ? '$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys("^v")'
        : '$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys("^c")';
    const result = await runCommand('powershell', ['-NoProfile', '-Command', script]);
    if (!result.ok) return { ok: false, method, reason: result.reason };
    return { ok: true, method };
  }

  if (method === 'wtype') {
    const key = action === 'paste' ? 'v' : 'c';
    const result = await runCommand('wtype', ['-M', 'ctrl', key, '-m', 'ctrl']);
    if (!result.ok) return { ok: false, method, reason: result.reason };
    return { ok: true, method };
  }

  const combo = action === 'paste' ? 'ctrl+v' : 'ctrl+c';
  const result = await runCommand('xdotool', ['key', '--clearmodifiers', combo]);
  if (!result.ok) return { ok: false, method, reason: result.reason };
  return { ok: true, method };
}

async function runLinuxAction(action: ActionType): Promise<PasteResult> {
  const sessionType = detectLinuxSessionType();
  const reasons: string[] = [];

  const methods: SystemPasteMethod[] = [];
  if (sessionType === 'x11') {
    methods.push('xdotool');
  } else if (sessionType === 'wayland') {
    methods.push('wtype');
    if (process.env.DISPLAY) methods.push('xdotool');
  } else {
    methods.push('xdotool', 'wtype');
  }

  for (const method of methods) {
    const available = await hasCmd(method);
    if (!available) {
      reasons.push(`${method} not found`);
      continue;
    }

    const result = await runSystemAction(method, action);
    if (result.ok) return result;
    reasons.push(`${method} failed: ${result.reason || 'unknown error'}`);
  }

  return {
    ok: false,
    reason: reasons.length ? reasons.join('; ') : `No ${action} backend available for ${sessionType} session`
  };
}

export async function tryPasteViaSystem(): Promise<PasteResult> {
  logBackendInfoOnce();

  if (process.platform === 'darwin') {
    return runSystemAction('osascript', 'paste');
  }
  if (process.platform === 'win32') {
    return runSystemAction('powershell', 'paste');
  }

  return runLinuxAction('paste');
}

type TryPasteOptions = {
  force?: boolean;
  settleDelayMs?: number;
};

export async function tryPaste(text: string, options?: TryPasteOptions): Promise<PasteResult> {
  const safeText = String(text || '');
  clipboard.writeText(safeText);
  if (!options?.force && config?.pasteMode !== 'paste') {
    return { ok: false, reason: 'paste mode is not enabled' };
  }

  const settleDelayMs = Number.isFinite(options?.settleDelayMs) ? Math.max(0, Number(options?.settleDelayMs)) : 60;
  if (settleDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, settleDelayMs));
  }

  const systemResult = await tryPasteViaSystem();
  if (systemResult.ok) {
    console.log('[paste] %s succeeded', systemResult.method || 'system');
    return systemResult;
  }
  if (systemResult.reason) {
    console.warn('[paste] system paste failed:', systemResult.reason);
  }

  // Avoid robotjs on macOS when accessibility may be disabled.
  if (process.platform === 'darwin') return systemResult;

  try {
    const robot = require('robotjs');
    robot.keyTap('v', 'control');
    console.log('[paste] robotjs succeeded');
    return { ok: true, method: 'robotjs' };
  } catch (err: any) {
    console.warn('[paste] robotjs failed:', err?.message ?? err);
    return {
      ok: false,
      method: 'robotjs',
      reason: systemResult.reason ? `${systemResult.reason}; robotjs failed: ${err?.message ?? err}` : `robotjs failed: ${err?.message ?? err}`
    };
  }
}

// ── System-level copy ─────────────────────────────────────────────────────────

export async function tryCopyViaSystem(): Promise<PasteResult> {
  logBackendInfoOnce();

  if (process.platform === 'darwin') {
    return runSystemAction('osascript', 'copy');
  }
  if (process.platform === 'win32') {
    return runSystemAction('powershell', 'copy');
  }

  return runLinuxAction('copy');
}

export async function getSelectedText(): Promise<string> {
  // Try primary X selection first (Linux).
  try {
    const sel = clipboard.readText('selection');
    if (sel?.trim()) return sel;
  } catch (_) {}
  // Fall back to Ctrl+C copy and read.
  const copyResult = await tryCopyViaSystem();
  if (copyResult.ok) {
    console.log('[copy] %s succeeded', copyResult.method || 'system');
    await new Promise((r) => setTimeout(r, 50));
    return clipboard.readText() || '';
  }
  if (copyResult.reason) {
    console.warn('[copy] failed:', copyResult.reason);
  }
  return '';
}
