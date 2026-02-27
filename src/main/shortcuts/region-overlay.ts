import { randomUUID } from 'node:crypto';
import { BrowserWindow, ipcMain } from '../ctx.js';

export type RegionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function sanitizeBounds(input: RegionBounds): RegionBounds {
  return {
    x: Math.round(input.x),
    y: Math.round(input.y),
    width: Math.max(1, Math.round(input.width)),
    height: Math.max(1, Math.round(input.height))
  };
}

function buildOverlayHtml(resultChannel: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Region Select</title>
    <style>
      html, body, canvas {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        user-select: none;
        cursor: crosshair;
        background: transparent;
      }
      #hint {
        position: fixed;
        left: 16px;
        top: 12px;
        background: rgba(15, 23, 42, 0.75);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 999px;
        padding: 6px 10px;
        font-family: sans-serif;
        font-size: 12px;
        letter-spacing: 0.04em;
      }
    </style>
  </head>
  <body>
    <div id="hint">Drag to select • Enter confirm • Esc cancel</div>
    <canvas id="overlay"></canvas>
    <script>
      const { ipcRenderer } = require('electron');
      const RESULT_CHANNEL = ${JSON.stringify(resultChannel)};
      const canvas = document.getElementById('overlay');
      const ctx = canvas.getContext('2d');

      let dragStart = null;
      let dragEnd = null;

      function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        draw();
      }

      function normalizeRect(start, end) {
        if (!start || !end) return null;
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const width = Math.abs(start.x - end.x);
        const height = Math.abs(start.y - end.y);
        return { x, y, width, height };
      }

      function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const rect = normalizeRect(dragStart, dragEnd);
        if (!rect || rect.width < 1 || rect.height < 1) return;

        ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(rect.x + 1, rect.y + 1, Math.max(1, rect.width - 2), Math.max(1, rect.height - 2));
      }

      function confirmSelection() {
        const rect = normalizeRect(dragStart, dragEnd);
        if (!rect || rect.width < 2 || rect.height < 2) return;
        ipcRenderer.send(RESULT_CHANNEL, {
          cancelled: false,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        });
      }

      window.addEventListener('resize', resize);

      window.addEventListener('mousedown', (event) => {
        dragStart = { x: event.clientX, y: event.clientY };
        dragEnd = { x: event.clientX, y: event.clientY };
        draw();
      });

      window.addEventListener('mousemove', (event) => {
        if (!dragStart) return;
        dragEnd = { x: event.clientX, y: event.clientY };
        draw();
      });

      window.addEventListener('mouseup', () => {
        if (!dragStart) return;
        confirmSelection();
      });

      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          ipcRenderer.send(RESULT_CHANNEL, { cancelled: true });
          return;
        }
        if (event.key === 'Enter') {
          confirmSelection();
        }
      });

      resize();
    </script>
  </body>
</html>`;
}

export async function selectRegionOnDisplay(displayBounds: RegionBounds, timeoutMs = 30000): Promise<RegionBounds | null> {
  if (!BrowserWindow || !ipcMain) {
    return null;
  }

  const bounds = sanitizeBounds(displayBounds);
  const resultChannel = `shortcuts-region-overlay-${randomUUID()}`;

  return new Promise((resolve) => {
    let settled = false;
    let overlayWindow: any = null;
    let timeoutHandle: NodeJS.Timeout | null = null;

    const finish = (result: RegionBounds | null) => {
      if (settled) return;
      settled = true;
      try { ipcMain.removeListener(resultChannel, onResult); } catch (_) {}
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        try { overlayWindow.close(); } catch (_) {}
      }
      resolve(result);
    };

    const onResult = (_event: any, payload: any) => {
      if (payload?.cancelled) {
        finish(null);
        return;
      }
      const rect = payload?.rect;
      if (!rect || typeof rect !== 'object') {
        finish(null);
        return;
      }
      finish(sanitizeBounds(rect));
    };

    ipcMain.on(resultChannel, onResult);

    overlayWindow = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
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
      hasShadow: false,
      focusable: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      }
    });

    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.on('closed', () => finish(null));
    overlayWindow.once('ready-to-show', () => {
      overlayWindow.focus();
      overlayWindow.show();
    });

    timeoutHandle = setTimeout(() => finish(null), Math.max(1000, timeoutMs));

    const html = buildOverlayHtml(resultChannel);
    const url = `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
    overlayWindow.loadURL(url).catch(() => finish(null));
  });
}
