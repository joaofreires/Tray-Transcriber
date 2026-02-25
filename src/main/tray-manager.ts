import path from 'node:path';
import { nativeImage, config } from './ctx.js';
import { resolveBundledPath } from './resolve.js';
import { getMainState, setMainState } from '../store/main-store.js';

const FALLBACK_ICON_DATA =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAnklEQVRYR+2W0Q3AIAwE3f9r2Y3o0gQx0QmE3AqQYH8tI0SxQmWQw+u0o5gJp5QbA5b6mM4qgF4cS7gQ1z3F8q1Ew8e1UoY4cG4cBv5r8+0oYcY9mY0J8Xz8R6D8wGQp5+8Jc6HkL8Xj7yC2P8G8o+gC5b0bZ2jP2sAAAAASUVORK5CYII=';

function makeIcon(iconPath: string | null): any {
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (icon.isEmpty()) return nativeImage.createFromDataURL(FALLBACK_ICON_DATA);
  return icon;
}

export function buildTrayIcon(): any {
  const icon = makeIcon(resolveBundledPath(path.join('assets', 'tray.png')));
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  return icon;
}

export function buildRecordingIcon(): any {
  const p = resolveBundledPath(path.join('assets', 'tray-recording.png'));
  if (!p) return buildTrayIcon();
  const icon = nativeImage.createFromPath(p);
  if (icon.isEmpty()) return buildTrayIcon();
  // Do NOT set template on macOS so the red color is visible.
  return icon;
}

export function buildBusyFrame(idx: number): any {
  const p = resolveBundledPath(path.join('assets', `tray-busy-${idx + 1}.png`));
  if (!p) return buildTrayIcon();
  const icon = nativeImage.createFromPath(p);
  if (icon.isEmpty()) return buildTrayIcon();
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  return icon;
}

export function getTrayIconPath(kind: 'default' | 'recording' | 'busy', idx = 0): string | null {
  if (kind === 'recording') return resolveBundledPath(path.join('assets', 'tray-recording.png'));
  if (kind === 'busy') return resolveBundledPath(path.join('assets', `tray-busy-${idx + 1}.png`));
  return resolveBundledPath(path.join('assets', 'tray.png'));
}

export function updateTrayIcon(): void {
  const { tray, trayBusy, trayFrameIndex, trayFrames, isRecording } = getMainState();
  if (!tray) return;
  // On Linux/macOS prefer path-based updates (avoids nativeImage re-creation).
  if (process.platform === 'linux' || process.platform === 'darwin') {
    const p = trayBusy
      ? getTrayIconPath('busy', trayFrameIndex)
      : isRecording
        ? getTrayIconPath('recording')
        : getTrayIconPath('default');
    if (p) { tray.setImage(p); return; }
  }
  if (trayBusy && trayFrames.length > 0) {
    tray.setImage(trayFrames[trayFrameIndex]);
  } else if (isRecording) {
    tray.setImage(buildRecordingIcon());
  } else {
    tray.setImage(buildTrayIcon());
  }
}

export function startTrayAnimation(): void {
  const { trayTimer } = getMainState();
  if (trayTimer) return;
  const timer = setInterval(() => {
    const cur = getMainState();
    if (!cur.trayFrames.length) return;
    setMainState({ trayFrameIndex: (cur.trayFrameIndex + 1) % cur.trayFrames.length });
    updateTrayIcon();
  }, 150);
  setMainState({ trayTimer: timer });
}

export function stopTrayAnimation(): void {
  const { trayTimer } = getMainState();
  if (!trayTimer) return;
  clearInterval(trayTimer);
  setMainState({ trayTimer: null, trayFrameIndex: 0 });
  updateTrayIcon();
}

export function setTrayBusy(flag: boolean): void {
  const { trayBusy, tray } = getMainState();
  if (trayBusy === !!flag) return;
  setMainState({ trayBusy: !!flag });
  if (tray) tray.setToolTip(flag ? 'Tray Transcriber – busy…' : 'Tray Transcriber');
  if (flag) startTrayAnimation(); else stopTrayAnimation();

  // if user has requested a visible busy cursor, notify open windows so they
  // can update their document styles. we send through the renderer event and
  // let the web side decide how to apply it (see App.tsx listener).
  if (config?.cursorBusy) {
    const { win, configWin } = getMainState();
    [win, configWin].forEach((w) => {
      if (w && !w.isDestroyed()) w.webContents.send('cursor-busy', !!flag);
    });
  }
}

// Initialise the four busy animation frames into the store.
export function loadBusyFrames(): void {
  setMainState({ trayFrames: [0, 1, 2, 3].map(buildBusyFrame) });
}
