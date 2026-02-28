import path from 'node:path';
import { app } from '../ctx.js';
import { canonicalSecretRef } from './secret-refs.js';
import type {
  CapabilityConfig,
  ProviderCapability,
  ProviderProfile,
  RuntimeConfig
} from './types.js';

function asString(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeProfiles(raw: unknown, fallback: ProviderProfile[]): ProviderProfile[] {
  if (!Array.isArray(raw) || !raw.length) return fallback;
  const next: ProviderProfile[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, any>;
    const providerId = asString(obj.providerId);
    const id = asString(obj.id);
    if (!providerId || !id) continue;
    next.push({
      id,
      providerId,
      label: asString(obj.label, id),
      endpoint: asString(obj.endpoint),
      model: asString(obj.model),
      language: asString(obj.language),
      localPath: asString(obj.localPath),
      secretRef: canonicalSecretRef(asString(obj.secretRef)),
      options: obj.options && typeof obj.options === 'object' ? { ...obj.options } : {}
    });
  }
  return next.length ? next : fallback;
}

function normalizeCapability(raw: unknown, fallback: CapabilityConfig): CapabilityConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const profiles = normalizeProfiles(obj.profiles, fallback.profiles);
  const activeProviderId = asString(obj.activeProviderId, fallback.activeProviderId);
  const activeProfileId = asString(obj.activeProfileId, fallback.activeProfileId || '');
  return {
    activeProviderId,
    activeProfileId: activeProfileId || undefined,
    profiles
  };
}

function rawCapability(input: Record<string, any>, capability: ProviderCapability): Record<string, any> {
  const providers = input.providers && typeof input.providers === 'object' ? input.providers : {};
  const value = (providers as any)?.[capability];
  return value && typeof value === 'object' ? value : {};
}

function rawActiveProfile(raw: Record<string, any>, providerId: string): Record<string, any> | null {
  const profiles = Array.isArray(raw.profiles) ? raw.profiles : [];
  const activeProfileId = asString(raw.activeProfileId);
  if (activeProfileId) {
    const exact = profiles.find((entry: any) => entry && asString(entry.id) === activeProfileId && asString(entry.providerId) === providerId);
    if (exact && typeof exact === 'object') return exact;
  }
  const byProvider = profiles.find((entry: any) => entry && asString(entry.providerId) === providerId);
  if (byProvider && typeof byProvider === 'object') return byProvider;
  return null;
}

