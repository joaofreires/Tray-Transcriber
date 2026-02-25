import React, { useEffect, useMemo, useState } from 'react';

// reuse types from SettingsPage by redeclaring minimal needed

type AssistantShortcut = { shortcut: string; prompt: string };

type SettingsConfig = {
  assistantName: string;
  llmEndpoint: string;
  llmModel: string;
  llmApiKey: string;
  llmSystemPrompt: string;
  assistantShortcuts: AssistantShortcut[];
};

// default values (taken from SettingsPage DEFAULT_CONFIG)
const DEFAULT_CONFIG: SettingsConfig = {
  assistantName: 'Luna',
  llmEndpoint: 'https://api.openai.com/v1/chat/completions',
  llmModel: 'gpt-5-nano',
  llmApiKey: '',
  llmSystemPrompt: '',
  assistantShortcuts: []
};

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
          .filter((e: AssistantShortcut) => !!e.shortcut || !!e.prompt)
      : []
  };
}

export default function LLMAssistantPage() {
  const [draft, setDraft] = useState<SettingsConfig | null>(null);
  const [baseConfig, setBaseConfig] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

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

  const tabs: Array<{ id: 'assistant' | 'shortcuts'; label: string }> = useMemo(
    () => [
      { id: 'shortcuts', label: 'Shortcuts' },
      { id: 'assistant', label: 'LLM Settings' },
    ],
    []
  );

  const [activeTab, setActiveTab] = useState<'assistant' | 'shortcuts'>('shortcuts');

  if (error) {
    return <div className="text-red-600 text-sm">Failed to load assistant settings: {error}</div>;
  }
  if (!draft) {
    return <div className="text-gray-500 text-sm">Loading assistant settings…</div>;
  }

  return (
    <div className="mt-2 grid gap-4">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Assistant sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`border rounded-lg text-sm font-semibold px-3 py-1 cursor-pointer ${
              activeTab === tab.id ?
              'text-gray-900 dark:text-gray-100 border-blue-300 dark:border-blue-400 bg-blue-100 dark:bg-blue-900'
              : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 '
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'assistant' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">Assistant Name</span>
            <input
              className="border border-gray-200 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
              value={draft.assistantName}
              onChange={(e) => update('assistantName', e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">LLM Endpoint</span>
            <input
              className="border border-gray-200 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
              value={draft.llmEndpoint}
              onChange={(e) => update('llmEndpoint', e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">LLM Model</span>
            <input
              className="border border-gray-200 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
              value={draft.llmModel}
              onChange={(e) => update('llmModel', e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">LLM API Key</span>
            <input
              className="border border-gray-200 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
              type="password"
              value={draft.llmApiKey}
              onChange={(e) => update('llmApiKey', e.target.value)}
            />
          </label>
          <label className="col-span-2 grid gap-1">
            <span className="text-xs text-gray-500">System Prompt</span>
            <textarea
              className="border border-gray-200 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
              rows={5}
              value={draft.llmSystemPrompt}
              onChange={(e) => update('llmSystemPrompt', e.target.value)}
            />
          </label>
        </div>
      )}

      {activeTab === 'shortcuts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="grid gap-2 col-span-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">Assistant shortcuts</span>
              <button
                type="button"
                className="border border-gray-200 text-gray-900 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-400"
                onClick={() => update('assistantShortcuts', [...draft.assistantShortcuts, { shortcut: '', prompt: '' }])}
              >
                Add shortcut
              </button>
            </div>
            <div className="grid gap-1">
              {draft.assistantShortcuts.map((entry, index) => (
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-1 items-center min-w-0" key={`shortcut-${index}`}>
                  <label className="block text-xs font-semibold sm:hidden">Shortcut</label>
                  <input
                    className="border border-gray-200 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
                    value={entry.shortcut}
                    placeholder="CommandOrControl+Alt+P"
                    onChange={(e) => {
                      const next = [...draft.assistantShortcuts];
                      next[index] = { ...next[index], shortcut: e.target.value };
                      update('assistantShortcuts', next);
                    }}
                  />
                  <label className="block text-xs font-semibold sm:hidden">Prompt</label>
                  <input
                    className="border border-gray-200 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
                    value={entry.prompt}
                    placeholder="Prompt"
                    onChange={(e) => {
                      const next = [...draft.assistantShortcuts];
                      next[index] = { ...next[index], prompt: e.target.value };
                      update('assistantShortcuts', next);
                    }}
                  />                  <button
                    type="button"
                    className="border border-gray-200 text-gray-900 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-400"
                    onClick={() => update('assistantShortcuts', draft.assistantShortcuts.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center gap-2">
        <button type="button" className="border border-gray-200 text-gray-900 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-400" onClick={() => setDraft({ ...DEFAULT_CONFIG })}>Reset Defaults</button>
        <div className="inline-flex items-center gap-2">
          {status === 'saved' && <span className="text-xs text-gray-500">Saved</span>}
          {status === 'error' && <span className="text-xs text-red-600">Save failed</span>}
          <button type="button" className="border border-gray-200 text-gray-900 bg-blue-500 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:bg-blue-600 hover:border-blue-300 text-white" onClick={save} disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}