import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

import {
  initElectron, setAPP_ROOT, setMainDirname, setConfig, setFetch,
  config, ipcMain, clipboard, webContents, app, Menu, Tray, nativeImage, globalShortcut, shell, dialog
} from './src/main/ctx.js';
import { getMainState, setMainState } from './src/store/main-store.js';
import { loadConfig, saveConfig, getConfigPath } from './src/main/config-manager.js';
import { createLogger, installConsoleLogger } from './src/main/logger.js';
import { buildTrayIcon, updateTrayIcon, setTrayBusy, loadBusyFrames } from './src/main/tray-manager.js';
import { createWindow, createConfigWindow, reloadAllWindows } from './src/main/windows.js';
import { initHotkeys, registerHotkey, learnHoldHotkey, toggleHoldToTalk } from './src/main/hotkeys.js';
import { ensureWorker, warmupWorker, restartWorker, runWhisperX, fetchWorkerStatus, killWorker } from './src/main/worker-manager.js';
import { handleAssistant, handleAssistantShortcut } from './src/main/assistant.js';
import { tryPaste } from './src/main/paste.js';
import { normalizeTranscript } from './src/main/transcript.js';
import {
  initHistoryStore,
  recordTranscriptEntry,
  getHistorySummaries,
  getHistoryEntry,
  exportHistorySnapshot,
  exportHistoryEntry,
  setHistoryUpdateHook
} from './src/main/history-store.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── APP_ROOT setup ────────────────────────────────────────────────────────────
let ROOT = __dirname;
if (process.env.APP_ROOT) ROOT = process.env.APP_ROOT;
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  try { ROOT = process.cwd(); } catch (_) {}
}
setAPP_ROOT(ROOT);
setMainDirname(__dirname);

// ── electron-reload (dev only) ────────────────────────────────────────────────
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  try {
    require('electron-reload')(__dirname, {
      electron: require(path.join(__dirname, 'node_modules', 'electron')),
      ignored: ['**/node_modules/**', '**/dist-ts/**', '**/dist/**', '**/bundle/**']
    });
    console.debug('[dev] electron-reload enabled on', __dirname);
  } catch (_) {}
}

// ── Electron ──────────────────────────────────────────────────────────────────
const electronApis = require('electron');
initElectron(electronApis);
setFetch((global as any).fetch || require('node-fetch'));

// ── Recording state ───────────────────────────────────────────────────────────
function setRecording(nextState: boolean | undefined): void {
  const { isRecording, win, configWin } = getMainState();
  const newState = nextState === undefined ? !isRecording : !!nextState;
  if (isRecording === newState) return;
  setMainState({ isRecording: newState });
  console.log('[record] state =>', newState ? 'recording' : 'stopped');
  updateTrayIcon();
  updateTrayMenu();
  if (win && !win.isDestroyed()) win.webContents.send('toggle-recording', { isRecording: newState });
  if (configWin && !configWin.isDestroyed()) configWin.webContents.send('toggle-recording', { isRecording: newState });
}

function updateTrayMenu(): void {
  const { isRecording, tray } = getMainState();
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: isRecording ? 'Stop Recording' : 'Start Recording', click: () => setRecording(undefined) },
    { label: 'Hold-to-Talk Mode', type: 'checkbox', checked: !!config?.holdToTalk, click: () => toggleHoldToTalk() },
    { label: 'Learn Hold-to-Talk Hotkey', click: () => learnHoldHotkey() },
    { type: 'separator' },
    { label: 'Settings', click: () => createConfigWindow() },
    { label: 'Worker Status (log)', click: () => fetchWorkerStatus('menu') },
    { label: 'Open Config', click: () => shell.openPath(getConfigPath()) },
    { label: 'Open Config Folder', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
}

function broadcastHistoryUpdated(): void {
  const { win, configWin } = getMainState();
  [win, configWin].forEach((target) => {
    if (target && !target.isDestroyed()) {
      target.webContents.send('history-updated');
    }
  });
}

