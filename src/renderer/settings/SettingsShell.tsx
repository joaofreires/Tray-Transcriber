import React, { useMemo, useState } from 'react';
import AssistantSettingsTab from './assistant/AssistantSettingsTab';
import GeneralTab from './general/GeneralTab';
import ProvidersPanel from './providers/ProvidersPanel';
import RuntimeApiTab from './runtime/RuntimeApiTab';
import { useSettingsState } from './useSettingsState';
import type { SettingsTab } from './types';

export default function SettingsShell() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');
  const {
    draft,
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
    reloadProviders,
    reloadJobs,
    setActiveProvider,
    runInstallAction,
    checkUpdates,
    upsertProfileInDraft,
    saveProfileSecret,
    setOcrModeInDraft,
    getActiveProfile,
    installableProviders,
    setDraft
  } = useSettingsState();

  const tabs = useMemo(
    () => [
      { id: 'providers' as SettingsTab, label: 'Providers' },
      { id: 'assistant' as SettingsTab, label: 'LLM settings' },
      { id: 'runtime' as SettingsTab, label: 'Runtime API' },
      { id: 'general' as SettingsTab, label: 'General' }
    ],
    []
  );

  return (
    <div className="grid gap-4">
      {error ? (
        <div className="rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <p>Settings error: {error}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="rounded-xl border border-rose-200/40 px-3 py-1 text-xs hover:bg-rose-300/20" onClick={clearError}>
              Dismiss error
            </button>
          </div>
        </div>
      ) : null}

      {hasExternalUpdate ? (
        <div className="rounded-2xl border border-sky-300/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          <p>Configuration changed elsewhere. Keep edits or reload latest.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="rounded-xl border border-sky-200/40 px-3 py-1 text-xs hover:bg-sky-300/20" onClick={reloadFromLatest}>
              Reload latest
            </button>
            <button className="rounded-xl border border-white/20 px-3 py-1 text-xs hover:bg-white/10" onClick={dismissExternalUpdate}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {draft.runtimeNotice ? (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {draft.runtimeNotice}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`rounded-xl px-3 py-2 text-xs tracking-wide ${activeTab === tab.id ? 'bg-sky-500/80 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'providers' ? (
        <ProvidersPanel
          draft={draft}
          providers={providers}
          statuses={statuses}
          jobs={jobs}
          installableProviders={installableProviders}
          onUseProvider={setActiveProvider}
          onRunInstallAction={runInstallAction}
          onUpsertProfile={upsertProfileInDraft}
          onSaveProfileSecret={saveProfileSecret}
          onCheckUpdates={checkUpdates}
        />
      ) : null}

      {activeTab === 'assistant' ? (
        <AssistantSettingsTab
          draft={draft}
          getActiveProfile={getActiveProfile}
          onUpsertProfile={upsertProfileInDraft}
          onSaveProfileSecret={saveProfileSecret}
          onSetOcrMode={setOcrModeInDraft}
        />
      ) : null}

      {activeTab === 'runtime' ? <RuntimeApiTab draft={draft} onSetDraft={setDraft} /> : null}
      {activeTab === 'general' ? <GeneralTab draft={draft} onSetDraft={setDraft} /> : null}

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-white/60">configVersion: {draft.configVersion || 3}</div>
        <div className="flex items-center gap-2">
          {status === 'saved' ? <span className="text-xs text-emerald-300">Saved</span> : null}
          {status === 'error' ? <span className="text-xs text-rose-300">Save failed</span> : null}
          <button className="rounded-xl bg-emerald-500/80 hover:bg-emerald-500 px-4 py-2 text-sm" onClick={save}>
            Save Settings
          </button>
          <button
            className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
            onClick={async () => {
              await reloadProviders();
              await reloadJobs();
            }}
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
