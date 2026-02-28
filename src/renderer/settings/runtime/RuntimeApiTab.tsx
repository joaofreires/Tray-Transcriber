import React, { useState } from 'react';
import VerificationResultCard from '../components/VerificationResultCard';
import { inputClasses, panelSurface, selectClasses, timeAgo, type SettingsConfig, type VerificationResult } from '../types';

type RuntimeApiTabProps = {
  draft: SettingsConfig;
  onSetDraft: (updater: (prev: SettingsConfig) => SettingsConfig) => void;
};

export default function RuntimeApiTab({ draft, onSetDraft }: RuntimeApiTabProps) {
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);

  const verifyRuntimeApi = async () => {
    setVerifyBusy(true);
    try {
      const result = await window.trayTranscriber?.verifyRuntimeApi?.();
      if (result) {
        setVerifyResult(result as VerificationResult);
      } else {
        setVerifyResult({
          ok: false,
          target: 'runtime_api',
          message: 'Runtime API verification returned no result.',
          error: 'verifyRuntimeApi IPC returned undefined'
        });
      }
    } catch (err) {
      setVerifyResult({
        ok: false,
        target: 'runtime_api',
        message: 'Runtime API verification failed.',
        error: String(err)
      });
    } finally {
      setVerifyBusy(false);
    }
  };

  return (
    <section className={panelSurface}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm uppercase tracking-[0.28em] text-white/60">Runtime API</h3>
        <button
          className="rounded-xl border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-60"
          onClick={() => void verifyRuntimeApi()}
          disabled={verifyBusy}
        >
          {verifyBusy ? 'Verifying...' : 'Verify runtime API'}
        </button>
      </div>
      <div className="mb-3">
        <VerificationResultCard result={verifyResult} onDismiss={() => setVerifyResult(null)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs text-white/70 grid gap-1">
          <span>Enabled</span>
          <select
            className={selectClasses}
            value={String(draft.runtimeApi.enabled)}
            onChange={(e) => onSetDraft((prev) => ({ ...prev, runtimeApi: { ...prev.runtimeApi, enabled: e.target.value === 'true' } }))}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </label>
        <label className="text-xs text-white/70 grid gap-1">
          <span>Transport</span>
          <select
            className={selectClasses}
            value={draft.runtimeApi.transport}
            onChange={(e) => onSetDraft((prev) => ({ ...prev, runtimeApi: { ...prev.runtimeApi, transport: e.target.value as 'tcp' | 'socket' } }))}
          >
            <option value="tcp">tcp</option>
            <option value="socket">socket</option>
          </select>
        </label>
        <label className="text-xs text-white/70 grid gap-1">
          <span>Host</span>
          <input className={inputClasses} value={draft.runtimeApi.host} onChange={(e) => onSetDraft((prev) => ({ ...prev, runtimeApi: { ...prev.runtimeApi, host: e.target.value } }))} />
        </label>
        <label className="text-xs text-white/70 grid gap-1">
          <span>Port</span>
          <input className={inputClasses} type="number" value={draft.runtimeApi.port} onChange={(e) => onSetDraft((prev) => ({ ...prev, runtimeApi: { ...prev.runtimeApi, port: Number(e.target.value || 0) } }))} />
        </label>
        <label className="text-xs text-white/70 grid gap-1 md:col-span-2">
          <span>Socket Path</span>
          <input className={inputClasses} value={draft.runtimeApi.socketPath} onChange={(e) => onSetDraft((prev) => ({ ...prev, runtimeApi: { ...prev.runtimeApi, socketPath: e.target.value } }))} />
        </label>
        <label className="text-xs text-white/70 grid gap-1">
          <span>Auth Required</span>
          <select
            className={selectClasses}
            value={String(draft.runtimeApi.authRequired)}
            onChange={(e) => onSetDraft((prev) => ({ ...prev, runtimeApi: { ...prev.runtimeApi, authRequired: e.target.value === 'true' } }))}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </label>
        <label className="text-xs text-white/70 grid gap-1">
          <span>Install Root</span>
          <input className={inputClasses} value={draft.installer.installRoot} onChange={(e) => onSetDraft((prev) => ({ ...prev, installer: { ...prev.installer, installRoot: e.target.value } }))} />
        </label>
      </div>
      <div className="mt-4 text-xs text-white/60">
        <p>Update checks: {draft.installer.updateChecks.enabled ? 'enabled' : 'disabled'} every {draft.installer.updateChecks.intervalHours}h</p>
        <p>Last checked: {timeAgo(draft.installer.updateChecks.lastCheckedAt)}</p>
      </div>
    </section>
  );
}
