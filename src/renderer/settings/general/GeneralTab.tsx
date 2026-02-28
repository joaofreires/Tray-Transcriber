import React from 'react';
import { panelSurface, selectClasses, type SettingsConfig } from '../types';

type GeneralTabProps = {
  draft: SettingsConfig;
  onSetDraft: (updater: (prev: SettingsConfig) => SettingsConfig) => void;
};

export default function GeneralTab({ draft, onSetDraft }: GeneralTabProps) {
  return (
    <section className={panelSurface}>
      <h3 className="text-sm uppercase tracking-[0.28em] text-white/60 mb-3">General</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs text-white/70 grid gap-1">
          <span>Paste Mode</span>
          <select className={selectClasses} value={draft.pasteMode || 'clipboard'} onChange={(e) => onSetDraft((prev) => ({ ...prev, pasteMode: e.target.value }))}>
            <option value="clipboard">clipboard</option>
            <option value="paste">paste</option>
          </select>
        </label>
        <label className="text-xs text-white/70 grid gap-1">
          <span>Show Busy Cursor</span>
          <select className={selectClasses} value={String(!!draft.cursorBusy)} onChange={(e) => onSetDraft((prev) => ({ ...prev, cursorBusy: e.target.value === 'true' }))}>
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
        </label>
      </div>
      {!draft.secrets.fallbackWarningAcknowledged ? (
        <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p>Keychain may be unavailable on this system. Secret fallback storage can use plaintext.</p>
          <button
            className="mt-2 rounded-lg border border-amber-200/40 px-3 py-1 text-amber-100 hover:bg-amber-300/20"
            onClick={() => onSetDraft((prev) => ({ ...prev, secrets: { ...prev.secrets, fallbackWarningAcknowledged: true } }))}
          >
            Acknowledge warning
          </button>
        </div>
      ) : null}
    </section>
  );
}

