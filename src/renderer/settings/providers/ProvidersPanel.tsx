import React, { useEffect, useState } from 'react';
import InstallJobsTab from './InstallJobsTab';
import ProviderCatalogTab from './ProviderCatalogTab';
import ProviderProfilesTab from './ProviderProfilesTab';
import {
  panelSurface,
  type InstallAction,
  type InstallJob,
  type ProviderCapability,
  type ProviderDescriptor,
  type ProviderProfile,
  type ProviderStatus,
  type ProvidersTab,
  type SettingsConfig
} from '../types';

type ProvidersPanelProps = {
  draft: SettingsConfig;
  providers: ProviderDescriptor[];
  statuses: Record<string, ProviderStatus>;
  jobs: InstallJob[];
  installableProviders: ProviderDescriptor[];
  onUseProvider: (provider: ProviderDescriptor) => Promise<void>;
  onRunInstallAction: (providerId: string, action: InstallAction) => Promise<void>;
  onUpsertProfile: (
    capability: ProviderCapability,
    profileId: string,
    updater: (profile: ProviderProfile) => ProviderProfile
  ) => void;
  onSaveProfileSecret: (capability: ProviderCapability, profileId: string) => Promise<void>;
  onCheckUpdates: () => Promise<void>;
};

export default function ProvidersPanel({
  draft,
  providers,
  statuses,
  jobs,
  installableProviders,
  onUseProvider,
  onRunInstallAction,
  onUpsertProfile,
  onSaveProfileSecret,
  onCheckUpdates
}: ProvidersPanelProps) {
  const hasInstallJobsTab = jobs.length > 0 || installableProviders.length > 0;
  const [activeProvidersTab, setActiveProvidersTab] = useState<ProvidersTab>('catalog');
  const [activeProfilesCapability, setActiveProfilesCapability] = useState<ProviderCapability>('stt');
  const [focusProviderId, setFocusProviderId] = useState('');

  useEffect(() => {
    if (!hasInstallJobsTab && activeProvidersTab === 'jobs') {
      setActiveProvidersTab('catalog');
    }
  }, [activeProvidersTab, hasInstallJobsTab]);

  const subTabs: Array<{ id: ProvidersTab; label: string }> = [
    { id: 'catalog', label: 'Catalog' },
    { id: 'profiles', label: 'Profiles' },
    ...(hasInstallJobsTab ? [{ id: 'jobs' as ProvidersTab, label: 'Install Jobs' }] : [])
  ];

  return (
    <div className="grid gap-4">
      <section className={panelSurface}>
        <div className="flex flex-wrap gap-2">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              className={`rounded-xl px-3 py-2 text-xs tracking-wide ${
                activeProvidersTab === tab.id ? 'bg-sky-500/80 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
              onClick={() => setActiveProvidersTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeProvidersTab === 'catalog' ? (
        <ProviderCatalogTab
          draft={draft}
          providers={providers}
          statuses={statuses}
          onUseProvider={onUseProvider}
          onRunInstallAction={onRunInstallAction}
          onConfigureProvider={(provider) => {
            setActiveProvidersTab('profiles');
            setActiveProfilesCapability(provider.capability);
            setFocusProviderId(provider.id);
          }}
        />
      ) : null}

      {activeProvidersTab === 'profiles' ? (
        <ProviderProfilesTab
          draft={draft}
          activeCapability={activeProfilesCapability}
          focusProviderId={focusProviderId}
          onSetCapability={(capability) => {
            setActiveProfilesCapability(capability);
            setFocusProviderId('');
          }}
          onClearFocusProvider={() => setFocusProviderId('')}
          onUpsertProfile={onUpsertProfile}
          onSaveProfileSecret={onSaveProfileSecret}
        />
      ) : null}

      {activeProvidersTab === 'jobs' && hasInstallJobsTab ? (
        <InstallJobsTab jobs={jobs} onCheckUpdates={onCheckUpdates} />
      ) : null}
    </div>
  );
}
