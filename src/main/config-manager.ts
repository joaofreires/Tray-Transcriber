import path from 'node:path';
import fs from 'node:fs';
import { app } from './ctx.js';
import { normalizeShortcutConfig } from './shortcuts/schema.js';
import { DEFAULT_OCR_SETTINGS, normalizeOcrSettings } from './ocr-schema.js';
import { buildDefaultRuntimeConfig, normalizeRuntimeConfig } from './runtime/runtime-config.js';

function deriveLegacyDefaults(runtimeDefaults: any): Record<string, any> {
  const sttConfig = runtimeDefaults.providers?.stt || {};
  const sttProfile = (sttConfig.profiles || []).find((entry: any) => entry.providerId === sttConfig.activeProviderId) || {};
  const sttOptions = sttProfile.options || {};

  const llmConfig = runtimeDefaults.providers?.llm || {};
  const llmProfile = (llmConfig.profiles || []).find((entry: any) => entry.providerId === llmConfig.activeProviderId) || {};
  const llmOptions = llmProfile.options || {};

  const providerToEngine: Record<string, string> = {
    'stt.local.whisperx': 'whisperx',
    'stt.local.whisper': 'whisper',
    'stt.local.faster_whisper': 'faster-whisper'
  };

  return {
    asrEngine: providerToEngine[String(sttConfig.activeProviderId || '')] || 'faster-whisper',
    model: sttProfile.model || 'small',
    language: sttProfile.language || 'en',
    device: sttOptions.device || 'default',
    computeType: sttOptions.computeType || 'int8',
    batchSize: Number(sttOptions.batchSize || 4),
    noAlign: !!sttOptions.noAlign,
    useWorker: sttOptions.useWorker !== false,
    workerWarmup: sttOptions.workerWarmup !== false,
    workerHost: sttOptions.workerHost || '127.0.0.1',
    workerPort: Number(sttOptions.workerPort || 8765),
    workerTransport: sttOptions.workerTransport || 'stdio',
    workerStartupTimeoutMs: Number(sttOptions.workerStartupTimeoutMs || 15000),
    workerRequestTimeoutMs: Number(sttOptions.workerRequestTimeoutMs || 600000),
    workerStatusPollMs: Number(sttOptions.workerStatusPollMs || 30000),
    llmEndpoint: llmProfile.endpoint || 'https://api.openai.com',
    llmModel: llmProfile.model || 'gpt-5-nano',
    llmApiKey: '',
    llmSystemPrompt: llmOptions.systemPrompt || '',
    assistantName: llmOptions.assistantName || 'Luna'
  };
}

function createDefaultConfig(): any {
  const runtimeDefaults = buildDefaultRuntimeConfig();
  const legacyDefaults = deriveLegacyDefaults(runtimeDefaults);

  return {
    ...runtimeDefaults,
    ...legacyDefaults,
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
    disableCuda: true,
    forceNoWeightsOnlyLoad: true,
    minRecordingBytes: 200,
    whisperxCommand: 'python',
    whisperxArgs: ['-m', 'whisperx', '--device', 'cpu'],
    ocr: { ...DEFAULT_OCR_SETTINGS },
    cursorBusy: false
  };
}

export const defaultConfig = createDefaultConfig();

export function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function normalizeConfig(raw: any): any {
  const runtimeNormalized = normalizeRuntimeConfig(raw || {});
  const merged = {
    ...defaultConfig,
    ...(raw || {}),
    ...runtimeNormalized,
    providers: runtimeNormalized.providers,
    installer: runtimeNormalized.installer,
    runtimeApi: runtimeNormalized.runtimeApi,
    secrets: runtimeNormalized.secrets,
    configVersion: 3,
    ocr: normalizeOcrSettings((raw || {}).ocr ?? (runtimeNormalized as any).ocr)
  };

  const legacyDefaults = deriveLegacyDefaults(runtimeNormalized as any);
  for (const [key, value] of Object.entries(legacyDefaults)) {
    if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
      merged[key] = value;
    }
  }

  const normalizedShortcuts = normalizeShortcutConfig(merged);
  normalizedShortcuts.normalizedConfig.ocr = normalizeOcrSettings((normalizedShortcuts.normalizedConfig as any).ocr);
  return normalizedShortcuts.normalizedConfig;
}

export function loadConfig(): typeof defaultConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    return { ...defaultConfig };
  }

  try {
    const rawText = fs.readFileSync(configPath, 'utf8');
    const parsed = rawText?.trim() ? JSON.parse(rawText) : {};

    if (Number(parsed?.configVersion || 0) !== 3) {
      const hardReset = {
        ...defaultConfig,
        runtimeNotice: 'Settings reset due runtime upgrade (config v3).'
      };
      fs.writeFileSync(configPath, JSON.stringify(hardReset, null, 2));
      return hardReset as any;
    }

    const normalized = normalizeConfig(parsed);
    const normalizedText = JSON.stringify(normalized, null, 2);
    if (rawText.trim() !== normalizedText) {
      fs.writeFileSync(configPath, normalizedText);
    }
    return normalized as any;
  } catch (_err) {
    try { fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2)); } catch {}
    return { ...defaultConfig };
  }
}

export function saveConfig(cfg: any): void {
  const normalized = normalizeConfig(cfg || {});
  fs.writeFileSync(getConfigPath(), JSON.stringify(normalized, null, 2));
}
