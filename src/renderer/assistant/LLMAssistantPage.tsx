import React, { useEffect, useState } from 'react';
import { useConfigSync } from '../hooks/useConfigSync';

type OcrMode = 'llm_vision' | 'local_tesseract';

type SettingsConfig = {
  assistantName: string;
  llmEndpoint: string;
  llmModel: string;
  llmApiKey: string;
  llmSystemPrompt: string;
  ocr: {
    mode: OcrMode;
    vision: {
      systemPrompt: string;
      requestTimeoutMs: number;
    };
    localTesseract: {
      binaryPath: string;
      language: string;
      extraArgs: string;
      timeoutMs: number;
    };
  };
};

type SaveConfigResult =
  | { ok: true; warnings?: Array<{ code: string; message: string }> }
  | { ok: false; code: string; errors: Array<{ code: string; message: string }> };

function normalizeLlmHostInput(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : /^(localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?$/i.test(raw)
      ? `http://${raw}`
      : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_err) {
    return raw.replace(/\/+$/, '');
  }
}

const DEFAULT_CONFIG: SettingsConfig = {
  assistantName: 'Luna',
  llmEndpoint: 'https://api.openai.com',
  llmModel: 'gpt-5-nano',
  llmApiKey: '',
  llmSystemPrompt: '',
  ocr: {
    mode: 'llm_vision',
    vision: {
      systemPrompt: 'Extract all visible text verbatim. Preserve line breaks. No summary.',
      requestTimeoutMs: 30000
    },
    localTesseract: {
      binaryPath: 'tesseract',
      language: 'eng',
      extraArgs: '',
      timeoutMs: 15000
    }
  }
};

const panelSurface = 'rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-sm';
const inputClasses =
  'w-full rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-sky-400 focus:outline-none';
const selectClasses = `${inputClasses} bg-slate-950/60`;
const textAreaClasses = `${inputClasses} min-h-[120px] resize-none`;

