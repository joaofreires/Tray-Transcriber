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

type AppConfig = {
  hotkey?: string;
  pressToTalk?: boolean;
  holdToTalk?: boolean;
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
  computeType?: string;
  batchSize?: number;
  noAlign?: boolean;
  dictionary?: DictionaryEntry[];
  dictionaryCorrections?: CorrectionEntry[];
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
  updateConfig: (config: AppConfig) => void;
  getConfig: () => Promise<AppConfig>;
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
};

declare global {
  interface Window {
    trayTranscriber: TrayTranscriberApi;
  }
}

export {};
