import React, { useEffect, useMemo, useState } from 'react';

type DictionaryEntry = { term: string; description: string };
type CorrectionEntry = { from: string; to: string };
type AssistantShortcut = { shortcut: string; prompt: string };

type SettingsConfig = {
  hotkey: string;
  pressToTalk: boolean;
  holdToTalk: boolean;
  pasteMode: string;
  asrEngine: string;
  model: string;
  language: string;
  device: string;
  computeType: string;
  batchSize: number;
  noAlign: boolean;
  dictionary: DictionaryEntry[];
  dictionaryCorrections: CorrectionEntry[];
  assistantName: string;
  llmEndpoint: string;
  llmModel: string;
  llmApiKey: string;
  llmSystemPrompt: string;
  assistantShortcuts: AssistantShortcut[];
  includeDictionaryInPrompt: boolean;
  includeDictionaryDescriptions: boolean;
  prompt: string;
  promptMode: string;
  useWorker: boolean;
  workerWarmup: boolean;
  workerHost: string;
  workerPort: number;
  workerTransport: string;
  workerRequestTimeoutMs: number;
  workerStatusPollMs: number;
  minRecordingBytes: number;
  holdStopOnModifierRelease: boolean;
  logLevel: string;
  pythonPath: string;
  disableCuda: boolean;
  forceNoWeightsOnlyLoad: boolean;
  cursorBusy: boolean;
};

type SettingsTab = 'general' | 'stt' | 'assistant' | 'shortcuts' | 'worker' | 'advanced';

const DEFAULT_CONFIG: SettingsConfig = {
  hotkey: 'CommandOrControl+Shift+Space',
  pressToTalk: true,
  holdToTalk: false,
  pasteMode: 'clipboard',
  asrEngine: 'whisperx',
  model: 'small',
  language: '',
  device: 'default',
  computeType: 'int8',
  batchSize: 4,
  noAlign: false,
  dictionary: [],
  dictionaryCorrections: [],
  assistantName: 'Luna',
  llmEndpoint: 'https://api.openai.com/v1/chat/completions',
  llmModel: 'gpt-5-nano',
  llmApiKey: '',
  llmSystemPrompt: '',
  assistantShortcuts: [],
  includeDictionaryInPrompt: true,
  includeDictionaryDescriptions: false,
  prompt: '',
  promptMode: 'append',
  useWorker: true,
  workerWarmup: true,
  workerHost: '127.0.0.1',
  workerPort: 8765,
  workerTransport: 'stdio',
  workerRequestTimeoutMs: 600000,
  workerStatusPollMs: 30000,
  minRecordingBytes: 200,
  holdStopOnModifierRelease: false,
  logLevel: 'auto',
  pythonPath: '',
  disableCuda: false,
  forceNoWeightsOnlyLoad: false,
  cursorBusy: false
};

