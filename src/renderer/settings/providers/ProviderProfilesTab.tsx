import React from 'react';
import {
  capabilityTitle,
  inputClasses,
  panelSurface,
  textAreaClasses,
  type ProviderCapability,
  type ProviderProfile,
  type SettingsConfig
} from '../types';

type ProviderProfilesTabProps = {
  draft: SettingsConfig;
  activeCapability: ProviderCapability;
  focusProviderId: string;
  onSetCapability: (capability: ProviderCapability) => void;
  onClearFocusProvider: () => void;
  onUpsertProfile: (
    capability: ProviderCapability,
    profileId: string,
    updater: (profile: ProviderProfile) => ProviderProfile
  ) => void;
  onSaveProfileSecret: (capability: ProviderCapability, profileId: string) => Promise<void>;
};

export default function ProviderProfilesTab({
  draft,
  activeCapability,
  focusProviderId,
  onSetCapability,
  onClearFocusProvider,
  onUpsertProfile,
  onSaveProfileSecret
}: ProviderProfilesTabProps) {
  const capabilityState = draft.providers[activeCapability];
  const profiles = capabilityState.profiles.filter((profile) =>
    focusProviderId ? profile.providerId === focusProviderId : true
  );

  return (
    <div className="grid gap-4">
      <section className={panelSurface}>
        <div className="flex flex-wrap gap-2">
          {(['stt', 'llm', 'ocr'] as ProviderCapability[]).map((entry) => (
            <button
              key={entry}
              className={`rounded-xl px-3 py-2 text-xs tracking-wide ${
                activeCapability === entry ? 'bg-sky-500/80 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
              onClick={() => onSetCapability(entry)}
            >
              {capabilityTitle(entry)}
            </button>
          ))}
          {focusProviderId ? (
            <button className="rounded-xl px-3 py-2 text-xs tracking-wide bg-white/10 text-white/70 hover:bg-white/20" onClick={onClearFocusProvider}>
              Clear provider filter
            </button>
          ) : null}
        </div>
      </section>

      <section className={panelSurface}>
        <h3 className="text-sm uppercase tracking-[0.28em] text-white/60 mb-3">{capabilityTitle(activeCapability)} Profiles</h3>
        {!profiles.length ? <p className="text-sm text-white/60">No profiles for this capability.</p> : null}
        <div className="grid gap-3">
          {profiles.map((profile) => {
            const active = capabilityState.activeProfileId === profile.id;
            return (
              <article key={profile.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 grid gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold">{profile.label || profile.id}</p>
                    <p className="text-xs text-white/50">{profile.providerId}</p>
                  </div>
                  {active ? <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/30 text-emerald-100">ACTIVE PROFILE</span> : null}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className="text-xs text-white/70 grid gap-1">
                    <span>Label</span>
                    <input className={inputClasses} value={profile.label || ''} onChange={(e) => onUpsertProfile(activeCapability, profile.id, (current) => ({ ...current, label: e.target.value }))} />
                  </label>
                  <label className="text-xs text-white/70 grid gap-1">
                    <span>Model</span>
                    <input className={inputClasses} value={profile.model || ''} onChange={(e) => onUpsertProfile(activeCapability, profile.id, (current) => ({ ...current, model: e.target.value }))} />
                  </label>
                  <label className="text-xs text-white/70 grid gap-1 md:col-span-2">
                    <span>Endpoint</span>
                    <input className={inputClasses} value={profile.endpoint || ''} onChange={(e) => onUpsertProfile(activeCapability, profile.id, (current) => ({ ...current, endpoint: e.target.value }))} />
                  </label>
                  <label className="text-xs text-white/70 grid gap-1 md:col-span-2">
                    <span>Local Path</span>
                    <input className={inputClasses} value={profile.localPath || ''} onChange={(e) => onUpsertProfile(activeCapability, profile.id, (current) => ({ ...current, localPath: e.target.value }))} />
                  </label>
                  <label className="text-xs text-white/70 grid gap-1 md:col-span-2">
                    <span>Secret Ref</span>
                    <div className="flex gap-2">
                      <input className={inputClasses} value={profile.secretRef || ''} onChange={(e) => onUpsertProfile(activeCapability, profile.id, (current) => ({ ...current, secretRef: e.target.value }))} />
                      <button
                        className="rounded-xl border border-white/20 px-3 text-xs text-white/80 hover:bg-white/10"
                        onClick={() => onSaveProfileSecret(activeCapability, profile.id)}
                      >
                        Set value
                      </button>
                    </div>
                  </label>
                  <label className="text-xs text-white/70 grid gap-1 md:col-span-2">
                    <span>Options (JSON)</span>
                    <textarea
                      className={textAreaClasses}
                      value={JSON.stringify(profile.options || {}, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value || '{}');
                          onUpsertProfile(activeCapability, profile.id, (current) => ({ ...current, options: parsed }));
                        } catch {
                          // Keep current value until JSON is valid.
                        }
                      }}
                    />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