function applyLegacyProfileMigration(normalized: RuntimeConfig, input: Record<string, any>): void {
  const rawLlmCapability = rawCapability(input, 'llm');
  const activeLlm = getActiveProviderConfig(normalized, 'llm');
  if (activeLlm.profile) {
    const rawLlmProfile = rawActiveProfile(rawLlmCapability, activeLlm.providerId);
    const legacyEndpoint = asString(input.llmEndpoint);
    const legacyModel = asString(input.llmModel);
    const legacyAssistantName = asString(input.assistantName);
    const legacySystemPrompt = String(input.llmSystemPrompt ?? '');
    const profile = activeLlm.profile as any;
    if (!profile.options || typeof profile.options !== 'object') profile.options = {};

    if (legacyEndpoint && (!rawLlmProfile || !asString(rawLlmProfile.endpoint))) {
      profile.endpoint = legacyEndpoint;
    }
    if (legacyModel && (!rawLlmProfile || !asString(rawLlmProfile.model))) {
      profile.model = legacyModel;
    }
    const rawLlmOptions = rawLlmProfile?.options && typeof rawLlmProfile.options === 'object' ? rawLlmProfile.options : {};
    if (legacyAssistantName && !asString((rawLlmOptions as any).assistantName)) {
      profile.options.assistantName = legacyAssistantName;
    }
    if (legacySystemPrompt && String((rawLlmOptions as any).systemPrompt ?? '') === '') {
      profile.options.systemPrompt = legacySystemPrompt;
    }
  }

  const legacyOcr = input.ocr && typeof input.ocr === 'object' ? input.ocr : {};
  const legacyMode = legacyOcr.mode === 'local_tesseract' ? 'local_tesseract' : legacyOcr.mode === 'llm_vision' ? 'llm_vision' : '';
  if (legacyMode) {
    const targetProviderId = legacyMode === 'local_tesseract' ? 'ocr.local_tesseract' : 'ocr.llm_vision';
    const rawOcrCapability = rawCapability(input, 'ocr');
    if (!asString(rawOcrCapability.activeProviderId)) {
      normalized.providers.ocr.activeProviderId = targetProviderId;
      const first = normalized.providers.ocr.profiles.find((profile) => profile.providerId === targetProviderId);
      if (first) normalized.providers.ocr.activeProfileId = first.id;
    }
  }

  const activeOcr = getActiveProviderConfig(normalized, 'ocr');
  if (!activeOcr.profile) return;
  const rawOcrCapability = rawCapability(input, 'ocr');
  const rawOcrProfile = rawActiveProfile(rawOcrCapability, activeOcr.providerId);
  const rawOcrOptions = rawOcrProfile?.options && typeof rawOcrProfile.options === 'object' ? rawOcrProfile.options : {};
  const profile = activeOcr.profile as any;
  if (!profile.options || typeof profile.options !== 'object') profile.options = {};

  if (legacyMode === 'llm_vision' && activeOcr.providerId === 'ocr.llm_vision') {
    const legacyPrompt = String(legacyOcr?.vision?.systemPrompt ?? '').trim();
    const legacyTimeout = Number(legacyOcr?.vision?.requestTimeoutMs);
    if (legacyPrompt && String((rawOcrOptions as any).systemPrompt ?? '') === '') {
      profile.options.systemPrompt = legacyPrompt;
    }
    if (Number.isFinite(legacyTimeout) && !Number.isFinite(Number((rawOcrOptions as any).requestTimeoutMs))) {
      profile.options.requestTimeoutMs = legacyTimeout;
    }
  }

  if (legacyMode === 'local_tesseract' && activeOcr.providerId === 'ocr.local_tesseract') {
    const legacyBinaryPath = String(legacyOcr?.localTesseract?.binaryPath ?? '').trim();
    const legacyLanguage = String(legacyOcr?.localTesseract?.language ?? '').trim();
    const legacyExtraArgs = String(legacyOcr?.localTesseract?.extraArgs ?? '').trim();
    const legacyTimeout = Number(legacyOcr?.localTesseract?.timeoutMs);

    if (legacyBinaryPath && (!rawOcrProfile || !asString(rawOcrProfile.localPath))) {
      profile.localPath = legacyBinaryPath;
    }
    if (legacyLanguage && String((rawOcrOptions as any).language ?? '').trim() === '') {
      profile.options.language = legacyLanguage;
    }
    if (legacyExtraArgs && String((rawOcrOptions as any).extraArgs ?? '').trim() === '') {
      profile.options.extraArgs = legacyExtraArgs;
    }
    if (Number.isFinite(legacyTimeout) && !Number.isFinite(Number((rawOcrOptions as any).timeoutMs))) {
      profile.options.timeoutMs = legacyTimeout;
    }
  }
}

