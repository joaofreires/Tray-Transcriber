import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import {
  initElectron, setAPP_ROOT, setMainDirname, setConfig, setFetch, APP_ROOT,
  config, ipcMain, clipboard, webContents, app, Menu, Tray, nativeImage, globalShortcut, shell, dialog
} from './src/main/ctx.js';
import { getMainState, setMainState } from './src/store/main-store.js';
import { loadConfig, saveConfig, getConfigPath } from './src/main/config-manager.js';
import { createLogger, installConsoleLogger } from './src/main/logger.js';
import { buildTrayIcon, updateTrayIcon, setTrayBusy, loadBusyFrames } from './src/main/tray-manager.js';
import { createWindow, createConfigWindow } from './src/main/windows.js';
import { initHotkeys } from './src/main/hotkeys.js';
import { ensureWorker, warmupWorker, restartWorker, fetchWorkerStatus, killWorker } from './src/main/worker-manager.js';
import { handleAssistant } from './src/main/assistant.js';
import { tryPaste } from './src/main/paste.js';
import { normalizeTranscript } from './src/main/transcript.js';
import { resolveRecordingOutputMode } from './src/main/recording-output-policy.js';
import { registerShortcutHandlers } from './src/main/shortcuts/registry.js';
import { normalizeShortcutConfig } from './src/main/shortcuts/schema.js';
import {
  broadcastConfigChanged,
  getChangedConfigPaths,
  isShortcutOnlyUpdate,
  shouldRestartWorkerForConfigChanges
} from './src/main/config-sync.js';
import {
  configureRuntimeServices,
  getRuntimeOrchestrator,
  getInstallerService,
  getSecretsService,
  getRuntimeApiServer,
  normalizeConfigForRuntime,
  shutdownRuntimeServices
} from './src/main/runtime/runtime-services.js';
import {
  buildGithubIssueUrl,
  parseGitHubRemoteToRepoBase,
  verifyLlmProvider,
  verifyOcrProvider,
  verifyRuntimeApiAlive,
  type VerificationResult
} from './src/main/runtime/verification.js';
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
    const runtime = getRuntimeOrchestrator();
    const text = normalizeTranscript(await runtime.transcribeFromFile(next.audioPath, path.extname(next.audioPath) || '.webm'));
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
        const outputMode = resolveRecordingOutputMode(config);
        if (outputMode === 'paste_then_clipboard') {
          const pasteResult = await tryPaste(text, { force: true });
          if (!pasteResult.ok) {
            console.warn('[transcribe] auto-paste failed, keeping clipboard only', {
              method: pasteResult.method,
              reason: pasteResult.reason
            });
            clipboard.writeText(text);
          }
        } else {
          clipboard.writeText(text);
        }
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

type SaveConfigWarning = {
  code: 'SHORTCUT_REGISTER_FAILED' | 'SHORTCUT_RESERVED_OR_UNAVAILABLE';
  message: string;
  shortcutId?: string;
  field?: 'shortcut';
};

type SaveConfigResult =
  | { ok: true; warnings?: SaveConfigWarning[] }
  | { ok: false; code: string; errors: any[] };

function broadcastConfigChangedToRenderers(payload: {
  changedKeys: string[];
  config: Record<string, unknown>;
  sourceWindowType?: 'main' | 'config' | 'unknown';
}): void {
  const { win, configWin } = getMainState();
  broadcastConfigChanged([win as any, configWin as any], payload);
}

function notifyCursorBusyState(): void {
  if (!getMainState().trayBusy) return;
  const { win, configWin } = getMainState();
  const flag = !!config.cursorBusy;
  [win, configWin].forEach((w) => {
    if (w && !w.isDestroyed()) w.webContents.send('cursor-busy', flag);
  });
}

function toSaveWarning(issue: { code: string; message: string; shortcutId?: string }): SaveConfigWarning {
  return {
    code: issue.code === 'LIKELY_OS_RESERVED' ? 'SHORTCUT_RESERVED_OR_UNAVAILABLE' : 'SHORTCUT_REGISTER_FAILED',
    message: issue.message,
    shortcutId: issue.shortcutId,
    field: 'shortcut'
  };
}

