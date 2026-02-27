import path from 'node:path';
import fs from 'node:fs';
import { app } from './ctx.js';
import { normalizeShortcutConfig } from './shortcuts/schema.js';
import { DEFAULT_OCR_SETTINGS, normalizeOcrSettings } from './ocr-schema.js';
import { normalizeLlmHost } from './llm-api.js';

export const defaultConfig = {
  preferKeyHook: true,
  shortcutsVersion: 2,
  shortcutDefaults: {
    assistantInputMode: 'prompt_plus_selection',
    textOutputMode: 'paste_then_clipboard',
    ocrProviderId: ''
  },
  shortcuts: [
    {
      id: 'recording-main',
      label: 'Recording',
      enabled: true,
      shortcut: 'CommandOrControl+Shift+Space',
      steps: [{ stepType: 'record_hold_to_talk', holdStopOnModifierRelease: false }]
    }
  ],
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
  llmEndpoint: 'https://api.openai.com',
  llmModel: 'gpt-5-nano',
  llmApiKey: '',
  llmSystemPrompt: '',
  ocr: { ...DEFAULT_OCR_SETTINGS },
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
    const parsed = JSON.parse(raw);
    const merged = {
      ...defaultConfig,
      ...parsed,
      llmEndpoint: normalizeLlmHost((parsed as any)?.llmEndpoint ?? defaultConfig.llmEndpoint),
      ocr: normalizeOcrSettings((parsed as any)?.ocr)
    };
    const normalized = normalizeShortcutConfig(merged);
    normalized.normalizedConfig.ocr = normalizeOcrSettings((normalized.normalizedConfig as any).ocr);
    (normalized.normalizedConfig as any).llmEndpoint = normalizeLlmHost((normalized.normalizedConfig as any).llmEndpoint);
    if (normalized.migrated || raw.trim() !== JSON.stringify(normalized.normalizedConfig, null, 2)) {
      fs.writeFileSync(configPath, JSON.stringify(normalized.normalizedConfig, null, 2));
    }
    return normalized.normalizedConfig as any;
  } catch (_err) {
    try { fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2)); } catch (_) {}
    return { ...defaultConfig };
  }
}

export function saveConfig(cfg: any): void {
  const normalized = normalizeShortcutConfig({
    ...(cfg || {}),
    llmEndpoint: normalizeLlmHost(cfg?.llmEndpoint),
    ocr: normalizeOcrSettings(cfg?.ocr)
  });
  normalized.normalizedConfig.ocr = normalizeOcrSettings((normalized.normalizedConfig as any).ocr);
  (normalized.normalizedConfig as any).llmEndpoint = normalizeLlmHost((normalized.normalizedConfig as any).llmEndpoint);
  fs.writeFileSync(getConfigPath(), JSON.stringify(normalized.normalizedConfig, null, 2));
}
