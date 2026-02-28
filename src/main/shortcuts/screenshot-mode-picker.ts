import { randomUUID } from 'node:crypto';
import { BrowserWindow, ipcMain, screen } from '../ctx.js';

export type RuntimeScreenshotMode = 'region' | 'active_window' | 'full_screen';

function buildPickerHtml(resultChannel: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Screenshot Mode</title>
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        overflow: hidden;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      .frame {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(15, 23, 42, 0.95);
        color: #e2e8f0;
        display: grid;
        grid-template-rows: auto auto;
        padding: 10px;
        gap: 10px;
      }
      .title {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(226, 232, 240, 0.75);
      }
      .actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .mode {
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: rgba(2, 6, 23, 0.85);
        color: #e2e8f0;
        border-radius: 10px;
        padding: 10px 8px;
        font-size: 12px;
        cursor: pointer;
      }
      .mode[data-active="true"] {
        border-color: rgba(52, 211, 153, 0.9);
        background: rgba(16, 185, 129, 0.16);
      }
      .hint {
        font-size: 11px;
        color: rgba(203, 213, 225, 0.72);
      }
    </style>
  </head>
  <body>
    <div class="frame">
      <div class="title">Choose Screenshot Mode</div>
      <div class="actions">
        <button class="mode" data-mode="region" data-index="0">1 • Region</button>
        <button class="mode" data-mode="active_window" data-index="1">2 • Active Window</button>
        <button class="mode" data-mode="full_screen" data-index="2">3 • Full Screen</button>
      </div>
      <div class="hint">Arrow keys move • Enter confirm • Esc cancel</div>
    </div>
    <script>
      const { ipcRenderer } = require('electron');
      const RESULT_CHANNEL = ${JSON.stringify(resultChannel)};
      const buttons = Array.from(document.querySelectorAll('.mode'));
      let activeIndex = 0;

      function setActive(nextIndex) {
        const total = buttons.length;
        activeIndex = ((nextIndex % total) + total) % total;
        buttons.forEach((button, index) => {
          button.setAttribute('data-active', String(index === activeIndex));
        });
      }

      function emit(mode) {
        ipcRenderer.send(RESULT_CHANNEL, { mode });
      }

      buttons.forEach((button, index) => {
        button.addEventListener('mouseenter', () => setActive(index));
        button.addEventListener('click', () => emit(button.getAttribute('data-mode')));
      });

      window.addEventListener('keydown', (event) => {
        const key = String(event.key || '').toLowerCase();
        if (key === 'escape') {
          ipcRenderer.send(RESULT_CHANNEL, { cancelled: true });
          return;
        }
        if (key === 'arrowleft') {
          setActive(activeIndex - 1);
          return;
        }
        if (key === 'arrowright') {
          setActive(activeIndex + 1);
          return;
        }
        if (key === 'enter') {
          const mode = buttons[activeIndex]?.getAttribute('data-mode');
          if (mode) emit(mode);
          return;
        }
        if (key === '1' || key === '2' || key === '3') {
          const index = Number(key) - 1;
          const mode = buttons[index]?.getAttribute('data-mode');
          if (mode) emit(mode);
        }
      });

      setActive(0);
      window.focus();
    </script>
  </body>
</html>`;
}

function getPickerBounds(): { x: number; y: number; width: number; height: number } {
  const width = 420;
  const height = 136;
  const cursorPoint = screen?.getCursorScreenPoint?.() || { x: 0, y: 0 };
  const display = screen?.getDisplayNearestPoint?.(cursorPoint) || screen?.getPrimaryDisplay?.();
  const bounds = display?.bounds || { x: 0, y: 0, width: 1280, height: 720 };
  const x = Math.round(bounds.x + (bounds.width - width) / 2);
  const y = Math.round(bounds.y + (bounds.height - height) / 2);
  return { x, y, width, height };
}

function isRuntimeScreenshotMode(value: unknown): value is RuntimeScreenshotMode {
  return value === 'region' || value === 'active_window' || value === 'full_screen';
}

export async function selectScreenshotMode(timeoutMs = 10000): Promise<RuntimeScreenshotMode | null> {
  if (!BrowserWindow || !ipcMain || !screen) {
    return null;
  }

  const resultChannel = `shortcuts-screenshot-mode-${randomUUID()}`;

  return new Promise((resolve) => {
    let settled = false;
    let pickerWindow: any = null;
    let timeoutHandle: NodeJS.Timeout | null = null;

    const finish = (mode: RuntimeScreenshotMode | null) => {
      if (settled) return;
      settled = true;
      try { ipcMain.removeListener(resultChannel, onResult); } catch (_) {}
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (pickerWindow && !pickerWindow.isDestroyed()) {
        try { pickerWindow.close(); } catch (_) {}
      }
      resolve(mode);
    };

    const onResult = (_event: any, payload: any) => {
      if (payload?.cancelled) {
        finish(null);
        return;
      }
      const mode = payload?.mode;
      if (!isRuntimeScreenshotMode(mode)) {
        finish(null);
        return;
      }
      finish(mode);
    };

    ipcMain.on(resultChannel, onResult);

    const bounds = getPickerBounds();
    pickerWindow = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: true,
      alwaysOnTop: true,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: true,
      focusable: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      }
    });

    pickerWindow.setAlwaysOnTop(true, 'screen-saver');
    pickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    pickerWindow.on('closed', () => finish(null));
    pickerWindow.once('ready-to-show', () => {
      pickerWindow.show();
      pickerWindow.focus();
    });

    timeoutHandle = setTimeout(() => finish(null), Math.max(1000, timeoutMs));
    const html = buildPickerHtml(resultChannel);
    const url = `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
    pickerWindow.loadURL(url).catch(() => finish(null));
  });
}
