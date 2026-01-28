const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');

let tray = null;
let win = null;
let configWin = null;
let isRecording = false;
let config = null;
let lastHotkeyAt = 0;
let hotkeyGuard = false;
let hook = null;
let learningHotkey = false;
let holdKeyActive = false;
let toggleKeyActive = false;
let hookListeners = { keydown: null, keyup: null };
let hookKeyMap = null;
let holdHotkeySpec = null;
let modifierKeycodes = new Set();
let workerProc = null;
let workerPromise = null;
let workerReady = false;
let workerWarmupKey = null;
let transcribeQueue = [];
let transcribeRunning = false;
let logger = null;
let consolePatched = false;

function resolveBundledPath(relPath) {
  const candidates = [];
  if (app && app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, relPath));
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', relPath));
  }
  candidates.push(path.join(__dirname, relPath));
  candidates.push(path.join(__dirname, 'bundle', relPath));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolvePythonCommand() {
  if (config && config.pythonPath) {
    const custom = config.pythonPath.trim();
    if (custom) return custom;
  }
  const pyPath = resolveBundledPath(path.join('python', 'bin', 'python'));
  if (pyPath) {
    try {
      const stat = fs.statSync(pyPath);
      if (stat.isFile()) return pyPath;
    } catch (_) {}
  }
  return config.whisperxCommand || 'python';
}

function resolveFfmpegDir() {
  const ffmpegPath = resolveBundledPath(path.join('ffmpeg', 'ffmpeg'));
  if (!ffmpegPath) return null;
  return path.dirname(ffmpegPath);
}

function resolveWorkerScriptPath() {
  const bundled = resolveBundledPath(path.join('worker', 'worker.py'));
  if (bundled) return bundled;
  const unpacked = resolveBundledPath(path.join('python', 'worker.py'));
  if (unpacked) return unpacked;
  const dev = path.join(__dirname, 'python', 'worker.py');
  if (fs.existsSync(dev)) return dev;
  return null;
}

function buildWorkerEnv() {
  const env = { ...process.env };
  const ffmpegDir = resolveFfmpegDir();
  if (ffmpegDir) {
    env.PATH = `${ffmpegDir}${path.delimiter}${env.PATH || ''}`;
  }
  if ((config.disableCuda && config.device !== 'gpu') || config.device === 'cpu') {
    env.CUDA_VISIBLE_DEVICES = '';
    env.NVIDIA_VISIBLE_DEVICES = 'none';
  }
  if (config.forceNoWeightsOnlyLoad) {
    env.TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD = '1';
  }
  if (logger && logger.filePath) {
    env.TRANSCRIBER_LOG_PATH = logger.filePath;
  }
  if (logger && logger.levelName) {
    env.TRANSCRIBER_LOG_LEVEL = logger.levelName;
  }
  return env;
}

function createLogger() {
  const levels = { silent: 0, error: 1, info: 2, debug: 3 };
  const configured = (config && config.logLevel) || 'auto';
  const levelName = configured === 'auto'
    ? (app && app.isPackaged ? 'error' : 'debug')
    : configured;
  const level = levels[levelName] ?? levels.error;
  const logDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const filePath = path.join(logDir, 'app.log');

  const writeLine = (msg) => {
    try {
      fs.appendFileSync(filePath, msg + '\n');
    } catch (_) {}
  };

  const format = (lvl, args) => {
    const line = `[${new Date().toISOString()}] [${lvl}] ${args.join(' ')}`;
    return line;
  };

  return {
    levelName,
    filePath,
    error: (...args) => {
      if (level >= levels.error) {
        const line = format('ERROR', args);
        writeLine(line);
        if (!app.isPackaged) process.stderr.write(line + '\n');
      }
    },
    info: (...args) => {
      if (level >= levels.info) {
        const line = format('INFO', args);
        writeLine(line);
        if (!app.isPackaged) process.stdout.write(line + '\n');
      }
    },
    debug: (...args) => {
      if (level >= levels.debug) {
        const line = format('DEBUG', args);
        writeLine(line);
        if (!app.isPackaged) process.stdout.write(line + '\n');
      }
    }
  };
}

function installConsoleLogger() {
  if (consolePatched || !logger) return;
  consolePatched = true;
  console.log = (...args) => logger.info(...args);
  console.warn = (...args) => logger.error(...args);
  console.error = (...args) => logger.error(...args);
  logger.debug('[log] console patched', { file: logger.filePath, level: logger.levelName });
}