// ── Transcription pipeline ────────────────────────────────────────────────────
let transcribeQueue: any[] = [];
let transcribeRunning = false;

async function processTranscribeQueue(): Promise<void> {
  if (transcribeRunning) return;
  const next = transcribeQueue.shift();
  if (!next) return;
  transcribeRunning = true;
  setTrayBusy(true);
  try {
    console.log('[transcribe] start', { audioPath: next.audioPath, pending: transcribeQueue.length });
    const text = normalizeTranscript(await runWhisperX(next.audioPath));
    console.log('[transcript] len=%d preview=%s', text.length, text.slice(0, 120));
    if (text) {
      try {
        await recordTranscriptEntry({
          sessionId: next.sessionId,
          transcript: text,
          metadata: {
            ...next.metadata,
            uiSession: !!next.uiSession,
            senderId: next.senderId,
            durationMs: next.durationMs
          }
        });
      } catch (err) {
        console.error('[history] failed to persist transcript', err);
      }
    }
    if (next.uiSession) {
      // Always reply to the UI so isTranscribing and the textarea can update.
      const { win, configWin } = getMainState();
      const sendToRenderers = (t: string) => {
        if (win && !win.isDestroyed()) win.webContents.send('transcript-ready', { text: t });
        if (configWin && !configWin.isDestroyed()) configWin.webContents.send('transcript-ready', { text: t });
      };
      sendToRenderers(text);
    } else if (text) {
      const assistantResponse = await handleAssistant(text, {
        sessionId: next.sessionId,
        metadata: {
          ...next.metadata,
          source: next.uiSession ? 'ui-recording' : 'background-recording'
        }
      });
      if (!assistantResponse) {
        if (!tryPaste(text)) clipboard.writeText(text);
      }
    }
  } catch (err) {
    console.error('[transcribe] error', err);
    // If this was a UI-initiated recording, notify the renderer so isTranscribing resets.
    if (next.uiSession) {
      const { win, configWin } = getMainState();
      if (win && !win.isDestroyed()) win.webContents.send('transcript-ready', { text: '' });
      if (configWin && !configWin.isDestroyed()) configWin.webContents.send('transcript-ready', { text: '' });
    }
  } finally {
    setTrayBusy(false);
    fs.unlink(next.audioPath, () => {});
    transcribeRunning = false;
    if (transcribeQueue.length) processTranscribeQueue();
  }
}

