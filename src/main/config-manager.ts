import path from 'node:path';
import fs from 'node:fs';
import { app } from './ctx.js';

export const defaultConfig = {
  hotkey: 'CommandOrControl+Shift+Space',
  holdToTalk: true,
  holdHotkey: null as any,
  preferKeyHook: true,
  pressToTalk: true,
  holdStopOnModifierRelease: false,
  pasteMode: 'clipboard',
  dictionary: ['OpenAI', 'WhisperX'] as any[],
  includeDictionaryInPrompt: true,
  includeDictionaryDescriptions: false,
  dictionaryCorrections: [] as any[],
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
  workerTransport: 'http',
  workerStartupTimeoutMs: 15000,
  workerWarmup: true,
  workerRequestTimeoutMs: 600000,
  workerStatusPollMs: 30000,
  whisperxCommand: 'python',
  whisperxArgs: ['-m', 'whisperx', '--device', 'cpu'],
  // assistant / LLM settings
  assistantName: 'Luna',
  llmEndpoint: 'https://api.openai.com/v1/chat/completions',
  llmModel: 'gpt-5-nano',
  llmApiKey: '',
  llmSystemPrompt: '',
  assistantShortcuts: [] as any[],
  // when true, renderer windows will show a busy (spinner/wait) cursor while the
  // tray icon is in the "busy" state. This mirrors the whisk wheel users expect
  // on macOS/Windows during long operations.
  cursorBusy: false
};

export function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

export function loadConfig(): typeof defaultConfig {
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
  } catch (_err) {
    try { fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2)); } catch (_) {}
    return { ...defaultConfig };
  }
}

export function saveConfig(cfg: any): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2));
}