const defaultConfig = {
  hotkey: 'CommandOrControl+Shift+Space',
  holdToTalk: true,
  holdHotkey: null,
  preferKeyHook: true,
  pressToTalk: true,
  holdStopOnModifierRelease: false,
  pasteMode: 'clipboard',
  dictionary: ["OpenAI", "WhisperX"],
  includeDictionaryInPrompt: true,
  includeDictionaryDescriptions: false,
  dictionaryCorrections: [],
  prompt: '',
  promptMode: 'append',
  logLevel: 'auto',
  pythonPath: '',
  asrEngine: 'faster-whisper',
  device: 'default',
  language: 'en',
  model: 'small',
  disableCuda: true,
  forceNoWeightsOnlyLoad: true,
  computeType: 'int8',
  batchSize: 4,
  noAlign: true,
  minRecordingBytes: 200,
  useWorker: true,
  workerHost: '127.0.0.1',
  workerPort: 8765,
  workerStartupTimeoutMs: 15000,
  workerWarmup: true,
  workerRequestTimeoutMs: 600000,
  workerStatusPollMs: 30000,
  whisperxCommand: 'python',
  whisperxArgs: ['-m', 'whisperx', '--device', 'cpu']
};

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    return { ...defaultConfig };
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    if (!raw || !raw.trim()) {
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      return { ...defaultConfig };
    }
    return { ...defaultConfig, ...JSON.parse(raw) };
  } catch (err) {
    try {
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    } catch (_) {}
    return { ...defaultConfig };
  }
}

function saveConfig(newConfig) {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
}

function buildTrayIcon() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    const dataUrl =
      'data:image/png;base64,' +
      'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAnklEQVRYR+2W0Q3AIAwE3f9r2Y3o0gQx0QmE3AqQYH8tI0SxQmWQw+u0o5gJp5QbA5b6mM4qgF4cS7gQ1z3F8q1Ew8e1UoY4cG4cBv5r8+0oYcY9mY0J8Xz8R6D8wGQp5+8Jc6HkL8Xj7yC2P8G8o+gC5b0bZ2jP2sAAAAASUVORK5CYII=';
    icon = nativeImage.createFromDataURL(dataUrl);
  }
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }
  return icon;
}

