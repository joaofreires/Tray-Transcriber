import React, { useEffect, useState } from 'react';

type AssistantShortcut = { shortcut: string; prompt: string };
type SettingsConfig = {
  assistantName: string;
  llmEndpoint: string;
  llmModel: string;
  llmApiKey: string;
  llmSystemPrompt: string;
  assistantShortcuts: AssistantShortcut[];
};

const DEFAULT_CONFIG: SettingsConfig = {
  assistantName: 'Luna',
  llmEndpoint: 'https://api.openai.com/v1/chat/completions',
  llmModel: 'gpt-5-nano',
  llmApiKey: '',
  llmSystemPrompt: '',
  assistantShortcuts: []
};

const panelSurface = 'rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-sm';
const inputClasses =
  'w-full rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-sky-400 focus:outline-none';
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
  return {
    assistantName: String(raw?.assistantName ?? DEFAULT_CONFIG.assistantName),
    llmEndpoint: String(raw?.llmEndpoint ?? DEFAULT_CONFIG.llmEndpoint),
    llmModel: String(raw?.llmModel ?? DEFAULT_CONFIG.llmModel),
    llmApiKey: String(raw?.llmApiKey ?? ''),
    llmSystemPrompt: String(raw?.llmSystemPrompt ?? ''),
    assistantShortcuts: Array.isArray(raw?.assistantShortcuts)
      ? raw.assistantShortcuts
          .map((entry: any) => ({
            shortcut: String(entry?.shortcut ?? '').trim(),
            prompt: String(entry?.prompt ?? '').trim()
          }))
          .filter((entry: AssistantShortcut) => !!entry.shortcut || !!entry.prompt)
      : []
  };
}

export default function LLMAssistantPage() {
  const [draft, setDraft] = useState<SettingsConfig | null>(null);
  const [baseConfig, setBaseConfig] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'assistant' | 'shortcuts'>('shortcuts');

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
  };

  const save = () => {
    if (!draft) return;
    setStatus('saving');
    try {
      window.trayTranscriber?.updateConfig?.({
        ...(baseConfig ?? {}),
        assistantName: draft.assistantName,
        llmEndpoint: draft.llmEndpoint,
        llmModel: draft.llmModel,
        llmApiKey: draft.llmApiKey,
        llmSystemPrompt: draft.llmSystemPrompt,
        assistantShortcuts: draft.assistantShortcuts
      });
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

  const renderAssistantTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <PanelField label="Assistant Name">
        <input className={inputClasses} value={draft.assistantName} onChange={(e) => update('assistantName', e.target.value)} />
      </PanelField>
      <PanelField label="LLM Endpoint">
        <input className={inputClasses} value={draft.llmEndpoint} onChange={(e) => update('llmEndpoint', e.target.value)} />
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
  );

  const renderShortcutsTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">Assistant shortcuts</p>
        <button
          type="button"
          className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 transition hover:border-white/30"
          onClick={() => update('assistantShortcuts', [...draft.assistantShortcuts, { shortcut: '', prompt: '' }])}
        >
          Add shortcut
        </button>
      </div>
      <div className="grid gap-3">
        {draft.assistantShortcuts.map((entry, index) => (
          <div key={`shortcut-${index}`} className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
            <PanelField label="Shortcut">
              <input
                className={inputClasses}
                value={entry.shortcut}
                placeholder="CommandOrControl+Alt+P"
                onChange={(e) => {
                  const next = [...draft.assistantShortcuts];
                  next[index] = { ...next[index], shortcut: e.target.value };
                  update('assistantShortcuts', next);
                }}
              />
            </PanelField>
            <PanelField label="Prompt">
              <input
                className={inputClasses}
                value={entry.prompt}
                onChange={(e) => {
                  const next = [...draft.assistantShortcuts];
                  next[index] = { ...next[index], prompt: e.target.value };
                  update('assistantShortcuts', next);
                }}
              />
            </PanelField>
            <button
              type="button"
              className="rounded-full border border-rose-400/70 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
              onClick={() => update('assistantShortcuts', draft.assistantShortcuts.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const tabButtonClasses = (tabId: 'assistant' | 'shortcuts') =>
    `rounded-2xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition ${
      activeTab === tabId
        ? 'border-white/40 bg-white/10 text-white'
        : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30'
    }`;

  return (
    <div className="space-y-6 text-white">
      <section className={panelSurface}>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={tabButtonClasses('assistant')} onClick={() => setActiveTab('assistant')}>
            LLM Settings
          </button>
          <button type="button" className={tabButtonClasses('shortcuts')} onClick={() => setActiveTab('shortcuts')}>
            Shortcuts
          </button>
        </div>
        <div className="mt-6">{activeTab === 'assistant' ? renderAssistantTab() : renderShortcutsTab()}</div>
      </section>

      <section className={panelSurface}>
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
      </section>
    </div>
  );
}
