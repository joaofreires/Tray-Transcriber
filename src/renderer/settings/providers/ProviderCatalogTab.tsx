import React from 'react';
import { resolveProviderActions } from './action-policy';
import {
  capabilityTitle,
  panelSurface,
  type InstallAction,
  type ProviderCapability,
  type ProviderDescriptor,
  type ProviderStatus,
  type SettingsConfig
} from '../types';

type ProviderCatalogTabProps = {
  draft: SettingsConfig;
  providers: ProviderDescriptor[];
  statuses: Record<string, ProviderStatus>;
  onUseProvider: (provider: ProviderDescriptor) => Promise<void>;
  onRunInstallAction: (providerId: string, action: InstallAction) => Promise<void>;
  onConfigureProvider: (provider: ProviderDescriptor) => void;
};

function actionLabel(action: string): string {
  if (action === 'use') return 'Use';
  if (action === 'configure') return 'Configure';
  if (action === 'install') return 'Install';
  if (action === 'update') return 'Update';
  if (action === 'remove') return 'Remove';
  return 'Use existing';
}

function actionButtonClass(action: string): string {
  if (action === 'use') return 'rounded-xl bg-sky-500/80 hover:bg-sky-500 px-3 py-1 text-xs';
  return 'rounded-xl bg-white/10 hover:bg-white/20 px-3 py-1 text-xs';
}

export default function ProviderCatalogTab({
  draft,
  providers,
  statuses,
  onUseProvider,
  onRunInstallAction,
  onConfigureProvider
}: ProviderCatalogTabProps) {
  const groups: Record<ProviderCapability, ProviderDescriptor[]> = { stt: [], llm: [], ocr: [] };
  for (const provider of providers) {
    groups[provider.capability].push(provider);
  }

  const renderProviderCard = (provider: ProviderDescriptor) => {
    const providerStatus = statuses[provider.id];
    const activeProviderId = draft.providers[provider.capability]?.activeProviderId;
    const isActive = activeProviderId === provider.id;
    const actions = resolveProviderActions(provider);
    const installable = provider.requiresInstall || provider.supportsLocalPath;

    return (
      <article key={provider.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-white text-sm font-semibold">{provider.displayName}</h4>
            <p className="text-white/50 text-xs">{provider.id}</p>
          </div>
          <span className={`text-[10px] px-2 py-1 rounded-full ${isActive ? 'bg-emerald-400/30 text-emerald-200' : 'bg-white/10 text-white/70'}`}>
            {isActive ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </div>
        <div className="mt-3 text-xs text-white/70 grid gap-1">
          <p>
            {installable ? 'Install' : 'Connection'}: {providerStatus?.installed ? 'Ready' : 'Not ready'}
          </p>
          <p>Health: {providerStatus?.health || 'unknown'}</p>
          <p className="truncate">{providerStatus?.message || 'No status details'}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={`${provider.id}-${action}`}
              className={actionButtonClass(action)}
              onClick={() => {
                if (action === 'use') return void onUseProvider(provider);
                if (action === 'configure') return onConfigureProvider(provider);
                return void onRunInstallAction(provider.id, action);
              }}
            >
              {actionLabel(action)}
            </button>
          ))}
        </div>
      </article>
    );
  };

  return (
    <div className="grid gap-4">
      {(['stt', 'llm', 'ocr'] as ProviderCapability[]).map((capability) => (
        <section key={capability} className={panelSurface}>
          <h3 className="text-sm uppercase tracking-[0.28em] text-white/60 mb-3">{capabilityTitle(capability)}</h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{groups[capability].map(renderProviderCard)}</div>
        </section>
      ))}
    </div>
  );
}

