import path from 'node:path';
import fs from 'node:fs';
import { BrowserWindow, APP_ROOT } from './ctx.js';
import { getMainState, setMainState } from '../store/main-store.js';

export function createWindow(): void {
  const win = new BrowserWindow({
    width: 360,
    height: 200,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(APP_ROOT, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  setMainState({ win });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const rendererDistIndex = path.join(APP_ROOT, 'dist-ts', 'index.html');
  const legacyIndex = path.join(APP_ROOT, 'index.html');

  if (devUrl) {
    win.loadURL(devUrl).catch((err: any) => {
      console.warn('[window] failed to load Vite URL, falling back:', err?.message ?? err);
      win.loadFile(fs.existsSync(rendererDistIndex) ? rendererDistIndex : legacyIndex);
    });
  } else {
    win.loadFile(fs.existsSync(rendererDistIndex) ? rendererDistIndex : legacyIndex);
  }
  win.setMenuBarVisibility(false);
}

export function createConfigWindow(): void {
  const { configWin } = getMainState();
  if (configWin) { configWin.show(); configWin.focus(); return; }

  const win = new BrowserWindow({
    width: 520,
    height: 680,
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(APP_ROOT, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  setMainState({ configWin: win });
  win.on('closed', () => setMainState({ configWin: null }));

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const rendererDistIndex = path.join(APP_ROOT, 'dist-ts', 'index.html');
  const legacyConfig = path.join(APP_ROOT, 'config.html');

  if (devUrl) {
    const url = devUrl.endsWith('/') ? devUrl : `${devUrl}/`;
    win.loadURL(url).catch((err: any) => {
      console.warn('[configWindow] failed to load Vite URL, falling back:', err?.message ?? err);
      win.loadFile(fs.existsSync(rendererDistIndex) ? rendererDistIndex : legacyConfig);
    });
  } else {
    win.loadFile(fs.existsSync(rendererDistIndex) ? rendererDistIndex : legacyConfig);
  }
  win.setMenuBarVisibility(false);
}

export function reloadAllWindows(): void {
  const { win, configWin } = getMainState();
  if (win && !win.isDestroyed()) win.reload();
  if (configWin && !configWin.isDestroyed()) configWin.reload();
}