export function buildDefaultRuntimeConfig(): RuntimeConfig {
  const userData = app?.getPath?.('userData') || process.cwd();
  const installRoot = path.join(userData, 'providers');
  const socketPath = process.platform === 'win32'
    ? path.join(userData, 'tray-runtime.sock')
    : path.join(userData, 'tray-runtime.sock');

  return {
    configVersion: 3,
    runtimeNotice: '',
    providers: {
      stt: {
        activeProviderId: 'stt.local.faster_whisper',
        activeProfileId: 'stt-local-default',
        profiles: [
          {
            id: 'stt-local-default',
            providerId: 'stt.local.faster_whisper',
            label: 'Local faster-whisper',
            model: 'small',
            language: 'en',
            options: {
              device: 'default',
              computeType: 'int8',
              batchSize: 4,
              noAlign: true,
              useWorker: true,
              workerWarmup: true,
              workerTransport: 'stdio',
              workerHost: '127.0.0.1',
              workerPort: 8765,
              workerRequestTimeoutMs: 600000,
              workerStatusPollMs: 30000,
              workerStartupTimeoutMs: 15000
            }
          },
          {
            id: 'stt-openai-default',
            providerId: 'stt.remote.openai_compatible',
            label: 'OpenAI-compatible STT',
            endpoint: 'https://api.openai.com',
            model: 'gpt-4o-mini-transcribe',
            secretRef: 'providers.stt.openai_compatible.api_key',
            options: {}
          },
          {
            id: 'stt-deepgram-default',
            providerId: 'stt.remote.deepgram',
            label: 'Deepgram STT',
            endpoint: 'https://api.deepgram.com',
            model: 'nova-2',
            secretRef: 'providers.stt.deepgram.api_key',
            options: {}
          },
          {
            id: 'stt-google-default',
            providerId: 'stt.remote.google',
            label: 'Google STT',
            endpoint: 'https://speech.googleapis.com',
            model: 'latest_long',
            secretRef: 'providers.stt.google.api_key',
            options: {}
          }
        ]
      },
      llm: {
        activeProviderId: 'llm.openai_compatible',
        activeProfileId: 'llm-openai-default',
        profiles: [
          {
            id: 'llm-openai-default',
            providerId: 'llm.openai_compatible',
            label: 'OpenAI-compatible',
            endpoint: 'https://api.openai.com',
            model: 'gpt-5-nano',
            secretRef: 'providers.llm.openai_compatible.api_key',
            options: {
              assistantName: 'Luna',
              systemPrompt: ''
            }
          },
          {
            id: 'llm-ollama-default',
            providerId: 'llm.ollama',
            label: 'Ollama',
            endpoint: 'http://127.0.0.1:11434',
            model: 'llama3.1:8b',
            options: {
              assistantName: 'Luna',
              systemPrompt: ''
            }
          },
          {
            id: 'llm-lmstudio-default',
            providerId: 'llm.lmstudio',
            label: 'LM Studio',
            endpoint: 'http://127.0.0.1:1234',
            model: 'gpt-4o-mini',
            options: {
              assistantName: 'Luna',
              systemPrompt: ''
            }
          }
        ]
      },
      ocr: {
        activeProviderId: 'ocr.llm_vision',
        activeProfileId: 'ocr-vision-default',
        profiles: [
          {
            id: 'ocr-vision-default',
            providerId: 'ocr.llm_vision',
            label: 'Vision OCR',
            model: 'gpt-4o-mini',
            endpoint: 'https://api.openai.com',
            secretRef: 'providers.ocr.llm_vision.api_key',
            options: {
              systemPrompt: 'Extract all visible text verbatim. Preserve line breaks. No summary.',
              requestTimeoutMs: 30000
            }
          },
          {
            id: 'ocr-local-default',
            providerId: 'ocr.local_tesseract',
            label: 'Local Tesseract',
            localPath: 'tesseract',
            options: {
              language: 'eng',
              extraArgs: '',
              timeoutMs: 15000
            }
          }
        ]
      }
    },
    runtimeApi: {
      enabled: true,
      transport: 'tcp',
      host: '127.0.0.1',
      port: 48765,
      socketPath,
      authRequired: true
    },
    installer: {
      installRoot,
      updateChecks: {
        enabled: true,
        intervalHours: 24,
        lastCheckedAt: 0
      }
    },
    secrets: {
      fallbackWarningAcknowledged: false
    }
  };
}

