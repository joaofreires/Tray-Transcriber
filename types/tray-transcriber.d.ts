type RecordingPayload = {
  isRecording: boolean;
};

type RecordingCompletePayload = {
  buffer: number[];
  extension: string;
  size: number;
  durationMs: number;
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
  onToggleRecording: (cb: (payload: RecordingPayload) => void) => void;
  notifyRecordingComplete: (data: RecordingCompletePayload) => void;
  updateConfig: (config: AppConfig) => void;
  getConfig: () => Promise<AppConfig>;
  log: (message: string, data?: unknown) => void;
};

declare global {
  interface Window {
    trayTranscriber: TrayTranscriberApi;
  }
}

export {};