function createWindow() {
  win = new BrowserWindow({
    width: 360,
    height: 200,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  win.setMenuBarVisibility(false);
}

function createConfigWindow() {
  if (configWin) {
    configWin.show();
    configWin.focus();
    return;
  }
  configWin = new BrowserWindow({
    width: 520,
    height: 680,
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  configWin.on('closed', () => {
    configWin = null;
  });
  configWin.loadFile(path.join(__dirname, 'config.html'));
  configWin.setMenuBarVisibility(false);
}

function updateTrayMenu() {
  const statusLabel = isRecording ? 'Stop Recording' : 'Start Recording';
  const contextMenu = Menu.buildFromTemplate([
    { label: statusLabel, click: () => toggleRecording() },
    {
      label: 'Hold-to-Talk Mode',
      type: 'checkbox',
      checked: !!config.holdToTalk,
      click: () => toggleHoldToTalk()
    },
    { label: 'Learn Hold-to-Talk Hotkey', click: () => learnHoldHotkey() },
    { type: 'separator' },
    { label: 'Settings', click: () => createConfigWindow() },
    { label: 'Worker Status (log)', click: () => fetchWorkerStatus() },
    { label: 'Open Config', click: () => shell.openPath(getConfigPath()) },
    { label: 'Open Config Folder', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
}

function registerHotkey() {
  if (!config.hotkey) return;
  if (config.holdToTalk) {
    setupHoldToTalk();
    return;
  }
  if (config.pressToTalk && config.preferKeyHook && setupPressToTalkWithHook()) {
    return;
  }
  if (config.preferKeyHook && setupToggleWithHook()) {
    return;
  }
  globalShortcut.unregisterAll();
  const ok = globalShortcut.register(config.hotkey, () => {
    toggleRecording();
  });
  if (!ok) {
    logger?.error('Failed to register hotkey:', config.hotkey);
  }
}

function setRecording(nextState) {
  if (!win) return;
  if (isRecording === nextState) return;
  isRecording = nextState;
  console.log('[record] state =>', isRecording ? 'recording' : 'stopped');
  updateTrayMenu();
  win.webContents.send('toggle-recording', { isRecording });
}

function toggleRecording() {
  if (!win) return;
  const now = Date.now();
  if (now - lastHotkeyAt < 400) return;
  if (hotkeyGuard) return;
  hotkeyGuard = true;
  setTimeout(() => {
    hotkeyGuard = false;
  }, 700);
  lastHotkeyAt = now;
  console.log('[hotkey] toggle fired');
  setRecording(!isRecording);
}

function tryLoadHook() {
  if (hook) return hook;
  try {
    const mod = require('uiohook-napi');
    if (mod && mod.uIOhook && typeof mod.uIOhook.on === 'function') {
      hook = mod.uIOhook;
      hookKeyMap = mod.UiohookKey || null;
      modifierKeycodes = buildModifierKeycodes({
        ctrlKey: true,
        shiftKey: true,
        altKey: true,
        metaKey: true
      });
      return hook;
    }
    if (mod && typeof mod.on === 'function') {
      hook = mod;
      hookKeyMap = mod.UiohookKey || null;
      modifierKeycodes = buildModifierKeycodes({
        ctrlKey: true,
        shiftKey: true,
        altKey: true,
        metaKey: true
      });
      return hook;
    }
    console.warn('[hotkey] uiohook-napi loaded but has no usable hook');
    hook = null;
    hookKeyMap = null;
    modifierKeycodes = new Set();
    return null;
  } catch (err) {
    try {
      hook = require('iohook');
      if (typeof hook.on !== 'function') {
        console.warn('[hotkey] iohook loaded but has no .on');
        hook = null;
        hookKeyMap = null;
        modifierKeycodes = new Set();
        return null;
      }
      hookKeyMap = hook.UiohookKey || null;
      modifierKeycodes = buildModifierKeycodes({
        ctrlKey: true,
        shiftKey: true,
        altKey: true,
        metaKey: true
      });
      return hook;
    } catch (err2) {
      console.warn('[hotkey] failed to load iohook/uiohook-napi');
      hookKeyMap = null;
      modifierKeycodes = new Set();
      return null;
    }
  }
}

function setupHoldToTalk() {
  const h = tryLoadHook();
  if (!h) {
    console.warn('[hotkey] hold-to-talk unavailable, falling back to toggle');
    config.holdToTalk = false;
    saveConfig(config);
    registerHotkey();
    updateTrayMenu();
    return;
  }
  globalShortcut.unregisterAll();
  clearHookListeners(h);
  holdHotkeySpec = buildHoldHotkeySpec();
  if (!holdHotkeySpec) {
    console.warn('[hotkey] hold-to-talk missing hotkey, falling back to toggle');
    config.holdToTalk = false;
    saveConfig(config);
    registerHotkey();
    updateTrayMenu();
    return;
  }

  const onKeyDown = (event) => {
    if (learningHotkey) return;
    if (!matchesHoldSpec(event, holdHotkeySpec)) return;
    if (holdKeyActive) return;
    holdKeyActive = true;
    console.log('[hotkey] hold down', summarizeEvent(event));
    setRecording(true);
  };
  const onKeyUp = (event) => {
    if (learningHotkey) return;
    if (shouldReleaseHold(event, holdHotkeySpec)) {
      holdKeyActive = false;
      console.log('[hotkey] hold up', summarizeEvent(event));
      setRecording(false);
    }
  };
  hookListeners = { keydown: onKeyDown, keyup: onKeyUp };
  h.on('keydown', onKeyDown);
  h.on('keyup', onKeyUp);
  safeStartHook(h);
}

function setupToggleWithHook() {
  const h = tryLoadHook();
  if (!h) return false;
  globalShortcut.unregisterAll();
  clearHookListeners(h);
  const onKeyDown = (event) => {
    if (learningHotkey) return;
    if (!matchesToggleHotkey(event)) return;
    if (toggleKeyActive) return;
    toggleKeyActive = true;
    console.log('[hotkey] toggle down', summarizeEvent(event));
    toggleRecording();
  };
  const onKeyUp = (event) => {
    if (learningHotkey) return;
    if (!matchesToggleHotkey(event)) return;
    toggleKeyActive = false;
    console.log('[hotkey] toggle up', summarizeEvent(event));
  };
  hookListeners = { keydown: onKeyDown, keyup: onKeyUp };
  h.on('keydown', onKeyDown);
  h.on('keyup', onKeyUp);
  safeStartHook(h);
  return true;
}

function setupPressToTalkWithHook() {
  const h = tryLoadHook();
  if (!h) return false;
  globalShortcut.unregisterAll();
  clearHookListeners(h);
  const onKeyDown = (event) => {
    if (learningHotkey) return;
    if (!matchesToggleHotkey(event)) return;
    if (toggleKeyActive) return;
    toggleKeyActive = true;
    console.log('[hotkey] press-to-talk down', summarizeEvent(event));
    setRecording(true);
  };
  const onKeyUp = (event) => {
    if (learningHotkey) return;
    if (!matchesToggleHotkey(event)) return;
    toggleKeyActive = false;
    console.log('[hotkey] press-to-talk up', summarizeEvent(event));
    setRecording(false);
  };
  hookListeners = { keydown: onKeyDown, keyup: onKeyUp };
  h.on('keydown', onKeyDown);
  h.on('keyup', onKeyUp);
  safeStartHook(h);
  return true;
}

function buildHoldHotkeySpec() {
  if (config.holdHotkey && typeof config.holdHotkey.keycode === 'number') {
    if (isModifierKeycode(config.holdHotkey.keycode)) {
      console.warn('[hotkey] holdHotkey is modifier-only, falling back to hotkey string');
    } else {
    return {
      keycode: config.holdHotkey.keycode,
      ctrlKey: !!config.holdHotkey.ctrlKey,
      shiftKey: !!config.holdHotkey.shiftKey,
      altKey: !!config.holdHotkey.altKey,
      metaKey: !!config.holdHotkey.metaKey,
      modifierKeycodes: buildModifierKeycodes({
        ctrlKey: !!config.holdHotkey.ctrlKey,
        shiftKey: !!config.holdHotkey.shiftKey,
        altKey: !!config.holdHotkey.altKey,
        metaKey: !!config.holdHotkey.metaKey
      })
    };
    }
  }
  if (!config.hotkey) return null;
  const parsed = parseHotkeyString(config.hotkey);
  if (!parsed) return null;
  return parsed;
}

function matchesHoldSpec(event, spec) {
  return (
    event.keycode === spec.keycode &&
    (!spec.ctrlKey || !!event.ctrlKey) &&
    (!spec.shiftKey || !!event.shiftKey) &&
    (!spec.altKey || !!event.altKey) &&
    (!spec.metaKey || !!event.metaKey)
  );
}

function shouldReleaseHold(event, spec) {
  if (event.keycode === spec.keycode) return true;
  if (config.holdStopOnModifierRelease && spec.modifierKeycodes && spec.modifierKeycodes.has(event.keycode)) {
    return true;
  }
  return false;
}

function matchesToggleHotkey(event) {
  if (!config.hotkey) return false;
  const spec = parseHotkeyString(config.hotkey);
  if (!spec) return false;
  const keycodeMatch = spec.keycode;
  return (
    event.keycode === keycodeMatch &&
    !!event.ctrlKey === !!spec.ctrlKey &&
    !!event.shiftKey === !!spec.shiftKey &&
    !!event.altKey === !!spec.altKey &&
    !!event.metaKey === !!spec.metaKey
  );
}

function parseHotkeyString(hotkey) {
  if (!hotkey) return null;
  const parts = hotkey.split('+').map((p) => p.trim().toLowerCase());
  const wantsCtrl = parts.includes('commandorcontrol') || parts.includes('control') || parts.includes('ctrl');
  const wantsShift = parts.includes('shift');
  const wantsAlt = parts.includes('alt') || parts.includes('option');
  const wantsMeta = parts.includes('command') || parts.includes('meta');
  const keyPart = parts[parts.length - 1];
  const keycodeMatch = keycodeFromKeyPart(keyPart);
  if (!keycodeMatch) return null;
  return {
    keycode: keycodeMatch,
    ctrlKey: wantsCtrl,
    shiftKey: wantsShift,
    altKey: wantsAlt,
    metaKey: wantsMeta,
    modifierKeycodes: buildModifierKeycodes({
      ctrlKey: wantsCtrl,
      shiftKey: wantsShift,
      altKey: wantsAlt,
      metaKey: wantsMeta
    })
  };
}

function buildModifierKeycodes(mods) {
  const codes = new Set();
  if (!hookKeyMap) return codes;
  if (mods.ctrlKey) {
    if (hookKeyMap.Ctrl) codes.add(hookKeyMap.Ctrl);
    if (hookKeyMap.CtrlRight) codes.add(hookKeyMap.CtrlRight);
  }
  if (mods.shiftKey) {
    if (hookKeyMap.Shift) codes.add(hookKeyMap.Shift);
    if (hookKeyMap.ShiftRight) codes.add(hookKeyMap.ShiftRight);
  }
  if (mods.altKey) {
    if (hookKeyMap.Alt) codes.add(hookKeyMap.Alt);
    if (hookKeyMap.AltRight) codes.add(hookKeyMap.AltRight);
  }
  if (mods.metaKey) {
    if (hookKeyMap.Meta) codes.add(hookKeyMap.Meta);
    if (hookKeyMap.MetaRight) codes.add(hookKeyMap.MetaRight);
  }
  return codes;
}

function keycodeFromKeyPart(keyPart) {
  if (hookKeyMap) {
    const mapKey = Object.keys(hookKeyMap).find((k) => k.toLowerCase() === keyPart);
    if (mapKey && hookKeyMap[mapKey]) return hookKeyMap[mapKey];
  }
  const table = {
    space: 57,
    return: 28,
    enter: 28,
    tab: 15,
    escape: 1,
    esc: 1
  };
  if (table[keyPart]) return table[keyPart];
  // Letters A-Z (uiohook keycodes; fallback to ASCII if unknown)
  if (/^[a-z]$/.test(keyPart)) {
    return keyPart.toUpperCase().charCodeAt(0);
  }
  return null;
}

function summarizeEvent(event) {
  return {
    keycode: event.keycode,
    ctrlKey: !!event.ctrlKey,
    shiftKey: !!event.shiftKey,
    altKey: !!event.altKey,
    metaKey: !!event.metaKey
  };
}

function isModifierKeycode(keycode) {
  return modifierKeycodes && modifierKeycodes.has(keycode);
}

function clearHookListeners(h) {
  if (!h) return;
  if (hookListeners.keydown) {
    if (typeof h.off === 'function') h.off('keydown', hookListeners.keydown);
    else if (typeof h.removeListener === 'function') h.removeListener('keydown', hookListeners.keydown);
  }
  if (hookListeners.keyup) {
    if (typeof h.off === 'function') h.off('keyup', hookListeners.keyup);
    else if (typeof h.removeListener === 'function') h.removeListener('keyup', hookListeners.keyup);
  }
  hookListeners = { keydown: null, keyup: null };
}

function safeStartHook(h) {
  try {
    if (typeof h.start === 'function') {
      const result = h.start();
      if (result && typeof result.catch === 'function') {
        result.catch((err) => console.warn('[hotkey] hook start failed:', err));
      }
    }
  } catch (err) {
    console.warn('[hotkey] hook start error:', err);
  }
}

function learnHoldHotkey() {
  const h = tryLoadHook();
  if (!h) return;
  learningHotkey = true;
  console.log('[hotkey] learning hold-to-talk hotkey: press desired combo now');
  const onKeyDown = (event) => {
    if (isModifierKeycode(event.keycode)) {
      console.log('[hotkey] ignoring modifier-only key, press a non-modifier');
      return;
    }
    const next = {
      keycode: event.keycode,
      ctrlKey: !!event.ctrlKey,
      shiftKey: !!event.shiftKey,
      altKey: !!event.altKey,
      metaKey: !!event.metaKey
    };
    config.holdHotkey = next;
    config.holdToTalk = true;
    saveConfig(config);
    learningHotkey = false;
    console.log('[hotkey] learned hold-to-talk hotkey:', next);
    if (typeof h.off === 'function') h.off('keydown', onKeyDown);
    else if (typeof h.removeListener === 'function') h.removeListener('keydown', onKeyDown);
    setupHoldToTalk();
    updateTrayMenu();
  };
  clearHookListeners(h);
  hookListeners = { keydown: onKeyDown, keyup: null };
  h.on('keydown', onKeyDown);
  safeStartHook(h);
}

function toggleHoldToTalk() {
  config.holdToTalk = !config.holdToTalk;
  saveConfig(config);
  registerHotkey();
  updateTrayMenu();
}

async function runWhisperX(audioPath) {
  if (config.asrEngine && config.asrEngine !== 'whisperx') {
    if (!config.useWorker) {
      throw new Error(`${config.asrEngine} engine requires worker (set useWorker=true)`);
    }
    return await transcribeViaWorker(audioPath);
  }
  if (config.useWorker) {
    try {
      const text = await transcribeViaWorker(audioPath);
      if (typeof text === 'string') return text;
    } catch (err) {
      console.warn('[worker] failed, falling back to CLI:', err && err.message ? err.message : err);
    }
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tray-transcriber-'));
  const outputDir = path.join(tmpDir, 'out');
  fs.mkdirSync(outputDir, { recursive: true });

  const prompt = buildInitialPrompt();

  const args = [
    ...config.whisperxArgs,
    audioPath,
    '--output_dir',
    outputDir,
    '--output_format',
    'txt',
    '--language',
    config.language,
    '--model',
    config.model
  ];
  if (config.device === 'cpu') {
    args.push('--device', 'cpu');
  } else if (config.device === 'gpu') {
    args.push('--device', 'cuda');
  }

  if (prompt) {
    args.push('--initial_prompt', prompt);
  }
  if (config.computeType) {
    args.push('--compute_type', config.computeType);
  }
  if (config.batchSize) {
    args.push('--batch_size', String(config.batchSize));
  }
  if (config.noAlign) {
    args.push('--no_align');
  }

  await new Promise((resolve, reject) => {
    const env = buildWorkerEnv();
    const proc = spawn(resolvePythonCommand(), args, { stdio: 'inherit', env });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`whisperx exited with code ${code}`));
    });
  });

  const txtFiles = fs.readdirSync(outputDir).filter((f) => f.endsWith('.txt'));
  if (!txtFiles.length) return '';
  const txtPath = path.join(outputDir, txtFiles[0]);
  const text = fs.readFileSync(txtPath, 'utf8').trim();
  return text;
}

function startWorker() {
  if (workerProc) return;
  const scriptPath = resolveWorkerScriptPath();
  if (!scriptPath) {
    console.error('[worker] worker.py not found');
    return;
  }
  const env = buildWorkerEnv();
  const pythonCmd = resolvePythonCommand();
  try {
    workerProc = spawn(
      pythonCmd,
      ['-u', scriptPath, '--host', config.workerHost, '--port', String(config.workerPort)],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env
      }
    );
  } catch (err) {
    console.error('[worker] spawn failed', err, { pythonCmd, scriptPath });
    workerProc = null;
    return;
  }
  workerProc.stdout.on('data', (chunk) => {
    process.stdout.write(`[worker] ${chunk}`);
  });
  workerProc.stderr.on('data', (chunk) => {
    process.stderr.write(`[worker] ${chunk}`);
  });
  workerProc.on('exit', () => {
    workerProc = null;
    workerReady = false;
    workerPromise = null;
  });
}

function ensureWorker() {
  if (!config.useWorker) return Promise.resolve(false);
  if (workerReady) return Promise.resolve(true);
  if (workerPromise) return workerPromise;
  workerPromise = new Promise((resolve) => {
    startWorker();
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed > config.workerStartupTimeoutMs) {
        clearInterval(timer);
        workerReady = false;
        resolve(false);
        return;
      }
      const req = http.get({ host: config.workerHost, port: config.workerPort, path: '/health', timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          clearInterval(timer);
          workerReady = true;
          resolve(true);
        }
      });
      req.on('error', () => {});
      req.on('timeout', () => {
        req.destroy();
      });
    }, 300);
  });
  return workerPromise;
}

