export type ProviderCapability = 'stt' | 'llm' | 'ocr';
export type ProviderKind = 'local' | 'remote';

export type ProviderHealth = 'healthy' | 'degraded' | 'unavailable';

export type ProviderStatus = {
  providerId: string;
  capability: ProviderCapability;
  installed: boolean;
  health: ProviderHealth;
  version?: string;
  message?: string;
  details?: Record<string, unknown>;
};

export type ProviderDescriptor = {
  id: string;
  capability: ProviderCapability;
  displayName: string;
  kind: ProviderKind;
  requiresInstall: boolean;
  supportsLocalPath: boolean;
};

export type ProviderProfile = {
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

export type CapabilityConfig = {
  activeProviderId: string;
  activeProfileId?: string;
  profiles: ProviderProfile[];
};

export type ProvidersConfig = {
  stt: CapabilityConfig;
  llm: CapabilityConfig;
  ocr: CapabilityConfig;
};

export type RuntimeApiConfig = {
  enabled: boolean;
  transport: 'tcp' | 'socket';
  host: string;
  port: number;
  socketPath: string;
  authRequired: boolean;
};

export type InstallerConfig = {
  installRoot: string;
  updateChecks: {
    enabled: boolean;
    intervalHours: number;
    lastCheckedAt: number;
  };
};

export type SecretsConfig = {
  fallbackWarningAcknowledged: boolean;
};

export type RuntimeConfig = {
  configVersion: number;
  runtimeNotice?: string;
  providers: ProvidersConfig;
  runtimeApi: RuntimeApiConfig;
  installer: InstallerConfig;
  secrets: SecretsConfig;
};

export type SttTranscribeRequest = {
  audioPath?: string;
  audioBuffer?: Buffer;
  extension?: string;
  profile?: ProviderProfile;
};

export type SttTranscribeResponse = {
  text: string;
};

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmRespondRequest = {
  prompt?: string;
  messages?: LlmMessage[];
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  profile?: ProviderProfile;
};

export type LlmRespondResponse = {
  text: string;
};

export type OcrExtractRequest = {
  image: Buffer;
  languageHint?: string;
  profile?: ProviderProfile;
};

export type OcrExtractResponse = {
  text: string;
};

export type SecretsRef = {
  ref: string;
  backend: 'keychain' | 'plaintext';
};

export type InstallAction = 'install' | 'update' | 'remove' | 'use_existing';

export type InstallArtifact = {
  providerId: string;
  version: string;
  url: string;
  sha256: string;
  filename: string;
};

export type InstallJobState = 'queued' | 'downloading' | 'verifying' | 'installing' | 'completed' | 'failed' | 'cancelled';

export type InstallJob = {
  id: string;
  providerId: string;
  action: InstallAction;
  state: InstallJobState;
  createdAt: number;
  updatedAt: number;
  message?: string;
  localPath?: string;
  artifact?: InstallArtifact;
};

export type InstallRequest = {
  providerId: string;
  action: InstallAction;
  localPath?: string;
};

export type InstallState = {
  providerId: string;
  installed: boolean;
  version?: string;
  installPath?: string;
  source: 'managed' | 'existing' | 'none';
  updatedAt: number;
};

export interface ProviderBase {
  descriptor: ProviderDescriptor;
  getStatus: () => Promise<ProviderStatus>;
}

export interface SttProvider extends ProviderBase {
  descriptor: ProviderDescriptor & { capability: 'stt' };
  transcribe: (request: SttTranscribeRequest) => Promise<SttTranscribeResponse>;
}

export interface LlmProvider extends ProviderBase {
  descriptor: ProviderDescriptor & { capability: 'llm' };
  respond: (request: LlmRespondRequest) => Promise<LlmRespondResponse>;
}

export interface OcrProvider extends ProviderBase {
  descriptor: ProviderDescriptor & { capability: 'ocr' };
  extractText: (request: OcrExtractRequest) => Promise<OcrExtractResponse>;
}

export type AnyProvider = SttProvider | LlmProvider | OcrProvider;
