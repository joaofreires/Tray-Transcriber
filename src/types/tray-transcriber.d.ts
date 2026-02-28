type RecordingPayload = {
  isRecording: boolean;
};

type RecordingCompletePayload = {
  buffer: number[];
  extension: string;
  size: number;
  durationMs: number;
  uiSession?: boolean;
};

type TranscriptReadyPayload = {
  text: string;
};

type RecordingStatePayload = {
  isRecording: boolean;
};

type DictionaryEntry = {
  term: string;
  description?: string;
};

type CorrectionEntry = {
  from: string;
  to: string;
};

type AssistantInputMode = 'prompt_plus_selection' | 'prompt_only';

type TextOutputMode = 'paste_then_clipboard' | 'clipboard_only';

type OcrMode = 'llm_vision' | 'local_tesseract';

type OcrSettings = {
  mode: OcrMode;
  vision?: {
    systemPrompt?: string;
    requestTimeoutMs?: number;
  };
  localTesseract?: {
    binaryPath?: string;
    language?: string;
    extraArgs?: string;
    timeoutMs?: number;
  };
};

type ShortcutStep =
  | { stepType: 'record_toggle' }
  | { stepType: 'record_press_to_talk' }
  | { stepType: 'record_hold_to_talk'; holdStopOnModifierRelease?: boolean }
  | { stepType: 'screenshot_capture'; mode: 'region' | 'active_window' | 'full_screen' | 'choose_each_time' }
  | { stepType: 'ocr_extract'; providerId?: string; languageHint?: string }
  | { stepType: 'assistant_prompt'; prompt: string; inputMode?: AssistantInputMode }
  | { stepType: 'output_text'; outputMode?: TextOutputMode };

type ShortcutDefinition = {
  id: string;
  label: string;
  enabled: boolean;
  shortcut: string;
  steps: ShortcutStep[];
};

type ShortcutDefaults = {
  assistantInputMode?: AssistantInputMode;
  textOutputMode?: TextOutputMode;
  ocrProviderId?: string;
};

type SaveConfigError = {
  code: string;
  message: string;
  shortcutId?: string;
  field?: string;
  stepIndex?: number;
};

type SaveConfigWarning = {
  code: 'SHORTCUT_REGISTER_FAILED' | 'SHORTCUT_RESERVED_OR_UNAVAILABLE';
  message: string;
  shortcutId?: string;
  field?: 'shortcut';
};

type SaveConfigResult =
  | { ok: true; warnings?: SaveConfigWarning[] }
  | { ok: false; code: string; errors: SaveConfigError[] };

type ConfigChangedPayload = {
  changedKeys: string[];
  config: AppConfig;
  sourceWindowType?: 'main' | 'config' | 'unknown';
};

type VerificationTarget = 'runtime_api' | 'llm' | 'ocr';

type VerificationResult = {
  ok: boolean;
  target: VerificationTarget;
  message: string;
  details?: string;
  error?: string;
  issueUrl?: string;
};

type AssistantShortcut = {
  shortcut: string;
  prompt: string;
};

type HistoryEntry = {
  id: number;
  sessionId: string;
  entryType: string;
  timestamp: number;
  title: string;
  preview: string;
  content: string;
  metadata: Record<string, unknown>;
};

type HistorySummary = Omit<HistoryEntry, 'content'>;

type ProviderCapability = 'stt' | 'llm' | 'ocr';
type ProviderHealth = 'healthy' | 'degraded' | 'unavailable';
type InstallAction = 'install' | 'update' | 'remove' | 'use_existing';
type InstallJobState = 'queued' | 'downloading' | 'verifying' | 'installing' | 'completed' | 'failed' | 'cancelled';

type ProviderProfile = {
  id: string;
  providerId: string;
  label: string;
  endpoint?: string;
  model?: string;
  language?: string;
  localPath?: string;
  options?: Record<string, unknown>;
  secretRef?: string;
};

type ProviderDescriptor = {
  id: string;
  capability: ProviderCapability;
  displayName: string;
  kind: 'local' | 'remote';
  requiresInstall: boolean;
  supportsLocalPath: boolean;
  active?: boolean;
};

type ProviderStatus = {
  providerId: string;
  capability: ProviderCapability;
  installed: boolean;
  health: ProviderHealth;
  version?: string;
  message?: string;
  details?: Record<string, unknown>;
};

type InstallJob = {
  id: string;
  providerId: string;
  action: InstallAction;
  state: InstallJobState;
  createdAt: number;
  updatedAt: number;
  message?: string;
  localPath?: string;
};

