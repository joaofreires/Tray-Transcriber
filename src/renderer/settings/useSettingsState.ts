import { useEffect, useMemo, useState } from 'react';
import { useConfigSync } from '../hooks/useConfigSync';
import { buildSettingsSavePayload } from './save-payload';
import {
  clone,
  emptyConfig,
  findActiveProfile,
  normalizeSettingsConfig,
  setActiveProfileForProvider,
  updateProfile,
  type InstallAction,
  type InstallJob,
  type ProviderCapability,
  type ProviderDescriptor,
  type ProviderProfile,
  type ProviderStatus,
  type SaveConfigResult,
  type SettingsConfig
} from './types';

export function useSettingsState() {
  const [baseConfig, setBaseConfig] = useState<SettingsConfig>(emptyConfig());
  const [draft, setDraft] = useState<SettingsConfig>(emptyConfig());
  const [providers, setProviders] = useState<ProviderDescriptor[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [jobs, setJobs] = useState<InstallJob[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  const { hasExternalUpdate, reloadFromLatest, dismissExternalUpdate } = useConfigSync({
    baseConfig,
    draft,
    setBaseConfig,
    setDraft,
    normalizeDraft: normalizeSettingsConfig
  });

  const installableProviders = useMemo(
    () => providers.filter((provider) => provider.requiresInstall || provider.supportsLocalPath),
    [providers]
  );

  const reloadProviders = async () => {
    const list = (await window.trayTranscriber?.listProviders?.()) as ProviderDescriptor[];
    const normalizedList = Array.isArray(list) ? list : [];
    setProviders(normalizedList);

    const nextStatuses: Record<string, ProviderStatus> = {};
    for (const provider of normalizedList) {
      try {
        const providerStatus = await window.trayTranscriber?.getProviderStatus?.(provider.id);
        if (providerStatus) nextStatuses[provider.id] = providerStatus as ProviderStatus;
      } catch (err) {
        nextStatuses[provider.id] = {
          providerId: provider.id,
          installed: false,
          health: 'unavailable',
          message: String(err)
        };
      }
    }
    setStatuses(nextStatuses);
  };

  const reloadJobs = async () => {
    const list = (await window.trayTranscriber?.installListJobs?.()) as InstallJob[];
    const normalizedList = Array.isArray(list) ? list : [];
    setJobs(normalizedList);
  };

  useEffect(() => {
    (async () => {
      try {
        const cfg = ((await window.trayTranscriber?.getConfig?.()) || {}) as SettingsConfig;
        const normalized = normalizeSettingsConfig(cfg);
        setBaseConfig(clone(normalized));
        setDraft(clone(normalized));
        await reloadProviders();
        await reloadJobs();
      } catch (err) {
        setError(String(err));
      }
    })();
  }, []);

  const saveConfig = async (nextDraft: SettingsConfig) => {
    setStatus('saving');
    setError('');
    try {
      const payload = buildSettingsSavePayload(nextDraft);
      const result = (await window.trayTranscriber?.updateConfig?.(payload)) as SaveConfigResult | undefined;
      if (!result) {
        setStatus('error');
        setError('Configuration save failed');
        return false;
      }
      if (result.ok === false) {
        setStatus('error');
        const messages = result.errors.map((entry) => entry.message).join('; ') || 'Configuration save failed';
        setError(messages);
        return false;
      }
      setBaseConfig(clone(nextDraft));
      setDraft(clone(nextDraft));
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1400);
      return true;
    } catch (err) {
      setStatus('error');
      setError(String(err));
      return false;
    }
  };

  const save = async () => {
    await saveConfig(draft);
  };

  const clearError = () => {
    setError('');
    setStatus('idle');
  };

  const updateDraft = (updater: (prev: SettingsConfig) => SettingsConfig) => {
    setDraft((prev) => updater(prev));
    setStatus('idle');
  };

  const setActiveProvider = async (provider: ProviderDescriptor) => {
    await window.trayTranscriber?.selectProvider?.({ capability: provider.capability, providerId: provider.id });
    const next = setActiveProfileForProvider(draft, provider.capability, provider.id);
    setDraft(next);
    setBaseConfig(next);
    await reloadProviders();
  };

  const runInstallAction = async (providerId: string, action: InstallAction) => {
    let localPath: string | undefined;
    if (action === 'use_existing') {
      const result = window.prompt('Local binary/runtime path');
      if (!result) return;
      localPath = result;
    }
    await window.trayTranscriber?.installStart?.({ providerId, action, localPath });
    await reloadJobs();
    await reloadProviders();
  };

  const checkUpdates = async () => {
    await window.trayTranscriber?.installCheckUpdates?.();
    await reloadJobs();
    await reloadProviders();
  };

  const upsertProfileInDraft = (
    capability: ProviderCapability,
    profileId: string,
    updater: (profile: ProviderProfile) => ProviderProfile
  ) => {
    setDraft((prev) => updateProfile(prev, capability, profileId, updater));
    setStatus('idle');
  };

  const saveProfileSecret = async (capability: ProviderCapability, profileId: string) => {
    const profile = draft.providers[capability]?.profiles?.find((entry) => entry.id === profileId);
    const secretRef = String(profile?.secretRef || '').trim();
    if (!secretRef) {
      setStatus('error');
      setError('Secret ref is required before setting secret value.');
      return;
    }
    const value = window.prompt(`Set secret for ${secretRef}`);
    if (value === null) return;
    await window.trayTranscriber?.setSecret?.({ ref: secretRef, value });
  };

  const setOcrModeInDraft = (mode: 'llm_vision' | 'local_tesseract') => {
    setDraft((prev) => {
      const next = clone(prev);
      const providerId = mode === 'local_tesseract' ? 'ocr.local_tesseract' : 'ocr.llm_vision';
      next.providers.ocr.activeProviderId = providerId;
      const matching = next.providers.ocr.profiles.find((profile) => profile.providerId === providerId);
      if (matching) next.providers.ocr.activeProfileId = matching.id;
      return next;
    });
    setStatus('idle');
  };

  const getActiveProfile = (capability: ProviderCapability): ProviderProfile | null => {
    return findActiveProfile(draft, capability);
  };

  return {
    baseConfig,
    draft,
    setDraft: updateDraft,
    providers,
    statuses,
    jobs,
    status,
    error,
    clearError,
    hasExternalUpdate,
    reloadFromLatest,
    dismissExternalUpdate,
    save,
    saveConfig,
    reloadProviders,
    reloadJobs,
    setActiveProvider,
    runInstallAction,
    checkUpdates,
    upsertProfileInDraft,
    saveProfileSecret,
    setOcrModeInDraft,
    getActiveProfile,
    installableProviders
  };
}
