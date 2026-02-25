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
  // when true the UI will show a spinning/wait cursor during busy states
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
    return <div className="text-red-600 text-sm">Failed to load settings: {error}</div>;
  }

  if (!draft) {
    return <div className="text-gray-500 text-sm">Loading settings…</div>;
  }

  return (
    <div className="mt-2 grid gap-4">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`border rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer shadow-sm ${
              activeTab === tab.id
                ? ' text-gray-900 dark:text-white border-blue-300 dark:border-blue-300 bg-blue-100 dark:bg-blue-900'
                : ' border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer shadow-sm hover:bg-gray-200 dark:hover:bg-slate-600'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'stt' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">ASR Engine</span>
            <select className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" value={draft.asrEngine} onChange={(e) => update('asrEngine', e.target.value)}>
              <option value="whisperx">whisperx</option>
              <option value="whisper">whisper</option>
              <option value="faster-whisper">faster-whisper</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Model</span>
            <select className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" value={draft.model} onChange={(e) => update('model', e.target.value)}>
              <option value="tiny">tiny</option>
              <option value="base">base</option>
              <option value="small">small</option>
              <option value="medium">medium</option>
              <option value="large">large</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Language</span>
            <input className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" value={draft.language} onChange={(e) => update('language', e.target.value)} placeholder="en (blank = auto)" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Device</span>
            <select className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" value={draft.device} onChange={(e) => update('device', e.target.value)}>
              <option value="default">default</option>
              <option value="cpu">cpu</option>
              <option value="gpu">gpu</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Compute Type</span>
            <select className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" value={draft.computeType} onChange={(e) => update('computeType', e.target.value)}>
              <option value="int8">int8</option>
              <option value="int8_float16">int8_float16</option>
              <option value="int16">int16</option>
              <option value="float32">float32</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Batch Size</span>
            <input
              className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
              type="number"
              min={1}
              max={32}
              value={draft.batchSize}
              onChange={(e) => update('batchSize', Number(e.target.value || 4))}
            />
          </label>
          <label className="inline-flex items-center gap-1 text-sm text-gray-900">
            <input type="checkbox" className="mr-1" checked={draft.noAlign} onChange={(e) => update('noAlign', e.target.checked)} />
            Skip Alignment
          </label>

          <label className="col-span-2 grid gap-1">
            <span className="text-xs text-gray-500">Prompt Prefix</span>
            <textarea className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" value={draft.prompt} onChange={(e) => update('prompt', e.target.value)} />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Prompt Mode</span>
            <select className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" value={draft.promptMode} onChange={(e) => update('promptMode', e.target.value)}>
              <option value="append">append</option>
              <option value="prepend">prepend</option>
              <option value="replace">replace</option>
            </select>
          </label>
        </div>
      )}



      {activeTab === 'worker' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="inline-flex items-center gap-1 text-sm text-gray-900">
            <input className="mr-1" type="checkbox" checked={draft.useWorker} onChange={(e) => update('useWorker', e.target.checked)} />
            Use background worker
          </label>
          <label className="inline-flex items-center gap-1 text-sm text-gray-900">
            <input className="mr-1" type="checkbox" checked={draft.workerWarmup} onChange={(e) => update('workerWarmup', e.target.checked)} />
            Warmup worker on startup
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Transport</span>
            <select className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" value={draft.workerTransport} onChange={(e) => update('workerTransport', e.target.value)}>
              <option value="stdio">stdio</option>
              <option value="http">http</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Worker Host</span>
            <input className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" value={draft.workerHost} onChange={(e) => update('workerHost', e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Worker Port</span>
            <input className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" type="number" value={draft.workerPort} onChange={(e) => update('workerPort', Number(e.target.value || 8765))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Request Timeout (ms)</span>
            <input
              className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
              type="number"
              value={draft.workerRequestTimeoutMs}
              onChange={(e) => update('workerRequestTimeoutMs', Number(e.target.value || 600000))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Status Poll (ms)</span>
            <input
              className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
              type="number"
              value={draft.workerStatusPollMs}
              onChange={(e) => update('workerStatusPollMs', Number(e.target.value || 30000))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Min Recording Bytes</span>
            <input
              className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
              type="number"
              value={draft.minRecordingBytes}
              onChange={(e) => update('minRecordingBytes', Number(e.target.value || 200))}
            />
          </label>
        </div>
      )}

      {activeTab === 'general' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Hotkey</span>
            <input className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" value={draft.hotkey} onChange={(e) => update('hotkey', e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Paste Mode</span>
            <select className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" value={draft.pasteMode} onChange={(e) => update('pasteMode', e.target.value)}>
              <option value="clipboard">Clipboard only</option>
              <option value="paste">Auto-paste</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1 text-sm text-gray-900">
            <input className="mr-1" type="checkbox" checked={draft.pressToTalk} onChange={(e) => update('pressToTalk', e.target.checked)} />
            Press-to-talk
          </label>
          <label className="inline-flex items-center gap-1 text-sm text-gray-900">
            <input className="mr-1" type="checkbox" checked={draft.holdToTalk} onChange={(e) => update('holdToTalk', e.target.checked)} />
            Hold-to-talk
          </label>
          <label className="inline-flex items-center gap-1 text-sm text-gray-900">
            <input
              className="mr-1"
              type="checkbox"
              checked={draft.holdStopOnModifierRelease}
              onChange={(e) => update('holdStopOnModifierRelease', e.target.checked)}
            />
            Stop hold-to-talk when modifier releases
          </label>
          <label className="inline-flex items-center gap-1 text-sm text-gray-900">
            <input className="mr-1" type="checkbox" checked={draft.cursorBusy} onChange={(e) => update('cursorBusy', e.target.checked)} />
            Show busy cursor during processing
          </label>
        </div>
      )}

      {activeTab === 'advanced' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Log Level</span>
            <select className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" value={draft.logLevel} onChange={(e) => update('logLevel', e.target.value)}>
              <option value="auto">auto</option>
              <option value="silent">silent</option>
              <option value="error">error</option>
              <option value="info">info</option>
              <option value="debug">debug</option>
            </select>
          </label>
          <label className="col-span-2 grid gap-1">
            <span className="text-xs text-gray-500">Python Path (optional)</span>
            <input className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm" value={draft.pythonPath} onChange={(e) => update('pythonPath', e.target.value)} />
          </label>
          <label className="inline-flex items-center gap-1 text-sm text-gray-900">
            <input className="mr-1" type="checkbox" checked={draft.disableCuda} onChange={(e) => update('disableCuda', e.target.checked)} />
            Disable CUDA
          </label>
          <label className="inline-flex items-center gap-1 text-sm text-gray-900">
            <input
              className="mr-1"
              type="checkbox"
              checked={draft.forceNoWeightsOnlyLoad}
              onChange={(e) => update('forceNoWeightsOnlyLoad', e.target.checked)}
            />
            Force non-weights-only torch load
          </label>
        </div>
      )}

      <div className="flex justify-between items-center gap-2">
        <button type="button" className="border border-gray-200 dark:border-gray-700 text-gray-900 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-400" onClick={resetDefaults}>Reset Defaults</button>
        <div className="inline-flex items-center gap-2">
          {status === 'saved' && <span className="text-xs text-gray-500">Saved</span>}
          {status === 'error' && <span className="text-xs text-red-600">Save failed</span>}
          <button type="button" className="border border-gray-200 dark:border-gray-700 text-gray-900 dark:border-gray-600 bg-blue-500 dark:bg-blue-500 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:bg-blue-600 dark:hover:bg-blue-600 hover:border-blue-300 dark:hover:border-blue-400 text-white" onClick={save} disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
