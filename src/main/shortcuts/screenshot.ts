import { spawn } from 'node:child_process';
import { desktopCapturer, nativeImage, screen } from '../ctx.js';
import type { ScreenshotMode } from './schema.js';
import { selectRegionOnDisplay, type RegionBounds } from './region-overlay.js';
import { selectScreenshotMode } from './screenshot-mode-picker.js';

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  reason?: string;
};

type ActiveWindowHint = {
  windowId?: number;
  title?: string;
  appName?: string;
};

export type ScreenshotCaptureErrorCode =
  | 'SCREENSHOT_CAPTURE_FAILED'
  | 'SCREENSHOT_SELECTION_CANCELLED'
  | 'SCREENSHOT_ACTIVE_WINDOW_NOT_FOUND';

export class ScreenshotCaptureError extends Error {
  code: ScreenshotCaptureErrorCode;

  constructor(code: ScreenshotCaptureErrorCode, message: string) {
    super(message);
    this.name = 'ScreenshotCaptureError';
    this.code = code;
  }
}

function runCommand(cmd: string, args: string[], timeoutMs = 4000): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, Math.max(500, timeoutMs));

    child.stdout?.on('data', (chunk) => { stdout += String(chunk || ''); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk || ''); });

    child.on('error', (err: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        reason: err?.message || String(err)
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = stdout.trim();
      const err = stderr.trim();
      if (timedOut) {
        resolve({
          ok: false,
          stdout: out,
          stderr: err,
          reason: `Timed out after ${timeoutMs}ms`
        });
        return;
      }
      resolve({
        ok: code === 0,
        stdout: out,
        stderr: err,
        reason: code === 0 ? undefined : err || `exit ${code ?? 'null'}`
      });
    });
  });
}

function ensureDesktopApis(): void {
  if (!desktopCapturer || !screen || !nativeImage) {
    throw new ScreenshotCaptureError('SCREENSHOT_CAPTURE_FAILED', 'Electron desktop capture APIs are unavailable.');
  }
}

function getCursorDisplay(): any {
  const cursorPoint = screen.getCursorScreenPoint?.() || { x: 0, y: 0 };
  return screen.getDisplayNearestPoint?.(cursorPoint) || screen.getPrimaryDisplay?.();
}

async function getScreenSourceForDisplay(display: any): Promise<any> {
  const width = Math.max(1, Math.round((display?.bounds?.width || 1) * (display?.scaleFactor || 1)));
  const height = Math.max(1, Math.round((display?.bounds?.height || 1) * (display?.scaleFactor || 1)));

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height }
  });

  const displayId = String(display?.id ?? '');
  return (
    sources.find((source: any) => String(source.display_id || '') === displayId) ||
    sources.find((source: any) => String(source.id || '').startsWith(`screen:${displayId}:`)) ||
    sources[0]
  );
}

function parseWindowIdFromSourceId(sourceId: string): number | null {
  const match = String(sourceId || '').match(/^window:([^:]+):/i);
  if (!match) return null;
  const raw = match[1];
  if (!raw) return null;
  if (/^0x/i.test(raw)) {
    const parsedHex = Number.parseInt(raw, 16);
    return Number.isFinite(parsedHex) ? parsedHex : null;
  }
  if (/^\d+$/.test(raw)) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsedGeneric = Number.parseInt(raw, 16);
  return Number.isFinite(parsedGeneric) ? parsedGeneric : null;
}

function findWindowSourceById(sources: any[], windowId: number): any | null {
  const dec = String(windowId);
  const hex = windowId.toString(16).toLowerCase();
  for (const source of sources) {
    const parsed = parseWindowIdFromSourceId(source.id);
    if (parsed === windowId) return source;
    const match = String(source.id || '').match(/^window:([^:]+):/i);
    const raw = match?.[1] ? String(match[1]).replace(/^0x/i, '').toLowerCase() : '';
    if (raw === dec || raw === hex) return source;
  }
  return null;
}