let githubIssueRepoBaseCache: string | null | undefined;

function getRuntimeApiInfoPayload() {
  const apiConfig = config?.runtimeApi || {};
  let token = '';
  try {
    token = getRuntimeApiServer().getToken();
  } catch {}
  return {
    enabled: !!apiConfig.enabled,
    transport: apiConfig.transport === 'socket' ? 'socket' : 'tcp',
    host: String(apiConfig.host || '127.0.0.1'),
    port: Number(apiConfig.port || 0),
    socketPath: String(apiConfig.socketPath || ''),
    authRequired: !!apiConfig.authRequired,
    token
  } as const;
}

function getGitHubIssueRepoBase(): string | null {
  if (githubIssueRepoBaseCache !== undefined) return githubIssueRepoBaseCache;

  const envRepository = String(process.env.GITHUB_REPOSITORY || '').trim();
  if (envRepository) {
    githubIssueRepoBaseCache = parseGitHubRemoteToRepoBase(`https://github.com/${envRepository}`);
    return githubIssueRepoBaseCache;
  }

  const envRepositoryUrl = String(process.env.GITHUB_REPOSITORY_URL || '').trim();
  if (envRepositoryUrl) {
    githubIssueRepoBaseCache = parseGitHubRemoteToRepoBase(envRepositoryUrl);
    return githubIssueRepoBaseCache;
  }

  try {
    const originUrl = String(
      execFileSync('git', ['config', '--get', 'remote.origin.url'], {
        cwd: APP_ROOT || process.cwd(),
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8'
      }) || ''
    ).trim();
    githubIssueRepoBaseCache = parseGitHubRemoteToRepoBase(originUrl);
    return githubIssueRepoBaseCache;
  } catch {
    githubIssueRepoBaseCache = null;
    return null;
  }
}

function withVerificationIssueUrl(result: VerificationResult): VerificationResult {
  if (result.ok) return result;

  const runtimeApiConfig = config?.runtimeApi || {};
  const issueContext = {
    timestamp: new Date().toISOString(),
    target: result.target,
    activeProviders: {
      stt: config?.providers?.stt?.activeProviderId || '',
      llm: config?.providers?.llm?.activeProviderId || '',
      ocr: config?.providers?.ocr?.activeProviderId || ''
    },
    runtimeApi: {
      enabled: !!runtimeApiConfig.enabled,
      transport: runtimeApiConfig.transport || 'tcp',
      host: runtimeApiConfig.host || '127.0.0.1',
      port: Number(runtimeApiConfig.port || 0),
      socketPath: String(runtimeApiConfig.socketPath || ''),
      authRequired: !!runtimeApiConfig.authRequired
    }
  };

  const issueTitle = `[Verification] ${result.target} check failed`;
  const issueBody = [
    '### Verification failure',
    '',
    `- Target: ${result.target}`,
    `- Message: ${result.message}`,
    `- Error: ${result.error || 'Unknown error'}`,
    result.details ? `- Details: ${result.details}` : '',
    '',
    '### Context',
    '```json',
    JSON.stringify(issueContext, null, 2),
    '```'
  ]
    .filter(Boolean)
    .join('\n');

  return {
    ...result,
    issueUrl: buildGithubIssueUrl(getGitHubIssueRepoBase(), issueTitle, issueBody)
  };
}

