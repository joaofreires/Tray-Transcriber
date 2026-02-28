export type ProviderCapability = 'stt' | 'llm' | 'ocr';
export type InstallAction = 'install' | 'update' | 'remove' | 'use_existing';
export type VerificationTarget = 'runtime_api' | 'llm' | 'ocr';

export type ProviderProfile = {
  id: string;
  providerId: string;
  label: string;
  endpoint?: string;
  model?: string;
  language?: string;
  localPath?: string;
  secretRef?: string;
  options?: Record<string, unknown>;
};

export type CapabilityState = {
  activeProviderId: string;
  activeProfileId?: string;
  profiles: ProviderProfile[];
};

export type SettingsConfig = {
  configVersion?: number;
  runtimeNotice?: string;
  pasteMode?: string;
  cursorBusy?: boolean;
  providers: {
    stt: CapabilityState;
    llm: CapabilityState;
    ocr: CapabilityState;
  };
  runtimeApi: {
    enabled: boolean;
    transport: 'tcp' | 'socket';
    host: string;
    port: number;
    socketPath: string;
    authRequired: boolean;
  };
  installer: {
    installRoot: string;
    updateChecks: {
      enabled: boolean;
      intervalHours: number;
      lastCheckedAt: number;
    };
  };
  secrets: {
    fallbackWarningAcknowledged: boolean;
  };
};

export type SaveConfigResult =
  | { ok: true; warnings?: Array<{ code: string; message: string }> }
  | { ok: false; code: string; errors: Array<{ code: string; message: string }> };

export type ProviderDescriptor = {
  id: string;
  capability: ProviderCapability;
  displayName: string;
  kind: 'local' | 'remote';
  requiresInstall: boolean;
  supportsLocalPath: boolean;
  active?: boolean;
};

export type ProviderStatus = {
  providerId: string;
  installed: boolean;
  health: 'healthy' | 'degraded' | 'unavailable';
  message?: string;
  version?: string;
};

export type InstallJob = {
  id: string;
  providerId: string;
  action: InstallAction;
  state: 'queued' | 'downloading' | 'verifying' | 'installing' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  message?: string;
};

export type SettingsTab = 'providers' | 'assistant' | 'runtime' | 'general';
export type ProvidersTab = 'catalog' | 'profiles' | 'jobs';

export type ProviderUiAction = 'use' | 'configure' | 'install' | 'update' | 'remove' | 'use_existing';

export type VerificationResult = {
  ok: boolean;
  target: VerificationTarget;
  message: string;
  details?: string;
  error?: string;
  issueUrl?: string;
};

export const panelSurface = 'rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-sm';
export const inputClasses =
  'w-full rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-sky-400 focus:outline-none';
export const selectClasses = `${inputClasses} bg-slate-950/60`;
export const textAreaClasses = `${inputClasses} min-h-[120px] resize-y font-mono`;

export function capabilityTitle(cap: ProviderCapability): string {
  if (cap === 'stt') return 'Speech-to-Text';
  if (cap === 'llm') return 'LLM';
  return 'OCR';
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function emptyConfig(): SettingsConfig {
  return {
    providers: {
      stt: { activeProviderId: '', activeProfileId: '', profiles: [] },
      llm: { activeProviderId: '', activeProfileId: '', profiles: [] },
      ocr: { activeProviderId: '', activeProfileId: '', profiles: [] }
    },
    runtimeApi: {
      enabled: true,
      transport: 'tcp',
      host: '127.0.0.1',
      port: 48765,
      socketPath: '',
      authRequired: true
    },
    installer: {
      installRoot: '',
      updateChecks: { enabled: true, intervalHours: 24, lastCheckedAt: 0 }
    },
    secrets: {
      fallbackWarningAcknowledged: false
    },
    pasteMode: 'clipboard',
    cursorBusy: false,
    runtimeNotice: ''
  };
}

export function normalizeSettingsConfig(raw: any): SettingsConfig {
  const cfg = raw || {};
  return {
    configVersion: Number(cfg.configVersion || 3),
    runtimeNotice: String(cfg.runtimeNotice || ''),
    pasteMode: String(cfg.pasteMode || 'clipboard'),
    cursorBusy: !!cfg.cursorBusy,
    providers: {
      ...emptyConfig().providers,
      ...(cfg.providers || {})
    },
    runtimeApi: {
      ...emptyConfig().runtimeApi,
      ...(cfg.runtimeApi || {})
    },
    installer: {
      ...emptyConfig().installer,
      ...(cfg.installer || {}),
      updateChecks: {
        ...emptyConfig().installer.updateChecks,
        ...(cfg.installer?.updateChecks || {})
      }
    },
    secrets: {
      ...emptyConfig().secrets,
      ...(cfg.secrets || {})
    }
  };
}

export function timeAgo(ts?: number): string {
  if (!ts) return 'never';
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

export function getCapabilityState(config: SettingsConfig, capability: ProviderCapability): CapabilityState {
  return config.providers[capability];
}

export function findActiveProfile(config: SettingsConfig, capability: ProviderCapability): ProviderProfile | null {
  const state = getCapabilityState(config, capability);
  const preferred = String(state.activeProfileId || '').trim();
  if (preferred) {
    const byId = state.profiles.find((profile) => profile.id === preferred && profile.providerId === state.activeProviderId);
    if (byId) return byId;
  }
  const byProvider = state.profiles.find((profile) => profile.providerId === state.activeProviderId);
  if (byProvider) return byProvider;
  return state.profiles[0] || null;
}

export function setActiveProfileForProvider(config: SettingsConfig, capability: ProviderCapability, providerId: string): SettingsConfig {
  const next = clone(config);
  const capabilityState = next.providers[capability];
  capabilityState.activeProviderId = providerId;
  const firstProfile = capabilityState.profiles.find((entry) => entry.providerId === providerId);
  if (firstProfile) capabilityState.activeProfileId = firstProfile.id;
  else capabilityState.activeProfileId = '';
  return next;
}

export function updateProfile(
  config: SettingsConfig,
  capability: ProviderCapability,
  profileId: string,
  updater: (profile: ProviderProfile) => ProviderProfile
): SettingsConfig {
  const next = clone(config);
  const profiles = next.providers[capability].profiles || [];
  const idx = profiles.findIndex((entry) => entry.id === profileId);
  if (idx < 0) return config;
  profiles[idx] = updater(profiles[idx]);
  next.providers[capability].profiles = profiles;
  return next;
}