export function normalizeRuntimeConfig(raw: unknown): RuntimeConfig {
  const defaults = buildDefaultRuntimeConfig();
  const input = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};

  const providers = input.providers && typeof input.providers === 'object' ? input.providers : {};

  const normalized = {
    ...defaults,
    configVersion: 3,
    runtimeNotice: asString(input.runtimeNotice),
    providers: {
      stt: normalizeCapability((providers as any).stt, defaults.providers.stt),
      llm: normalizeCapability((providers as any).llm, defaults.providers.llm),
      ocr: normalizeCapability((providers as any).ocr, defaults.providers.ocr)
    },
    runtimeApi: {
      enabled: asBoolean(input.runtimeApi?.enabled, defaults.runtimeApi.enabled),
      transport: input.runtimeApi?.transport === 'socket' ? 'socket' : 'tcp',
      host: asString(input.runtimeApi?.host, defaults.runtimeApi.host),
      port: asNumber(input.runtimeApi?.port, defaults.runtimeApi.port, 1024, 65535),
      socketPath: asString(input.runtimeApi?.socketPath, defaults.runtimeApi.socketPath),
      authRequired: asBoolean(input.runtimeApi?.authRequired, defaults.runtimeApi.authRequired)
    },
    installer: {
      installRoot: asString(input.installer?.installRoot, defaults.installer.installRoot),
      updateChecks: {
        enabled: asBoolean(input.installer?.updateChecks?.enabled, defaults.installer.updateChecks.enabled),
        intervalHours: asNumber(input.installer?.updateChecks?.intervalHours, defaults.installer.updateChecks.intervalHours, 1, 168),
        lastCheckedAt: asNumber(input.installer?.updateChecks?.lastCheckedAt, defaults.installer.updateChecks.lastCheckedAt, 0, Number.MAX_SAFE_INTEGER)
      }
    },
    secrets: {
      fallbackWarningAcknowledged: asBoolean(input.secrets?.fallbackWarningAcknowledged, defaults.secrets.fallbackWarningAcknowledged)
    }
  };

  applyLegacyProfileMigration(normalized as RuntimeConfig, input);

  const activeStt = getActiveProviderConfig(normalized as RuntimeConfig, 'stt');
  const sttOptions = activeStt.profile?.options || {};
  const providerIdToEngine: Record<string, string> = {
    'stt.local.whisperx': 'whisperx',
    'stt.local.whisper': 'whisper',
    'stt.local.faster_whisper': 'faster-whisper'
  };
  (normalized as any).asrEngine = providerIdToEngine[activeStt.providerId] || 'faster-whisper';
  (normalized as any).model = String(activeStt.profile?.model || 'small');
  (normalized as any).language = String(activeStt.profile?.language || 'en');
  (normalized as any).device = String(sttOptions.device || 'default');
  (normalized as any).computeType = String(sttOptions.computeType || 'int8');
  (normalized as any).batchSize = Number(sttOptions.batchSize || 4);
  (normalized as any).noAlign = !!sttOptions.noAlign;
  (normalized as any).useWorker = sttOptions.useWorker !== false;
  (normalized as any).workerWarmup = sttOptions.workerWarmup !== false;
  (normalized as any).workerHost = String(sttOptions.workerHost || '127.0.0.1');
  (normalized as any).workerPort = Number(sttOptions.workerPort || 8765);
  (normalized as any).workerTransport = String(sttOptions.workerTransport || 'stdio');
  (normalized as any).workerStartupTimeoutMs = Number(sttOptions.workerStartupTimeoutMs || 15000);
  (normalized as any).workerRequestTimeoutMs = Number(sttOptions.workerRequestTimeoutMs || 600000);
  (normalized as any).workerStatusPollMs = Number(sttOptions.workerStatusPollMs || 30000);

  const activeLlm = getActiveProviderConfig(normalized as RuntimeConfig, 'llm');
  const llmOptions = activeLlm.profile?.options || {};
  (normalized as any).llmEndpoint = String(activeLlm.profile?.endpoint || 'https://api.openai.com');
  (normalized as any).llmModel = String(activeLlm.profile?.model || 'gpt-5-nano');
  (normalized as any).llmSystemPrompt = String(llmOptions.systemPrompt || '');
  (normalized as any).assistantName = String(llmOptions.assistantName || 'Luna');

  const activeOcr = getActiveProviderConfig(normalized as RuntimeConfig, 'ocr');
  const ocrOptions = activeOcr.profile?.options || {};
  const ocrMode = activeOcr.providerId === 'ocr.local_tesseract' ? 'local_tesseract' : 'llm_vision';
  (normalized as any).ocr = {
    mode: ocrMode,
    vision: {
      systemPrompt: String(ocrOptions.systemPrompt || 'Extract all visible text verbatim. Preserve line breaks. No summary.'),
      requestTimeoutMs: Number(ocrOptions.requestTimeoutMs || 30000)
    },
    localTesseract: {
      binaryPath: String(activeOcr.profile?.localPath || ocrOptions.binaryPath || 'tesseract'),
      language: String(ocrOptions.language || 'eng'),
      extraArgs: String(ocrOptions.extraArgs || ''),
      timeoutMs: Number(ocrOptions.timeoutMs || 15000)
    }
  };

  return normalized as RuntimeConfig;
}

export function getActiveProviderConfig(config: RuntimeConfig, capability: ProviderCapability): {
  providerId: string;
  profile: ProviderProfile | null;
} {
  const capabilityConfig = config.providers[capability];
  const providerId = capabilityConfig.activeProviderId;
  const preferredProfileId = capabilityConfig.activeProfileId;
  let profile = capabilityConfig.profiles.find((entry) => entry.id === preferredProfileId && entry.providerId === providerId) || null;
  if (!profile) {
    profile = capabilityConfig.profiles.find((entry) => entry.providerId === providerId) || null;
  }
  return { providerId, profile };
}