function applyRuntimeConfigUpdate(
  newConfig: any,
  sourceWindowType: 'main' | 'config' | 'unknown' = 'unknown'
): SaveConfigResult {
  const previousConfig = { ...(config || {}) };
  const merged = { ...(config || {}), ...(newConfig || {}) };
  const normalized = normalizeShortcutConfig(merged);
  if (!normalized.validation.ok) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      errors: normalized.validation.errors
    };
  }

  const nextConfig = normalized.normalizedConfig as any;
  const runtimeNormalized = normalizeConfigForRuntime(nextConfig);
  nextConfig.configVersion = 3;
  nextConfig.providers = runtimeNormalized.providers;
  nextConfig.installer = runtimeNormalized.installer;
  nextConfig.runtimeApi = runtimeNormalized.runtimeApi;
  nextConfig.secrets = runtimeNormalized.secrets;
  nextConfig.runtimeNotice = runtimeNormalized.runtimeNotice;
  const changedKeys = getChangedConfigPaths(
    previousConfig as Record<string, unknown>,
    nextConfig as Record<string, unknown>
  );
  const shortcutOnlyUpdate = isShortcutOnlyUpdate(changedKeys);

  for (const key of Object.keys(config || {})) {
    if (!(key in nextConfig)) delete config[key];
  }
  Object.assign(config, nextConfig);
  saveConfig(config);
  void configureRuntimeServices(config);
  const log = createLogger();
  installConsoleLogger(log);
  const shortcutRegistrationReport = registerShortcutHandlers(config as any);
  updateTrayMenu();
  if (changedKeys.length > 0 && shouldRestartWorkerForConfigChanges(changedKeys)) {
    restartWorker();
  } else if (shortcutOnlyUpdate) {
    console.log('[config] applied hot-reload-safe update without window reload');
  }
  if (changedKeys.length > 0) {
    broadcastConfigChangedToRenderers({
      changedKeys,
      config: { ...(config as any) },
      sourceWindowType
    });
  }
  notifyCursorBusyState();
  const warnings = shortcutRegistrationReport.issues.map(toSaveWarning);
  return warnings.length ? { ok: true, warnings } : { ok: true };
}

ipcMain.handle('config-save', async (event: any, newConfig: any) => {
  return applyRuntimeConfigUpdate(newConfig, determineWindowType(event?.sender));
});

ipcMain.on('config-updated', (event: any, newConfig: any) => {
  const result = applyRuntimeConfigUpdate(newConfig, determineWindowType(event?.sender));
  if (!result.ok) {
    console.error('[config] rejected legacy config-updated payload', (result as any).errors || []);
    return;
  }
  if (Array.isArray(result.warnings) && result.warnings.length) {
    console.warn('[config] applied with shortcut registration warnings', result.warnings);
  }
});

ipcMain.handle('get-config', () => ({ ...config }));

ipcMain.handle('providers-list', async () => {
  return getRuntimeOrchestrator().listProviders();
});

ipcMain.handle('provider-status', async (_event, providerId: string) => {
  return getRuntimeOrchestrator().providerStatus(String(providerId || '').trim());
});

ipcMain.handle('provider-select', async (event, payload: any) => {
  const capability = String(payload?.capability || '').trim();
  const providerId = String(payload?.providerId || '').trim();
  const profileId = payload?.profileId ? String(payload.profileId).trim() : undefined;
  if (!capability || !providerId) {
    return { ok: false, code: 'VALIDATION_FAILED', errors: [{ code: 'MISSING_INPUT', message: 'capability and providerId are required' }] };
  }
  const next = JSON.parse(JSON.stringify(config || {}));
  if (!next.providers?.[capability]) {
    return { ok: false, code: 'VALIDATION_FAILED', errors: [{ code: 'INVALID_CAPABILITY', message: `Unknown capability: ${capability}` }] };
  }
  next.providers[capability].activeProviderId = providerId;
  if (profileId) next.providers[capability].activeProfileId = profileId;
  return applyRuntimeConfigUpdate(next, determineWindowType(event?.sender));
});

ipcMain.handle('provider-upsert-profile', async (event, payload: any) => {
  const capability = String(payload?.capability || '').trim();
  const profile = payload?.profile;
  if (!capability || !profile || typeof profile !== 'object') {
    return { ok: false, code: 'VALIDATION_FAILED', errors: [{ code: 'MISSING_INPUT', message: 'capability and profile are required' }] };
  }
  const next = JSON.parse(JSON.stringify(config || {}));
  if (!next.providers?.[capability]) {
    return { ok: false, code: 'VALIDATION_FAILED', errors: [{ code: 'INVALID_CAPABILITY', message: `Unknown capability: ${capability}` }] };
  }
  const profiles = Array.isArray(next.providers[capability].profiles) ? next.providers[capability].profiles : [];
  const idx = profiles.findIndex((entry: any) => String(entry?.id || '') === String(profile.id || ''));
  if (idx >= 0) profiles[idx] = profile;
  else profiles.push(profile);
  next.providers[capability].profiles = profiles;
  return applyRuntimeConfigUpdate(next, determineWindowType(event?.sender));
});

