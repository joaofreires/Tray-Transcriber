/**
 * Shared mutable context for main-process modules.
 *
 * All exported `let` values are live ESM bindings – any module that imports
 * them will always see the latest value after a setter has been called from
 * main.ts during startup.
 */

// ── Config, logger, APP_ROOT ─────────────────────────────────────────────────
/** Active application config. Set via setConfig() once loaded. */
export let config: any = null;
/** Active logger instance. Set via setLogger() after createLogger(). */
export let logger: any = null;
/** Resolved application root directory (project root in dev, resourcesPath in prod). */
export let APP_ROOT: string = '';
/** __dirname of the compiled main.ts entry (dist-ts/). */
export let mainDirname: string = '';

export function setConfig(c: any): void { config = c; }
export function setLogger(l: any): void { logger = l; }
export function setAPP_ROOT(r: string): void { APP_ROOT = r; }
export function setMainDirname(d: string): void { mainDirname = d; }

// ── Electron APIs ─────────────────────────────────────────────────────────────
// Populated once via initElectron() after the CommonJS require('electron').
export let app: any = null;
export let BrowserWindow: any = null;
export let Tray: any = null;
export let Menu: any = null;
export let nativeImage: any = null;
export let globalShortcut: any = null;
export let ipcMain: any = null;
export let clipboard: any = null;
export let shell: any = null;
export let systemPreferences: any = null;
export let dialog: any = null;
export let webContents: any = null;

export function initElectron(e: {
  app: any; BrowserWindow: any; Tray: any; Menu: any; nativeImage: any;
  globalShortcut: any; ipcMain: any; clipboard: any; shell: any;
  systemPreferences: any; dialog: any; webContents: any;
}): void {
  app = e.app;
  BrowserWindow = e.BrowserWindow;
  Tray = e.Tray;
  Menu = e.Menu;
  nativeImage = e.nativeImage;
  globalShortcut = e.globalShortcut;
  ipcMain = e.ipcMain;
  clipboard = e.clipboard;
  shell = e.shell;
  systemPreferences = e.systemPreferences;
  dialog = e.dialog;
  webContents = e.webContents;
}

// ── fetch ─────────────────────────────────────────────────────────────────────
export let fetchFn: typeof fetch = (global as any).fetch;
export function setFetch(f: typeof fetch): void { fetchFn = f; }