async function transcribeViaWorker(audioPath) {
  const ok = await ensureWorker();
  if (!ok) return null;
  const audioBytes = fs.readFileSync(audioPath);
  const prompt = buildInitialPrompt();
  const payload = {
    engine: config.asrEngine || 'whisperx',
    audio_base64: audioBytes.toString('base64'),
    extension: path.extname(audioPath),
    model: config.model,
    language: config.language,
    compute_type: config.computeType,
    batch_size: config.batchSize,
    no_align: config.noAlign,
    initial_prompt: prompt || undefined,
    device: config.device || 'default'
  };
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const pollMs = config.workerStatusPollMs || 0;
    let statusTimer = null;
    if (pollMs > 0) {
      statusTimer = setInterval(() => {
        fetchWorkerStatus('transcribe_wait');
      }, pollMs);
    }
    const req = http.request(
      {
        host: config.workerHost,
        port: config.workerPort,
        path: '/transcribe',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: config.workerRequestTimeoutMs || 30000
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString('utf8');
        });
        res.on('end', () => {
          if (statusTimer) clearInterval(statusTimer);
          if (res.statusCode !== 200) {
            reject(new Error(`worker error ${res.statusCode}: ${data}`));
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (typeof parsed.segments_len === 'number') {
              console.log('[worker] segments_len=', parsed.segments_len);
            }
            console.log('[worker] transcribe ms=', Date.now() - start);
            resolve(parsed.text || '');
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('timeout', () => {
      if (statusTimer) clearInterval(statusTimer);
      const timeoutMs = config.workerRequestTimeoutMs || 30000;
      req.destroy(new Error(`worker request timeout after ${timeoutMs}ms`));
    });
    req.on('error', (err) => {
      if (statusTimer) clearInterval(statusTimer);
      reject(err);
    });
    req.write(body);
    req.end();
  });
}

function tryPaste(text) {
  clipboard.writeText(text || '');
  if (config.pasteMode !== 'paste') return false;

  const systemResult = tryPasteViaSystem();
  if (systemResult) return true;

  try {
    console.log('[paste] trying robotjs');
    const robot = require('robotjs');
    const modifier = process.platform === 'darwin' ? 'command' : 'control';
    robot.keyTap('v', modifier);
    console.log('[paste] robotjs succeeded');
    return true;
  } catch (err) {
    console.warn('[paste] robotjs failed:', err && err.message ? err.message : err);
    return false;
  }
}

function tryPasteViaSystem() {
  const { spawnSync } = require('child_process');
  const hasCmd = (cmd) => {
    const result = spawnSync('which', [cmd]);
    return result.status === 0;
  };
  const isWayland =
    process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;
  if (process.platform === 'darwin') {
    console.log('[paste] trying osascript');
    const result = spawnSync('osascript', [
      '-e',
      'tell application "System Events" to keystroke "v" using command down'
    ]);
    if (result.status !== 0) {
      console.warn('[paste] osascript failed:', result.stderr ? result.stderr.toString() : result.status);
    } else {
      console.log('[paste] osascript succeeded');
    }
    return result.status === 0;
  }
  if (process.platform === 'win32') {
    console.log('[paste] trying powershell SendKeys');
    const script =
      '$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys("^v")';
    const result = spawnSync('powershell', ['-NoProfile', '-Command', script]);
    if (result.status !== 0) {
      console.warn('[paste] powershell failed:', result.stderr ? result.stderr.toString() : result.status);
    } else {
      console.log('[paste] powershell succeeded');
    }
    return result.status === 0;
  }
  if (hasCmd('wtype')) {
    console.log('[paste] trying wtype');
    const result = spawnSync('wtype', ['-M', 'ctrl', 'v', '-m', 'ctrl']);
    if (result.status !== 0) {
      console.warn('[paste] wtype failed:', result.stderr ? result.stderr.toString() : result.status);
    } else {
      console.log('[paste] wtype succeeded');
    }
    if (result.status === 0) return true;
  }
  if (isWayland && !hasCmd('wtype')) {
    console.warn('[paste] Wayland session detected but wtype not found');
  }
  if (!hasCmd('xdotool')) {
    console.warn('[paste] xdotool not found in PATH');
    return false;
  }
  console.log('[paste] trying xdotool');
  const result = spawnSync('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
  if (result.status !== 0) {
    console.warn('[paste] xdotool failed:', result.stderr ? result.stderr.toString() : result.status);
  } else {
    console.log('[paste] xdotool succeeded');
  }
  return result.status === 0;
}

ipcMain.on('recording-complete', async (_event, payload) => {
  const size = payload && typeof payload.size === 'number' ? payload.size : (payload?.buffer?.length || 0);
  if (!payload || !payload.buffer || size < config.minRecordingBytes) {
    console.log('[record] ignoring empty/short recording', { size, min: config.minRecordingBytes });
    return;
  }
  const buffer = Buffer.from(payload.buffer);
  const ext = payload.extension || 'webm';
  const durationMs = payload.durationMs || 0;
  console.log('[record] received buffer', { size, ext, durationMs });
  const audioPath = path.join(os.tmpdir(), `tray-transcriber-${Date.now()}.${ext}`);
  fs.writeFileSync(audioPath, buffer);
  transcribeQueue.push({ audioPath, size, durationMs });
  console.log('[queue] enqueued', { pending: transcribeQueue.length });
  processTranscribeQueue();
});

async function processTranscribeQueue() {
  if (transcribeRunning) return;
  const next = transcribeQueue.shift();
  if (!next) return;
  transcribeRunning = true;
  try {
    console.log('[transcribe] start', { audioPath: next.audioPath, pending: transcribeQueue.length });
    const rawText = await runWhisperX(next.audioPath);
    console.log('[transcribe] done');
    const text = normalizeTranscript(rawText);
    console.log('[transcript] len=', text.length, 'preview=', text.slice(0, 120));
    if (text) {
      const pasted = tryPaste(text);
      console.log('[paste] result=', pasted ? 'pasted' : 'copied');
      if (!pasted) {
        clipboard.writeText(text);
      }
    } else {
      console.log('[transcript] empty, skipping paste');
    }
  } catch (err) {
    console.error('[transcribe] error', err);
  } finally {
    fs.unlink(next.audioPath, () => {});
    transcribeRunning = false;
    if (transcribeQueue.length) {
      processTranscribeQueue();
    }
  }
}

ipcMain.on('debug-log', (_event, payload) => {
  if (!payload) return;
  if (payload.data) {
    console.log('[renderer]', payload.message, payload.data);
  } else {
    console.log('[renderer]', payload.message);
  }
});

function normalizeTranscript(text) {
  if (!text) return '';
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  return applyDictionaryCorrections(normalized);
}

function buildInitialPrompt() {
  const custom = (config.prompt || '').trim();
  const dictItems = getDictionaryItems();
  const dictText = dictItems.length
    ? `Vocabulary: ${dictItems
        .map((item) => {
          if (config.includeDictionaryDescriptions && item.description) {
            return `${item.term} (${item.description})`;
          }
          return item.term;
        })
        .join(', ')}`
    : '';
  if (!custom && !dictText) return '';
  if (!config.includeDictionaryInPrompt || !dictText) return custom || dictText;
  if (config.promptMode === 'prepend' && custom) {
    return `${dictText}\n${custom}`;
  }
  if (custom) {
    return `${custom}\n${dictText}`;
  }
  return dictText;
}

function getDictionaryItems() {
  const raw = Array.isArray(config.dictionary) ? config.dictionary : [];
  const items = [];
  for (const entry of raw) {
    if (!entry) continue;
    if (typeof entry === 'string') {
      const term = entry.trim();
      if (term) items.push({ term, description: '' });
      continue;
    }
    if (typeof entry === 'object') {
      const term = String(entry.term || entry.word || '').trim();
      const description = String(entry.description || '').trim();
      if (term) items.push({ term, description });
    }
  }
  return items;
}

function getDictionaryCorrections() {
  const raw = Array.isArray(config.dictionaryCorrections) ? config.dictionaryCorrections : [];
  const items = [];
  for (const entry of raw) {
    if (!entry) continue;
    if (typeof entry === 'object') {
      const from = String(entry.from || entry.source || '').trim();
      const to = String(entry.to || entry.target || '').trim();
      if (from && to) items.push({ from, to });
    }
  }
  return items;
}

function applyDictionaryCorrections(text) {
  const rules = getDictionaryCorrections();
  if (!rules.length) return text;
  let result = text;
  for (const rule of rules) {
    const escaped = rule.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, rule.to);
  }
  return result;
}

app.whenReady().then(() => {
  config = loadConfig();
  logger = createLogger();
  installConsoleLogger();
  createWindow();

  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  Menu.setApplicationMenu(null);

  tray = new Tray(buildTrayIcon());
  tray.setToolTip('Tray Transcriber');
  updateTrayMenu();

  registerHotkey();
  if (config.useWorker) {
    ensureWorker();
    if (config.workerWarmup) {
      warmupWorker();
    }
  }
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  if (workerProc) {
    workerProc.kill();
  }
});

app.on('activate', () => {
  if (!win) createWindow();
});

ipcMain.on('config-updated', (_event, newConfig) => {
  config = { ...config, ...newConfig };
  saveConfig(config);
  logger = createLogger();
  installConsoleLogger();
  registerHotkey();
  updateTrayMenu();
  restartWorker();
  reloadAllWindows();
});

ipcMain.handle('get-config', () => {
  return { ...config };
});

function reloadAllWindows() {
  if (win && !win.isDestroyed()) {
    win.reload();
  }
  if (configWin && !configWin.isDestroyed()) {
    configWin.reload();
  }
}

function restartWorker() {
  if (workerProc) {
    workerProc.kill();
    workerProc = null;
  }
  workerReady = false;
  workerPromise = null;
  workerWarmupKey = null;
  if (config.useWorker) {
    ensureWorker();
    if (config.workerWarmup) {
      warmupWorker();
    }
  }
}

async function warmupWorker() {
  const key = `${config.model}|${config.language || ''}|${config.computeType || ''}|${config.batchSize || ''}`;
  if (workerWarmupKey === key) return;
  const ok = await ensureWorker();
  if (!ok) return;
  const payload = {
    engine: config.asrEngine || 'whisperx',
    model: config.model,
    language: config.language,
    compute_type: config.computeType,
    device: config.device || 'default'
  };
  await new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        host: config.workerHost,
        port: config.workerPort,
        path: '/warmup',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        res.resume();
        if (res.statusCode === 200) {
          workerWarmupKey = key;
        }
        resolve();
      }
    );
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}

function fetchWorkerStatus(context) {
  if (!config.useWorker) {
    console.log('[worker] status: disabled');
    return;
  }
  const req = http.get(
    { host: config.workerHost, port: config.workerPort, path: '/status', timeout: 2000 },
    (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString('utf8');
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.log('[worker] status error', context || '', res.statusCode, data);
          return;
        }
        try {
          const parsed = JSON.parse(data);
          console.log('[worker] status', context || '', parsed);
        } catch (err) {
          console.log('[worker] status parse error', context || '', err);
        }
      });
    }
  );
  req.on('error', (err) => {
    console.log('[worker] status request failed', context || '', err.message);
  });
  req.on('timeout', () => {
    req.destroy(new Error('status timeout'));
  });
}