type AppConfig = {
  configVersion?: number;
  shortcutsVersion?: number;
  shortcutDefaults?: ShortcutDefaults;
  shortcuts?: ShortcutDefinition[];
  providers?: {
    stt?: { activeProviderId?: string; activeProfileId?: string; profiles?: ProviderProfile[] };
    llm?: { activeProviderId?: string; activeProfileId?: string; profiles?: ProviderProfile[] };
    ocr?: { activeProviderId?: string; activeProfileId?: string; profiles?: ProviderProfile[] };
  };
  installer?: {
    installRoot?: string;
    updateChecks?: { enabled?: boolean; intervalHours?: number; lastCheckedAt?: number };
  };
  runtimeApi?: {
    enabled?: boolean;
    transport?: 'tcp' | 'socket';
    host?: string;
    port?: number;
    socketPath?: string;
    authRequired?: boolean;
  };
  secrets?: {
    fallbackWarningAcknowledged?: boolean;
  };
  pasteMode?: string;
  asrEngine?: string;
  model?: string;
  language?: string;
  device?: string;
  assistantName?: string;
  llmEndpoint?: string;
  llmModel?: string;
  llmApiKey?: string;
  llmSystemPrompt?: string;
  ocr?: OcrSettings;
  computeType?: string;
  batchSize?: number;
  noAlign?: boolean;
  dictionary?: DictionaryEntry[];
  dictionaryCorrections?: CorrectionEntry[];
  // legacy compatibility only
  assistantShortcuts?: AssistantShortcut[];
  includeDictionaryInPrompt?: boolean;
  includeDictionaryDescriptions?: boolean;
  prompt?: string;
  promptMode?: string;
  useWorker?: boolean;
  workerWarmup?: boolean;
  workerHost?: string;
  workerPort?: number;
  workerTransport?: string;
  workerRequestTimeoutMs?: number;
  minRecordingBytes?: number;
  workerStatusPollMs?: number;
  holdStopOnModifierRelease?: boolean;
  logLevel?: string;
  pythonPath?: string;
  disableCuda?: boolean;
  forceNoWeightsOnlyLoad?: boolean;
};

type TrayTranscriberApi = {
  onToggleRecording: (cb: (payload: RecordingPayload) => void) => (() => void) | undefined;
  onTranscriptReady: (cb: (payload: TranscriptReadyPayload) => void) => (() => void) | undefined;
  notifyRecordingComplete: (data: RecordingCompletePayload) => void;
  setRecordingState: (payload: RecordingStatePayload) => void;
  updateTrayIcon: () => void;
  updateConfig: (config: AppConfig) => Promise<SaveConfigResult>;
  getConfig: () => Promise<AppConfig>;
  onConfigChanged: (cb: (payload: ConfigChangedPayload) => void) => (() => void) | undefined;
  onCursorBusy: (cb: (flag: boolean) => void) => (() => void) | undefined;
  log: (message: string, data?: unknown) => void;
  onHistoryUpdated: (cb: () => void) => (() => void) | undefined;
  getHistorySummaries: (opts?: {
    limit?: number;
    offset?: number;
    search?: string;
    entryType?: string;
    sessionId?: string;
  }) => Promise<HistorySummary[]>;
  getHistoryEntry: (id: number) => Promise<HistoryEntry | null>;
  exportHistory: (targetPath?: string) => Promise<{ path: string; entries: HistoryEntry[] }>;
  exportHistoryEntry: (id: number, targetPath?: string) => Promise<{ path: string; entry: HistoryEntry | null }>;
  getWindowType: () => Promise<'main' | 'config' | 'unknown'>;
  listProviders: () => Promise<ProviderDescriptor[]>;
  getProviderStatus: (providerId: string) => Promise<ProviderStatus>;
  selectProvider: (payload: { capability: ProviderCapability; providerId: string; profileId?: string }) => Promise<SaveConfigResult>;
  upsertProviderProfile: (payload: { capability: ProviderCapability; profile: ProviderProfile }) => Promise<SaveConfigResult>;
  installStart: (payload: { providerId: string; action: InstallAction; localPath?: string }) => Promise<InstallJob>;
  installCancel: (jobId: string) => Promise<boolean>;
  installListJobs: () => Promise<InstallJob[]>;
  installCheckUpdates: () => Promise<Array<{ providerId: string; currentVersion?: string; latestVersion: string; hasUpdate: boolean }>>;
  setSecret: (payload: { ref: string; value: string }) => Promise<{ ref: string; backend: 'keychain' | 'plaintext' }>;
  deleteSecret: (ref: string) => Promise<boolean>;
  getRuntimeApiInfo: () => Promise<{
    enabled: boolean;
    transport: 'tcp' | 'socket';
    host: string;
    port: number;
    socketPath: string;
    authRequired: boolean;
    token: string;
  }>;
  verifyRuntimeApi: () => Promise<VerificationResult>;
  verifyProvider: (capability: 'llm' | 'ocr') => Promise<VerificationResult>;
  openExternalUrl: (url: string) => Promise<boolean>;
};

declare global {
  interface Window {
    trayTranscriber: TrayTranscriberApi;
  }
}

export {};