function PanelField({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return (
    <label className="grid gap-2 text-sm text-white/80">
      <span className="text-xs uppercase tracking-[0.3em] text-white/60">{label}</span>
      {children}
    </label>
  );
}

function normalizeConfig(raw: any): SettingsConfig {
  const mode: OcrMode = raw?.ocr?.mode === 'local_tesseract' ? 'local_tesseract' : 'llm_vision';

  return {
    assistantName: String(raw?.assistantName ?? DEFAULT_CONFIG.assistantName),
    llmEndpoint: normalizeLlmHostInput(raw?.llmEndpoint ?? DEFAULT_CONFIG.llmEndpoint),
    llmModel: String(raw?.llmModel ?? DEFAULT_CONFIG.llmModel),
    llmApiKey: String(raw?.llmApiKey ?? ''),
    llmSystemPrompt: String(raw?.llmSystemPrompt ?? ''),
    ocr: {
      mode,
      vision: {
        systemPrompt: String(raw?.ocr?.vision?.systemPrompt ?? DEFAULT_CONFIG.ocr.vision.systemPrompt),
        requestTimeoutMs: Number(raw?.ocr?.vision?.requestTimeoutMs ?? DEFAULT_CONFIG.ocr.vision.requestTimeoutMs)
      },
      localTesseract: {
        binaryPath: String(raw?.ocr?.localTesseract?.binaryPath ?? DEFAULT_CONFIG.ocr.localTesseract.binaryPath),
        language: String(raw?.ocr?.localTesseract?.language ?? DEFAULT_CONFIG.ocr.localTesseract.language),
        extraArgs: String(raw?.ocr?.localTesseract?.extraArgs ?? ''),
        timeoutMs: Number(raw?.ocr?.localTesseract?.timeoutMs ?? DEFAULT_CONFIG.ocr.localTesseract.timeoutMs)
      }
    }
  };
}

export default function LLMAssistantPage() {
  const [draft, setDraft] = useState<SettingsConfig | null>(null);
  const [baseConfig, setBaseConfig] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const { hasExternalUpdate, reloadFromLatest, dismissExternalUpdate } = useConfigSync({
    baseConfig,
    draft,
    setBaseConfig,
    setDraft,
    normalizeDraft: normalizeConfig
  });

  useEffect(() => {
    (async () => {
      try {
        const cfg = await window.trayTranscriber?.getConfig?.();
        setBaseConfig(cfg ?? {});
        setDraft(normalizeConfig(cfg ?? {}));
      } catch (err) {
        setError(String(err));
      }
    })();
  }, []);

  const update = <K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    setStatus('idle');
    setValidationErrors([]);
  };

  const save = async () => {
    if (!draft) return;
    setStatus('saving');
    setError(null);
    setValidationErrors([]);

    try {
      const llmEndpoint = normalizeLlmHostInput(draft.llmEndpoint);
      const nextBase = {
        ...(baseConfig ?? {}),
        assistantName: draft.assistantName,
        llmEndpoint,
        llmModel: draft.llmModel,
        llmApiKey: draft.llmApiKey,
        llmSystemPrompt: draft.llmSystemPrompt,
        ocr: draft.ocr
      };
      const result = (await window.trayTranscriber?.updateConfig?.({
        ...nextBase
      })) as SaveConfigResult | undefined;

      if (!result || !result.ok) {
        const errors = result && !result.ok && Array.isArray(result.errors) ? result.errors.map((entry) => entry.message) : ['Configuration save failed.'];
        setValidationErrors(errors);
        setStatus('error');
        return;
      }

      setBaseConfig(nextBase);
      setDraft(normalizeConfig(nextBase));
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1400);
    } catch (err) {
      setStatus('error');
      setError(String(err));
    }
  };

  if (error) {
    return <div className="text-rose-400 text-sm">Failed to load assistant settings: {error}</div>;
  }
  if (!draft) {
    return <div className="text-white/60 text-sm">Loading assistant settings…</div>;
  }

  return (
    <div className="space-y-6 text-white">
      {hasExternalUpdate ? (
        <section className="rounded-2xl border border-sky-300/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          <p>Configuration changed elsewhere. Keep edits or reload latest.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="rounded-xl border border-sky-200/40 px-3 py-1 text-xs hover:bg-sky-300/20" onClick={reloadFromLatest}>
              Reload latest
            </button>
            <button className="rounded-xl border border-white/20 px-3 py-1 text-xs hover:bg-white/10" onClick={dismissExternalUpdate}>
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      <section className={panelSurface}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PanelField label="Assistant Name">
            <input className={inputClasses} value={draft.assistantName} onChange={(e) => update('assistantName', e.target.value)} />
          </PanelField>
          <PanelField label="LLM Host">
            <div className="space-y-2">
              <input
                className={inputClasses}
                value={draft.llmEndpoint}
                placeholder="http://localhost:1234"
                onChange={(e) => update('llmEndpoint', e.target.value)}
              />
              <p className="text-xs text-white/60">
                OpenAI-compatible API host. The app will use `/v1/responses` (and file endpoints for vision workflows).
              </p>
            </div>
          </PanelField>
          <PanelField label="LLM Model">
            <input className={inputClasses} value={draft.llmModel} onChange={(e) => update('llmModel', e.target.value)} />
          </PanelField>
          <PanelField label="LLM API Key">
            <input className={inputClasses} type="password" value={draft.llmApiKey} onChange={(e) => update('llmApiKey', e.target.value)} />
          </PanelField>
          <PanelField label="System Prompt">
            <textarea className={textAreaClasses} value={draft.llmSystemPrompt} onChange={(e) => update('llmSystemPrompt', e.target.value)} />
          </PanelField>
        </div>
      </section>

      <section className={panelSurface}>
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">OCR</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <PanelField label="OCR Engine Mode">
            <select
              className={selectClasses}
              value={draft.ocr.mode}
              onChange={(event) =>
                update('ocr', {
                  ...draft.ocr,
                  mode: event.target.value === 'local_tesseract' ? 'local_tesseract' : 'llm_vision'
                })
              }
            >
              <option value="llm_vision">LLM Vision</option>
              <option value="local_tesseract">Local Tesseract</option>
            </select>
          </PanelField>

          {draft.ocr.mode === 'llm_vision' && (
            <PanelField label="Vision OCR Request Timeout (ms)">
              <input
                className={inputClasses}
                type="number"
                min={1000}
                max={300000}
                value={draft.ocr.vision.requestTimeoutMs}
                onChange={(event) =>
                  update('ocr', {
                    ...draft.ocr,
                    vision: {
                      ...draft.ocr.vision,
                      requestTimeoutMs: Number(event.target.value || 30000)
                    }
                  })
                }
              />
            </PanelField>
          )}

          {draft.ocr.mode === 'llm_vision' && (
            <PanelField label="Vision OCR System Prompt">
              <textarea
                className={textAreaClasses}
                value={draft.ocr.vision.systemPrompt}
                onChange={(event) =>
                  update('ocr', {
                    ...draft.ocr,
                    vision: {
                      ...draft.ocr.vision,
                      systemPrompt: event.target.value
                    }
                  })
                }
              />
            </PanelField>
          )}

          {draft.ocr.mode === 'local_tesseract' && (
            <>
              <PanelField label="Tesseract Binary Path">
                <input
                  className={inputClasses}
                  value={draft.ocr.localTesseract.binaryPath}
                  onChange={(event) =>
                    update('ocr', {
                      ...draft.ocr,
                      localTesseract: {
                        ...draft.ocr.localTesseract,
                        binaryPath: event.target.value
                      }
                    })
                  }
                />
              </PanelField>

              <PanelField label="Language">
                <input
                  className={inputClasses}
                  value={draft.ocr.localTesseract.language}
                  onChange={(event) =>
                    update('ocr', {
                      ...draft.ocr,
                      localTesseract: {
                        ...draft.ocr.localTesseract,
                        language: event.target.value
                      }
                    })
                  }
                />
              </PanelField>

              <PanelField label="Extra Args">
                <input
                  className={inputClasses}
                  value={draft.ocr.localTesseract.extraArgs}
                  placeholder="e.g. --psm 6"
                  onChange={(event) =>
                    update('ocr', {
                      ...draft.ocr,
                      localTesseract: {
                        ...draft.ocr.localTesseract,
                        extraArgs: event.target.value
                      }
                    })
                  }
                />
              </PanelField>

              <PanelField label="CLI Timeout (ms)">
                <input
                  className={inputClasses}
                  type="number"
                  min={1000}
                  max={300000}
                  value={draft.ocr.localTesseract.timeoutMs}
                  onChange={(event) =>
                    update('ocr', {
                      ...draft.ocr,
                      localTesseract: {
                        ...draft.ocr.localTesseract,
                        timeoutMs: Number(event.target.value || 15000)
                      }
                    })
                  }
                />
              </PanelField>
            </>
          )}
        </div>
      </section>

      <section className={panelSurface}>
        <div className="space-y-3">
          {!!validationErrors.length && (
            <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              {validationErrors.map((entry, index) => (
                <p key={`validation-${index}`}>{entry}</p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {status === 'saved' && <span className="text-xs uppercase tracking-[0.4em] text-emerald-300">Saved</span>}
            {status === 'error' && <span className="text-xs uppercase tracking-[0.4em] text-rose-300">Save failed</span>}
            <button
              type="button"
              className="rounded-2xl border border-transparent bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
              onClick={save}
              disabled={status === 'saving'}
            >
              {status === 'saving' ? 'Saving…' : 'Save Assistant'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
