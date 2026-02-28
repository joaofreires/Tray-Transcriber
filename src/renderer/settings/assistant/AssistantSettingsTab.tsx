import React, { useState } from 'react';
import VerificationResultCard from '../components/VerificationResultCard';
import {
  inputClasses,
  panelSurface,
  selectClasses,
  textAreaClasses,
  type ProviderProfile,
  type SettingsConfig,
  type VerificationResult
} from '../types';

type AssistantSettingsTabProps = {
  draft: SettingsConfig;
  getActiveProfile: (capability: 'llm' | 'ocr') => ProviderProfile | null;
  onUpsertProfile: (capability: 'llm' | 'ocr', profileId: string, updater: (profile: ProviderProfile) => ProviderProfile) => void;
  onSaveProfileSecret: (capability: 'llm' | 'ocr', profileId: string) => Promise<void>;
  onSetOcrMode: (mode: 'llm_vision' | 'local_tesseract') => void;
};

function profileOptionString(profile: ProviderProfile | null, key: string, fallback = ''): string {
  return String(profile?.options?.[key] ?? fallback);
}

function profileOptionNumber(profile: ProviderProfile | null, key: string, fallback: number): number {
  const parsed = Number(profile?.options?.[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export default function AssistantSettingsTab({
  draft,
  getActiveProfile,
  onUpsertProfile,
  onSaveProfileSecret,
  onSetOcrMode
}: AssistantSettingsTabProps) {
  const [llmVerifyBusy, setLlmVerifyBusy] = useState(false);
  const [ocrVerifyBusy, setOcrVerifyBusy] = useState(false);
  const [llmVerifyResult, setLlmVerifyResult] = useState<VerificationResult | null>(null);
  const [ocrVerifyResult, setOcrVerifyResult] = useState<VerificationResult | null>(null);

  const llmProfile = getActiveProfile('llm');
  const activeOcrProviderId = draft.providers.ocr.activeProviderId || '';
  const ocrMode = activeOcrProviderId === 'ocr.local_tesseract' ? 'local_tesseract' : 'llm_vision';
  const ocrProfile = getActiveProfile('ocr');

  const verifyLlm = async () => {
    setLlmVerifyBusy(true);
    try {
      const result = await window.trayTranscriber?.verifyProvider?.('llm');
      if (result) {
        setLlmVerifyResult(result as VerificationResult);
      } else {
        setLlmVerifyResult({
          ok: false,
          target: 'llm',
          message: 'LLM verification returned no result.',
          error: 'verifyProvider(llm) IPC returned undefined'
        });
      }
    } catch (err) {
      setLlmVerifyResult({
        ok: false,
        target: 'llm',
        message: 'LLM verification failed.',
        error: String(err)
      });
    } finally {
      setLlmVerifyBusy(false);
    }
  };

  const verifyOcr = async () => {
    setOcrVerifyBusy(true);
    try {
      const result = await window.trayTranscriber?.verifyProvider?.('ocr');
      if (result) {
        setOcrVerifyResult(result as VerificationResult);
      } else {
        setOcrVerifyResult({
          ok: false,
          target: 'ocr',
          message: 'OCR verification returned no result.',
          error: 'verifyProvider(ocr) IPC returned undefined'
        });
      }
    } catch (err) {
      setOcrVerifyResult({
        ok: false,
        target: 'ocr',
        message: 'OCR verification failed.',
        error: String(err)
      });
    } finally {
      setOcrVerifyBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <section className={panelSurface}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm uppercase tracking-[0.28em] text-white/60">LLM settings</h3>
          <button
            className="rounded-xl border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-60"
            onClick={() => void verifyLlm()}
            disabled={llmVerifyBusy}
          >
            {llmVerifyBusy ? 'Verifying...' : 'Verify LLM'}
          </button>
        </div>
        <div className="mb-3">
          <VerificationResultCard result={llmVerifyResult} onDismiss={() => setLlmVerifyResult(null)} />
        </div>
        {!llmProfile ? <p className="text-sm text-white/60">No active LLM profile selected.</p> : null}
        {llmProfile ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs text-white/70 grid gap-1">
              <span>Active provider</span>
              <input className={inputClasses} value={llmProfile.providerId} readOnly />
            </label>
            <label className="text-xs text-white/70 grid gap-1">
              <span>Profile label</span>
              <input className={inputClasses} value={llmProfile.label || ''} onChange={(e) => onUpsertProfile('llm', llmProfile.id, (current) => ({ ...current, label: e.target.value }))} />
            </label>
            <label className="text-xs text-white/70 grid gap-1">
              <span>LLM Host</span>
              <input className={inputClasses} value={llmProfile.endpoint || ''} placeholder="http://localhost:1234" onChange={(e) => onUpsertProfile('llm', llmProfile.id, (current) => ({ ...current, endpoint: e.target.value }))} />
            </label>
            <label className="text-xs text-white/70 grid gap-1">
              <span>LLM Model</span>
              <input className={inputClasses} value={llmProfile.model || ''} onChange={(e) => onUpsertProfile('llm', llmProfile.id, (current) => ({ ...current, model: e.target.value }))} />
            </label>
            <label className="text-xs text-white/70 grid gap-1">
              <span>Assistant Name</span>
              <input
                className={inputClasses}
                value={profileOptionString(llmProfile, 'assistantName', 'Luna')}
                onChange={(e) =>
                  onUpsertProfile('llm', llmProfile.id, (current) => ({
                    ...current,
                    options: { ...(current.options || {}), assistantName: e.target.value }
                  }))
                }
              />
            </label>
            <label className="text-xs text-white/70 grid gap-1">
              <span>Secret Ref</span>
              <div className="flex gap-2">
                <input className={inputClasses} value={llmProfile.secretRef || ''} onChange={(e) => onUpsertProfile('llm', llmProfile.id, (current) => ({ ...current, secretRef: e.target.value }))} />
                <button
                  className="rounded-xl border border-white/20 px-3 text-xs text-white/80 hover:bg-white/10"
                  onClick={() => onSaveProfileSecret('llm', llmProfile.id)}
                >
                  Set value
                </button>
              </div>
            </label>
            <label className="text-xs text-white/70 grid gap-1 md:col-span-2">
              <span>System Prompt</span>
              <textarea
                className={textAreaClasses}
                value={profileOptionString(llmProfile, 'systemPrompt', '')}
                onChange={(e) =>
                  onUpsertProfile('llm', llmProfile.id, (current) => ({
                    ...current,
                    options: { ...(current.options || {}), systemPrompt: e.target.value }
                  }))
                }
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className={panelSurface}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm uppercase tracking-[0.28em] text-white/60">OCR</h3>
          <button
            className="rounded-xl border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-60"
            onClick={() => void verifyOcr()}
            disabled={ocrVerifyBusy}
          >
            {ocrVerifyBusy ? 'Verifying...' : 'Verify OCR'}
          </button>
        </div>
        <div className="mb-3">
          <VerificationResultCard result={ocrVerifyResult} onDismiss={() => setOcrVerifyResult(null)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-white/70 grid gap-1">
            <span>OCR Engine Mode</span>
            <select className={selectClasses} value={ocrMode} onChange={(event) => onSetOcrMode(event.target.value === 'local_tesseract' ? 'local_tesseract' : 'llm_vision')}>
              <option value="llm_vision">LLM Vision</option>
              <option value="local_tesseract">Local Tesseract</option>
            </select>
          </label>

          {!ocrProfile ? <p className="text-sm text-white/60">No active OCR profile selected.</p> : null}

          {ocrProfile && ocrMode === 'llm_vision' ? (
            <>
              <label className="text-xs text-white/70 grid gap-1">
                <span>Endpoint</span>
                <input className={inputClasses} value={ocrProfile.endpoint || ''} onChange={(e) => onUpsertProfile('ocr', ocrProfile.id, (current) => ({ ...current, endpoint: e.target.value }))} />
              </label>
              <label className="text-xs text-white/70 grid gap-1">
                <span>Model</span>
                <input className={inputClasses} value={ocrProfile.model || ''} onChange={(e) => onUpsertProfile('ocr', ocrProfile.id, (current) => ({ ...current, model: e.target.value }))} />
              </label>
              <label className="text-xs text-white/70 grid gap-1 md:col-span-2">
                <span>Secret Ref</span>
                <div className="flex gap-2">
                  <input className={inputClasses} value={ocrProfile.secretRef || ''} onChange={(e) => onUpsertProfile('ocr', ocrProfile.id, (current) => ({ ...current, secretRef: e.target.value }))} />
                  <button
                    className="rounded-xl border border-white/20 px-3 text-xs text-white/80 hover:bg-white/10"
                    onClick={() => onSaveProfileSecret('ocr', ocrProfile.id)}
                  >
                    Set value
                  </button>
                </div>
              </label>
              <label className="text-xs text-white/70 grid gap-1">
                <span>Vision OCR Request Timeout (ms)</span>
                <input
                  className={inputClasses}
                  type="number"
                  min={1000}
                  max={300000}
                  value={profileOptionNumber(ocrProfile, 'requestTimeoutMs', 30000)}
                  onChange={(event) =>
                    onUpsertProfile('ocr', ocrProfile.id, (current) => ({
                      ...current,
                      options: { ...(current.options || {}), requestTimeoutMs: Number(event.target.value || 30000) }
                    }))
                  }
                />
              </label>
              <label className="text-xs text-white/70 grid gap-1 md:col-span-2">
                <span>Vision OCR System Prompt</span>
                <textarea
                  className={textAreaClasses}
                  value={profileOptionString(ocrProfile, 'systemPrompt', 'Extract all visible text verbatim. Preserve line breaks. No summary.')}
                  onChange={(event) =>
                    onUpsertProfile('ocr', ocrProfile.id, (current) => ({
                      ...current,
                      options: { ...(current.options || {}), systemPrompt: event.target.value }
                    }))
                  }
                />
              </label>
            </>
          ) : null}

          {ocrProfile && ocrMode === 'local_tesseract' ? (
            <>
              <label className="text-xs text-white/70 grid gap-1">
                <span>Tesseract Binary Path</span>
                <input className={inputClasses} value={ocrProfile.localPath || ''} onChange={(event) => onUpsertProfile('ocr', ocrProfile.id, (current) => ({ ...current, localPath: event.target.value }))} />
              </label>
              <label className="text-xs text-white/70 grid gap-1">
                <span>Language</span>
                <input
                  className={inputClasses}
                  value={profileOptionString(ocrProfile, 'language', 'eng')}
                  onChange={(event) =>
                    onUpsertProfile('ocr', ocrProfile.id, (current) => ({
                      ...current,
                      options: { ...(current.options || {}), language: event.target.value }
                    }))
                  }
                />
              </label>
              <label className="text-xs text-white/70 grid gap-1">
                <span>Extra Args</span>
                <input
                  className={inputClasses}
                  value={profileOptionString(ocrProfile, 'extraArgs', '')}
                  placeholder="e.g. --psm 6"
                  onChange={(event) =>
                    onUpsertProfile('ocr', ocrProfile.id, (current) => ({
                      ...current,
                      options: { ...(current.options || {}), extraArgs: event.target.value }
                    }))
                  }
                />
              </label>
              <label className="text-xs text-white/70 grid gap-1">
                <span>CLI Timeout (ms)</span>
                <input
                  className={inputClasses}
                  type="number"
                  min={1000}
                  max={300000}
                  value={profileOptionNumber(ocrProfile, 'timeoutMs', 15000)}
                  onChange={(event) =>
                    onUpsertProfile('ocr', ocrProfile.id, (current) => ({
                      ...current,
                      options: { ...(current.options || {}), timeoutMs: Number(event.target.value || 15000) }
                    }))
                  }
                />
              </label>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