function normalizeConfig(raw: any): SettingsConfig {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    dictionary: Array.isArray(raw?.dictionary)
      ? raw.dictionary
          .map((entry: any) => {
            if (typeof entry === 'string') {
              return { term: entry.trim(), description: '' };
            }

            return {
              term: String(entry?.term ?? entry?.word ?? '').trim(),
              description: String(entry?.description ?? '').trim()
            };
          })
          .filter((entry: DictionaryEntry) => !!entry.term)
      : [],
    dictionaryCorrections: Array.isArray(raw?.dictionaryCorrections)
      ? raw.dictionaryCorrections
          .map((entry: any) => ({
            from: String(entry?.from ?? '').trim(),
            to: String(entry?.to ?? '').trim()
          }))
          .filter((entry: CorrectionEntry) => !!entry.from || !!entry.to)
      : [],
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

const panelSurface = 'rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-sm';
const inputClasses =
  'w-full rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-sky-400 focus:outline-none';
const selectClasses = `${inputClasses} bg-slate-950/60`;
const textAreaClasses = `${inputClasses} min-h-[120px] resize-none`;

type PanelFieldProps = React.PropsWithChildren<{ label: string; className?: string }>;

function PanelField({ label, children, className }: PanelFieldProps) {
  return (
    <label className={`grid gap-2 text-sm text-white/80 ${className ?? ''}`}>
      <span className="text-xs uppercase tracking-[0.3em] text-white/60">{label}</span>
      {children}
    </label>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-white/80">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border border-white/30 bg-slate-950 text-emerald-400 focus:ring-emerald-400"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('stt');
  const [draft, setDraft] = useState<SettingsConfig | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await window.trayTranscriber?.getConfig?.();
        setDraft(normalizeConfig(cfg ?? {}));
      } catch (err) {
        setError(String(err));
      }
    })();
  }, []);

  const tabs: Array<{ id: SettingsTab; label: string }> = useMemo(
    () => [
      { id: 'stt', label: 'STT Model' },
      { id: 'worker', label: 'Worker' },
      { id: 'general', label: 'General' },
      { id: 'assistant', label: 'LLM' },
      { id: 'shortcuts', label: 'Assistant Shortcuts' },
      { id: 'advanced', label: 'Advanced' }
    ],
    []
  );

  const update = <K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    setStatus('idle');
  };

  const save = async () => {
    if (!draft) return;
    setStatus('saving');
    try {
      window.trayTranscriber?.updateConfig?.(draft);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1400);
    } catch (err) {
      setStatus('error');
      setError(String(err));
    }
  };

  const resetDefaults = () => {
    setDraft({ ...DEFAULT_CONFIG });
    setStatus('idle');
  };

  if (error) {
    return <div className="text-rose-400 text-sm">Failed to load settings: {error}</div>;
  }

  if (!draft) {
    return <div className="text-white/60 text-sm">Loading settings…</div>;
  }

  const renderSttTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <PanelField label="ASR Engine">
        <select className={selectClasses} value={draft.asrEngine} onChange={(e) => update('asrEngine', e.target.value)}>
          <option value="whisperx">whisperx</option>
          <option value="whisper">whisper</option>
          <option value="faster-whisper">faster-whisper</option>
        </select>
      </PanelField>
      <PanelField label="Model">
        <select className={selectClasses} value={draft.model} onChange={(e) => update('model', e.target.value)}>
          <option value="tiny">tiny</option>
          <option value="base">base</option>
          <option value="small">small</option>
          <option value="medium">medium</option>
          <option value="large">large</option>
        </select>
      </PanelField>
      <PanelField label="Language">
        <input className={inputClasses} value={draft.language} placeholder="en (blank = auto)" onChange={(e) => update('language', e.target.value)} />
      </PanelField>
      <PanelField label="Device">
        <select className={selectClasses} value={draft.device} onChange={(e) => update('device', e.target.value)}>
          <option value="default">default</option>
          <option value="cpu">cpu</option>
          <option value="gpu">gpu</option>
        </select>
      </PanelField>
      <PanelField label="Compute Type">
        <select className={selectClasses} value={draft.computeType} onChange={(e) => update('computeType', e.target.value)}>
          <option value="int8">int8</option>
          <option value="int8_float16">int8_float16</option>
          <option value="int16">int16</option>
          <option value="float32">float32</option>
        </select>
      </PanelField>
      <PanelField label="Batch Size">
        <input
          className={inputClasses}
          type="number"
          min={1}
          max={32}
          value={draft.batchSize}
          onChange={(e) => update('batchSize', Number(e.target.value || 4))}
        />
      </PanelField>
      <div className="flex flex-wrap items-center gap-4">
        <ToggleField label="Skip alignment" checked={draft.noAlign} onChange={(value) => update('noAlign', value)} />
      </div>
      <PanelField label="Prompt Prefix">
        <textarea className={textAreaClasses} value={draft.prompt} onChange={(e) => update('prompt', e.target.value)} />
      </PanelField>
      <PanelField label="Prompt Mode">
        <select className={selectClasses} value={draft.promptMode} onChange={(e) => update('promptMode', e.target.value)}>
          <option value="append">append</option>
          <option value="prepend">prepend</option>
          <option value="replace">replace</option>
        </select>
      </PanelField>
    </div>
  );

  const renderWorkerTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <ToggleField label="Use background worker" checked={draft.useWorker} onChange={(value) => update('useWorker', value)} />
      <ToggleField label="Warmup worker on startup" checked={draft.workerWarmup} onChange={(value) => update('workerWarmup', value)} />
      <PanelField label="Transport">
        <select className={selectClasses} value={draft.workerTransport} onChange={(e) => update('workerTransport', e.target.value)}>
          <option value="stdio">stdio</option>
          <option value="http">http</option>
        </select>
      </PanelField>
      <PanelField label="Worker Host">
        <input className={inputClasses} value={draft.workerHost} onChange={(e) => update('workerHost', e.target.value)} />
      </PanelField>
      <PanelField label="Worker Port">
        <input
          className={inputClasses}
          type="number"
          value={draft.workerPort}
          onChange={(e) => update('workerPort', Number(e.target.value || 8765))}
        />
      </PanelField>
      <PanelField label="Request Timeout (ms)">
        <input
          className={inputClasses}
          type="number"
          value={draft.workerRequestTimeoutMs}
          onChange={(e) => update('workerRequestTimeoutMs', Number(e.target.value || 600000))}
        />
      </PanelField>
      <PanelField label="Status Poll (ms)">
        <input
          className={inputClasses}
          type="number"
          value={draft.workerStatusPollMs}
          onChange={(e) => update('workerStatusPollMs', Number(e.target.value || 30000))}
        />
      </PanelField>
      <PanelField label="Min Recording Bytes">
        <input
          className={inputClasses}
          type="number"
          value={draft.minRecordingBytes}
          onChange={(e) => update('minRecordingBytes', Number(e.target.value || 200))}
        />
      </PanelField>
    </div>
  );

  const renderGeneralTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <PanelField label="Hotkey">
        <input className={inputClasses} value={draft.hotkey} onChange={(e) => update('hotkey', e.target.value)} />
      </PanelField>
      <PanelField label="Paste Mode">
        <select className={selectClasses} value={draft.pasteMode} onChange={(e) => update('pasteMode', e.target.value)}>
          <option value="clipboard">Clipboard only</option>
          <option value="paste">Auto-paste</option>
        </select>
      </PanelField>
      <ToggleField label="Press-to-talk" checked={draft.pressToTalk} onChange={(value) => update('pressToTalk', value)} />
      <ToggleField label="Hold-to-talk" checked={draft.holdToTalk} onChange={(value) => update('holdToTalk', value)} />
      <ToggleField
        label="Stop hold-to-talk when modifier releases"
        checked={draft.holdStopOnModifierRelease}
        onChange={(value) => update('holdStopOnModifierRelease', value)}
      />
      <ToggleField label="Show busy cursor during processing" checked={draft.cursorBusy} onChange={(value) => update('cursorBusy', value)} />
    </div>
  );

  const renderAdvancedTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <PanelField label="Log Level">
        <select className={selectClasses} value={draft.logLevel} onChange={(e) => update('logLevel', e.target.value)}>
          <option value="auto">auto</option>
          <option value="silent">silent</option>
          <option value="error">error</option>
          <option value="info">info</option>
          <option value="debug">debug</option>
        </select>
      </PanelField>
      <PanelField label="Python Path (optional)">
        <input className={inputClasses} value={draft.pythonPath} onChange={(e) => update('pythonPath', e.target.value)} />
      </PanelField>
      <ToggleField label="Disable CUDA" checked={draft.disableCuda} onChange={(value) => update('disableCuda', value)} />
      <ToggleField
        label="Force non-weights-only torch load"
        checked={draft.forceNoWeightsOnlyLoad}
        onChange={(value) => update('forceNoWeightsOnlyLoad', value)}
      />
    </div>
  );

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

  const activeTabContent = () => {
    switch (activeTab) {
      case 'stt':
        return renderSttTab();
      case 'worker':
        return renderWorkerTab();
      case 'general':
        return renderGeneralTab();
      case 'advanced':
        return renderAdvancedTab();
      case 'assistant':
        return renderAssistantTab();
      case 'shortcuts':
        return renderShortcutsTab();
      default:
        return null;
    }
  };

  const tabButtonClasses = (tabId: SettingsTab) =>
    `rounded-2xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition ${
      activeTab === tabId
        ? 'border-white/40 bg-white/10 text-white'
        : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30'
    }`;

  return (
    <div className="space-y-6 text-white">
      <section className={panelSurface}>
        <div className="flex flex-wrap gap-3">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" className={tabButtonClasses(tab.id)} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="mt-6 space-y-6">{activeTabContent()}</div>
      </section>

      <section className={panelSurface}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30"
            onClick={resetDefaults}
          >
            Reset defaults
          </button>
          <div className="flex flex-wrap items-center gap-3">
            {status === 'saved' && <span className="text-xs uppercase tracking-[0.4em] text-emerald-300">Saved</span>}
            {status === 'error' && <span className="text-xs uppercase tracking-[0.4em] text-rose-300">Save failed</span>}
            <button
              type="button"
              className="rounded-2xl border border-transparent bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
              onClick={save}
              disabled={status === 'saving'}
            >
              {status === 'saving' ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