async function resolveActiveWindowHint(): Promise<ActiveWindowHint> {
  if (process.platform === 'linux') {
    const result = await runCommand('xdotool', ['getactivewindow']);
    if (!result.ok || !result.stdout) return {};
    const parsed = Number.parseInt(result.stdout.trim(), 10);
    return Number.isFinite(parsed) ? { windowId: parsed } : {};
  }

  if (process.platform === 'darwin') {
    const appResult = await runCommand('osascript', ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true']);
    const titleResult = await runCommand('osascript', ['-e', 'tell application "System Events" to tell (first process whose frontmost is true) to get name of front window']);
    return {
      appName: appResult.ok ? appResult.stdout : '',
      title: titleResult.ok ? titleResult.stdout : ''
    };
  }

  if (process.platform === 'win32') {
    const script = [
      '$signature = \'[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();\'',
      'Add-Type -MemberDefinition $signature -Name Win32User32 -Namespace Win32Functions -ErrorAction SilentlyContinue | Out-Null',
      '$hwnd = [Win32Functions.Win32User32]::GetForegroundWindow()',
      '$title = (Get-Process | Where-Object { $_.MainWindowHandle -eq [int64]$hwnd } | Select-Object -ExpandProperty MainWindowTitle -First 1)',
      'Write-Output "$([int64]$hwnd)|$title"'
    ].join('; ');
    const result = await runCommand('powershell', ['-NoProfile', '-Command', script], 5000);
    if (!result.ok || !result.stdout) return {};
    const [rawId, rawTitle] = result.stdout.split('|');
    const parsed = Number.parseInt(String(rawId || '').trim(), 10);
    return {
      windowId: Number.isFinite(parsed) ? parsed : undefined,
      title: String(rawTitle || '').trim()
    };
  }

  return {};
}

function findWindowSourceByTitle(sources: any[], hint: ActiveWindowHint): any | null {
  const title = String(hint.title || '').trim().toLowerCase();
  const appName = String(hint.appName || '').trim().toLowerCase();
  if (!title && !appName) return null;

  const score = (name: string): number => {
    const lower = name.toLowerCase();
    let points = 0;
    if (title && lower === title) points += 5;
    if (title && lower.includes(title)) points += 3;
    if (appName && lower.includes(appName)) points += 2;
    return points;
  };

  let best: { source: any; score: number } | null = null;
  for (const source of sources) {
    const sourceScore = score(String(source?.name || ''));
    if (!sourceScore) continue;
    if (!best || sourceScore > best.score) {
      best = { source, score: sourceScore };
    }
  }

  return best?.source || null;
}

function normalizeRegion(bounds: RegionBounds, limit: { width: number; height: number }): RegionBounds {
  const x = Math.max(0, Math.min(Math.round(bounds.x), limit.width - 1));
  const y = Math.max(0, Math.min(Math.round(bounds.y), limit.height - 1));
  const width = Math.max(1, Math.min(Math.round(bounds.width), limit.width - x));
  const height = Math.max(1, Math.min(Math.round(bounds.height), limit.height - y));
  return { x, y, width, height };
}

export async function captureFullScreen(): Promise<Buffer> {
  ensureDesktopApis();
  const display = getCursorDisplay();
  if (!display) {
    throw new ScreenshotCaptureError('SCREENSHOT_CAPTURE_FAILED', 'No display available for full_screen capture.');
  }
  const source = await getScreenSourceForDisplay(display);
  if (!source || source.thumbnail?.isEmpty?.()) {
    throw new ScreenshotCaptureError('SCREENSHOT_CAPTURE_FAILED', 'Could not read screen thumbnail for full_screen capture.');
  }
  return source.thumbnail.toPNG();
}

export async function captureActiveWindow(): Promise<Buffer> {
  ensureDesktopApis();
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1920, height: 1080 },
    fetchWindowIcons: false
  });

  if (!Array.isArray(sources) || !sources.length) {
    throw new ScreenshotCaptureError('SCREENSHOT_ACTIVE_WINDOW_NOT_FOUND', 'No window capture sources available.');
  }

  const hint = await resolveActiveWindowHint();
  let matched: any | null = null;
  if (typeof hint.windowId === 'number') {
    matched = findWindowSourceById(sources, hint.windowId);
  }
  if (!matched) {
    matched = findWindowSourceByTitle(sources, hint);
  }

  if (!matched || matched.thumbnail?.isEmpty?.()) {
    throw new ScreenshotCaptureError(
      'SCREENSHOT_ACTIVE_WINDOW_NOT_FOUND',
      'Could not resolve active window source for capture.'
    );
  }

  return matched.thumbnail.toPNG();
}

export async function captureRegion(): Promise<Buffer> {
  ensureDesktopApis();
  const display = getCursorDisplay();
  if (!display) {
    throw new ScreenshotCaptureError('SCREENSHOT_CAPTURE_FAILED', 'No display available for region capture.');
  }

  const source = await getScreenSourceForDisplay(display);
  if (!source || source.thumbnail?.isEmpty?.()) {
    throw new ScreenshotCaptureError('SCREENSHOT_CAPTURE_FAILED', 'Could not capture base image for region selection.');
  }

  const selected = await selectRegionOnDisplay(display.bounds, 30000);
  if (!selected) {
    throw new ScreenshotCaptureError('SCREENSHOT_SELECTION_CANCELLED', 'Region capture was cancelled.');
  }

  const fullImage = nativeImage.createFromBuffer(source.thumbnail.toPNG());
  const fullSize = fullImage.getSize();
  const displayBounds = display.bounds || { width: fullSize.width, height: fullSize.height };
  const scaleX = fullSize.width / Math.max(1, Number(displayBounds.width || fullSize.width));
  const scaleY = fullSize.height / Math.max(1, Number(displayBounds.height || fullSize.height));

  const scaled = normalizeRegion(
    {
      x: selected.x * scaleX,
      y: selected.y * scaleY,
      width: selected.width * scaleX,
      height: selected.height * scaleY
    },
    { width: fullSize.width, height: fullSize.height }
  );

  try {
    const cropped = fullImage.crop(scaled);
    if (!cropped || cropped.isEmpty?.()) {
      throw new Error('empty crop result');
    }
    return cropped.toPNG();
  } catch (err: any) {
    throw new ScreenshotCaptureError(
      'SCREENSHOT_CAPTURE_FAILED',
      `Region crop failed: ${err?.message || String(err)}`
    );
  }
}

export async function captureScreenshot(mode: ScreenshotMode): Promise<Buffer> {
  let resolvedMode = mode;
  if (mode === 'choose_each_time') {
    const selectedMode = await selectScreenshotMode();
    if (!selectedMode) {
      throw new ScreenshotCaptureError('SCREENSHOT_SELECTION_CANCELLED', 'Screenshot mode selection was cancelled.');
    }
    resolvedMode = selectedMode;
  }

  if (resolvedMode === 'full_screen') return captureFullScreen();
  if (resolvedMode === 'active_window') return captureActiveWindow();
  return captureRegion();
}