ipcMain.handle('install-start', async (_event, payload: any) => {
  const installer = getInstallerService();
  return installer.startJob({
    providerId: String(payload?.providerId || '').trim(),
    action: String(payload?.action || 'install') as any,
    localPath: payload?.localPath ? String(payload.localPath) : undefined
  });
});

ipcMain.handle('install-cancel', async (_event, jobId: string) => {
  return getInstallerService().cancelJob(String(jobId || '').trim());
});

ipcMain.handle('install-list-jobs', async () => {
  return getInstallerService().listJobs();
});

ipcMain.handle('install-check-updates', async () => {
  return getInstallerService().checkForUpdates();
});

ipcMain.handle('secret-set', async (_event, payload: any) => {
  const ref = String(payload?.ref || '').trim();
  const value = String(payload?.value || '');
  return getSecretsService().setSecret(ref, value);
});

ipcMain.handle('secret-delete', async (_event, ref: string) => {
  return getSecretsService().deleteSecret(String(ref || '').trim());
});

ipcMain.handle('runtime-api-info', async () => {
  return getRuntimeApiInfoPayload();
});

ipcMain.handle('verify-runtime-api', async () => {
  const result = await verifyRuntimeApiAlive(getRuntimeApiInfoPayload());
  return withVerificationIssueUrl(result);
});

ipcMain.handle('verify-provider', async (_event, capability: string) => {
  const normalizedCapability = String(capability || '').trim();
  if (normalizedCapability !== 'llm' && normalizedCapability !== 'ocr') {
    return withVerificationIssueUrl({
      ok: false,
      target: 'llm',
      message: 'Unsupported verification capability.',
      error: `Expected "llm" or "ocr", got "${normalizedCapability || '<empty>'}"`,
      details: 'Renderer sent an invalid verification capability.'
    });
  }

  const runtime = getRuntimeOrchestrator();
  const result = normalizedCapability === 'llm'
    ? await verifyLlmProvider(runtime)
    : await verifyOcrProvider(runtime);
  return withVerificationIssueUrl(result);
});

ipcMain.handle('open-external-url', async (_event, rawUrl: string) => {
  const url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    await shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
});

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
  const normalizedRuntimeConfig = await configureRuntimeServices(cfg);
  Object.assign(cfg, normalizedRuntimeConfig);
  const log = createLogger();
  installConsoleLogger(log);

  await initHistoryStore();
  setHistoryUpdateHook(broadcastHistoryUpdated);

  initHotkeys({ setRecording, updateTrayMenu });

  createWindow();
  if (process.platform === 'darwin') app.dock.hide();
  Menu.setApplicationMenu(null);

  loadBusyFrames();
  const tray = new Tray(buildTrayIcon());
  setMainState({ tray });
  tray.setToolTip('Tray Transcriber');
  updateTrayIcon();
  updateTrayMenu();

  const shortcutRegistrationReport = registerShortcutHandlers(cfg as any);
  if (shortcutRegistrationReport.issues.length) {
    const warnings = shortcutRegistrationReport.issues.map(toSaveWarning);
    console.warn('[shortcuts] startup registration warnings', warnings);
  }
  console.log('[runtime] active providers', {
    stt: cfg?.providers?.stt?.activeProviderId,
    llm: cfg?.providers?.llm?.activeProviderId,
    ocr: cfg?.providers?.ocr?.activeProviderId
  });
  if (cfg.useWorker) {
    ensureWorker();
    if (cfg.workerWarmup) warmupWorker();
  }
});

app.on('window-all-closed', (event: any) => event.preventDefault());

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  killWorker();
  void shutdownRuntimeServices();
});

app.on('activate', () => {
  const { win } = getMainState();
  if (!win) createWindow();
});
