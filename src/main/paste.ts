import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { config, clipboard } from './ctx.js';
const require = createRequire(import.meta.url);

// ── System-level paste ────────────────────────────────────────────────────────

function hasCmd(cmd: string): boolean {
  return spawnSync('which', [cmd]).status === 0;
}

function isWayland(): boolean {
  return process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;
}

export function tryPasteViaSystem(): boolean {
  if (process.platform === 'darwin') {
    const r = spawnSync('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down']);
    if (r.status !== 0) console.warn('[paste] osascript failed:', r.stderr?.toString() || r.status);
    else console.log('[paste] osascript succeeded');
    return r.status === 0;
  }
  if (process.platform === 'win32') {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', '$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys("^v")']);
    if (r.status !== 0) console.warn('[paste] powershell failed:', r.stderr?.toString() || r.status);
    else console.log('[paste] powershell succeeded');
    return r.status === 0;
  }
  if (hasCmd('wtype')) {
    const r = spawnSync('wtype', ['-M', 'ctrl', 'v', '-m', 'ctrl']);
    if (r.status !== 0) console.warn('[paste] wtype failed:', r.stderr?.toString() || r.status);
    else console.log('[paste] wtype succeeded');
    if (r.status === 0) return true;
  }
  if (isWayland() && !hasCmd('wtype')) console.warn('[paste] Wayland session but wtype not found');
  if (!hasCmd('xdotool')) { console.warn('[paste] xdotool not found'); return false; }
  const r = spawnSync('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
  if (r.status !== 0) console.warn('[paste] xdotool failed:', r.stderr?.toString() || r.status);
  else console.log('[paste] xdotool succeeded');
  return r.status === 0;
}

export function tryPaste(text: string): boolean {
  clipboard.writeText(text || '');
  if (config?.pasteMode !== 'paste') return false;

  if (tryPasteViaSystem()) return true;

  // Avoid robotjs on macOS when accessibility may be disabled.
  if (process.platform === 'darwin') return false;

  try {
    const robot = require('robotjs');
    robot.keyTap('v', 'control');
    console.log('[paste] robotjs succeeded');
    return true;
  } catch (err: any) {
    console.warn('[paste] robotjs failed:', err?.message ?? err);
    return false;
  }
}

// ── System-level copy ─────────────────────────────────────────────────────────

export function tryCopyViaSystem(): boolean {
  if (process.platform === 'darwin') {
    const r = spawnSync('osascript', ['-e', 'tell application "System Events" to keystroke "c" using command down']);
    if (r.status !== 0) console.warn('[copy] osascript failed:', r.stderr?.toString() || r.status);
    else console.log('[copy] osascript succeeded');
    return r.status === 0;
  }
  if (process.platform === 'win32') {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', '$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys("^c")']);
    if (r.status !== 0) console.warn('[copy] powershell failed:', r.stderr?.toString() || r.status);
    else console.log('[copy] powershell succeeded');
    return r.status === 0;
  }
  if (hasCmd('wtype')) {
    const r = spawnSync('wtype', ['-M', 'ctrl', 'c', '-m', 'ctrl']);
    if (r.status !== 0) console.warn('[copy] wtype failed:', r.stderr?.toString() || r.status);
    else console.log('[copy] wtype succeeded');
    if (r.status === 0) return true;
  }
  if (isWayland() && !hasCmd('wtype')) console.warn('[copy] Wayland session but wtype not found');
  if (!hasCmd('xdotool')) { console.warn('[copy] xdotool not found'); return false; }
  const r = spawnSync('xdotool', ['key', '--clearmodifiers', 'ctrl+c']);
  if (r.status !== 0) console.warn('[copy] xdotool failed:', r.stderr?.toString() || r.status);
  else console.log('[copy] xdotool succeeded');
  return r.status === 0;
}

export async function getSelectedText(): Promise<string> {
  // Try primary X selection first (Linux).
  try {
    const sel = clipboard.readText('selection');
    if (sel?.trim()) return sel;
  } catch (_) {}
  // Fall back to Ctrl+C copy and read.
  if (tryCopyViaSystem()) {
    await new Promise((r) => setTimeout(r, 50));
    return clipboard.readText() || '';
  }
  return '';
}