function determineWindowType(sender: any): 'main' | 'config' | 'unknown' {
  const { win, configWin } = getMainState();
  if (sender === win?.webContents) return 'main';
  if (sender === configWin?.webContents) return 'config';
  return 'unknown';
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.on('recording-complete', async (event: any, payload: any) => {
  const size = typeof payload?.size === 'number' ? payload.size : (payload?.buffer?.length || 0);
  if (!payload?.buffer || size < (config?.minRecordingBytes || 200)) {
    console.log('[record] ignoring short recording', { size, min: config?.minRecordingBytes });
    return;
  }
  const buffer = Buffer.from(payload.buffer);
  const audioPath = path.join(os.tmpdir(), `tray-transcriber-${Date.now()}.${payload.extension || 'webm'}`);
  fs.writeFileSync(audioPath, buffer);
  const sessionId = typeof payload?.sessionId === 'string' && payload.sessionId.trim()
    ? payload.sessionId.trim()
    : randomUUID();
  const metadata = {
    size,
    durationMs: payload.durationMs || 0,
    uiSession: !!payload.uiSession
  };
  transcribeQueue.push({
    audioPath,
    size,
    durationMs: payload.durationMs || 0,
    uiSession: !!payload.uiSession,
    senderId: event?.sender?.id,
    sessionId,
    metadata
  });
  console.log('[queue] enqueued', { pending: transcribeQueue.length });
  processTranscribeQueue();
});

ipcMain.on('debug-log', (_event: any, payload: any) => {
  if (!payload) return;
  console.log('[renderer]', payload.message, ...(payload.data ? [payload.data] : []));
});

ipcMain.on('ui-set-recording-state', (_event: any, payload: any) => {
  if (typeof payload?.isRecording !== 'boolean') return;
  setRecording(!!payload.isRecording);
});

ipcMain.on('ui-update-tray-icon', () => updateTrayIcon());

ipcMain.on('config-updated', (_event: any, newConfig: any) => {
  Object.assign(config, newConfig);
  saveConfig(config);
  const log = createLogger();
  installConsoleLogger(log);
  registerHotkey();
  updateTrayMenu();
  restartWorker();
  reloadAllWindows();

  // if the cursorBusy preference is now enabled and we happen to already be
  // in a busy state, make sure existing renderer windows know so they can set
  // the busy cursor immediately.
  // propagate busy cursor state based on the *new* config value; this
  // will send `true` if both settings and current busy state are true, or
  // `false` if the preference was just disabled while we were busy.
  if (getMainState().trayBusy) {
    const { win, configWin } = getMainState();
    const flag = !!config.cursorBusy;
    [win, configWin].forEach((w) => {
      if (w && !w.isDestroyed()) w.webContents.send('cursor-busy', flag);
    });
  }
});

ipcMain.handle('get-config', () => ({ ...config }));

ipcMain.handle('history-get-summaries', async (_event, opts: any) => {
  return getHistorySummaries(opts ?? {});
});

ipcMain.handle('history-get-entry', async (_event, id: number) => {
  return getHistoryEntry(Number(id));
});

ipcMain.handle('get-window-type', (event) => {
  return determineWindowType(event.sender);
});

ipcMain.handle('history-export', async (_event, targetPath?: string) => {
  let finalPath = targetPath;
  if (!finalPath) {
    const defaultPath = path.join(app?.getPath('desktop') || process.cwd(), 'tray-history.json');
    const dialogResult = await dialog.showSaveDialog({
      title: 'Export history',
      defaultPath,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (dialogResult.canceled) {
      return { path: '', entries: [] };
    }
    finalPath = dialogResult.filePath ?? defaultPath;
  }
  return exportHistorySnapshot(finalPath);
});

ipcMain.handle('history-export-entry', async (_event, opts: any) => {
  const entryId = typeof opts === 'number' ? opts : Number(opts?.id);
  if (!entryId || Number.isNaN(entryId)) {
    throw new Error('history entry id required');
  }
  let finalPath = opts?.targetPath;
  if (!finalPath) {
    const entry = await getHistoryEntry(entryId);
    if (!entry) return { path: '', entry: null };
    const defaultPath = path.join(app?.getPath('desktop') || process.cwd(), `tray-history-${entry.entryType}-${entry.id}.json`);
    const dialogResult = await dialog.showSaveDialog({
      title: 'Export history entry',
      defaultPath,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (dialogResult.canceled) {
      return { path: '', entry: null };
    }
    finalPath = dialogResult.filePath ?? defaultPath;
  }
  return exportHistoryEntry(entryId, finalPath);
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const cfg = loadConfig();
  setConfig(cfg);
  const log = createLogger();
  installConsoleLogger(log);

  await initHistoryStore();
  setHistoryUpdateHook(broadcastHistoryUpdated);

  initHotkeys({ setRecording, updateTrayMenu, handleAssistantShortcut });

  createWindow();
  if (process.platform === 'darwin') app.dock.hide();
  Menu.setApplicationMenu(null);

  loadBusyFrames();
  const tray = new Tray(buildTrayIcon());
  setMainState({ tray });
  tray.setToolTip('Tray Transcriber');
  updateTrayIcon();
  updateTrayMenu();

  registerHotkey();
  if (cfg.useWorker) {
    ensureWorker();
    if (cfg.workerWarmup) warmupWorker();
  }
});

app.on('window-all-closed', (event: any) => event.preventDefault());

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  killWorker();
});

app.on('activate', () => {
  const { win } = getMainState();
  if (!win) createWindow();
});
