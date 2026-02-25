import React, { useEffect, useState } from 'react';

type DictionaryEntry = { term: string; description: string };
type CorrectionEntry = { from: string; to: string };

type DictionaryConfig = {
  dictionary: DictionaryEntry[];
  dictionaryCorrections: CorrectionEntry[];
  includeDictionaryInPrompt: boolean;
  includeDictionaryDescriptions: boolean;
};

function normalizeConfig(raw: any): DictionaryConfig {
  return {
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
    includeDictionaryInPrompt: raw?.includeDictionaryInPrompt !== false,
    includeDictionaryDescriptions: !!raw?.includeDictionaryDescriptions
  };
}

export default function DictionaryPage() {
  const [draft, setDraft] = useState<DictionaryConfig | null>(null);
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

  const update = <K extends keyof DictionaryConfig>(key: K, value: DictionaryConfig[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    setStatus('idle');
  };

  const save = () => {
    if (!draft) return;

    setStatus('saving');
    try {
      window.trayTranscriber?.updateConfig?.({
        ...(baseConfig ?? {}),
        dictionary: draft.dictionary,
        dictionaryCorrections: draft.dictionaryCorrections,
        includeDictionaryInPrompt: draft.includeDictionaryInPrompt,
        includeDictionaryDescriptions: draft.includeDictionaryDescriptions
      });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1400);
    } catch (err) {
      setStatus('error');
      setError(String(err));
    }
  };

  if (error) {
    return <div className="text-red-600 text-sm">Failed to load dictionary settings: {error}</div>;
  }

  if (!draft) {
    return <div className="text-gray-500 text-sm">Loading dictionary…</div>;
  }

  return (
    <div className="mt-2 grid gap-4 overflow-x-auto">
      <div className="grid gap-2 min-w-0">
        <div className="grid gap-2 col-span-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold">Dictionary terms</span>
          </div>
          <div className="hidden md:grid grid-cols-[1fr_1fr_auto] gap-1 items-center text-xs text-gray-500" aria-hidden="true">
            <span>Term</span>
            <span className='-ml-10'>Description</span>
            <span />
          </div>
          <div className="grid gap-1">
            {draft.dictionary.map((entry, index) => (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-1 items-center min-w-0 py-2 border-b border-gray-200 dark:border-gray-600" key={`dict-${index}`}>
                <label className="block text-xs font-semibold sm:hidden">Term</label>
                <input
                  className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
                  value={entry.term}
                  placeholder="Term"
                  onChange={(e) => {
                    const next = [...draft.dictionary];
                    next[index] = { ...next[index], term: e.target.value };
                    update('dictionary', next);
                  }}
                />
                <label className="block text-xs font-semibold sm:hidden">Description</label>
                <input
                  className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
                  value={entry.description}
                  placeholder="Description"
                  onChange={(e) => {
                    const next = [...draft.dictionary];
                    next[index] = { ...next[index], description: e.target.value };
                    update('dictionary', next);
                  }}
                />
                <button
                  type="button"
                  className="w-fit border border-red-400 dark:border-red-600 text-red-700 bg-red-100 dark:bg-red-800 dark:text-red-200 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:bg-red-200 dark:hover:bg-red-700"
                  onClick={() => update('dictionary', draft.dictionary.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="border border-gray-200 dark:border-gray-700 text-gray-900 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-400 justify-self-start"
            onClick={() => update('dictionary', [...draft.dictionary, { term: '', description: '' }])}
          >
            Add new term
          </button>
        </div>

        <div className="h-px bg-gray-200 my-1 col-span-2" aria-hidden="true" />

        <div className="grid gap-2 col-span-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold">Corrections</span>
          </div>
          <div className="hidden md:grid grid-cols-[1fr_1fr_auto] gap-1 items-center text-xs text-gray-500" aria-hidden="true">
            <span>From</span>
            <span className='-ml-10'>To</span>
            <span />
          </div>
          <div className="grid gap-1">
            {draft.dictionaryCorrections.map((entry, index) => (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-1 items-center min-w-0 py-2 border-b border-gray-200 dark:border-gray-600" key={`corr-${index}`}>                <label className="block text-xs font-semibold sm:hidden">From</label>                <input
                  className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
                  value={entry.from}
                  placeholder="From"
                  onChange={(e) => {
                    const next = [...draft.dictionaryCorrections];
                    next[index] = { ...next[index], from: e.target.value };
                    update('dictionaryCorrections', next);
                  }}
                />                <label className="block text-xs font-semibold sm:hidden">To</label>                <input
                  className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 text-gray-900 rounded-lg px-2 py-1 text-sm"
                  value={entry.to}
                  placeholder="To"
                  onChange={(e) => {
                    const next = [...draft.dictionaryCorrections];
                    next[index] = { ...next[index], to: e.target.value };
                    update('dictionaryCorrections', next);
                  }}
                />
                <button
                  type="button"
                  className="border border-gray-200 dark:border-gray-700 text-gray-900 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-400"
                  onClick={() => update('dictionaryCorrections', draft.dictionaryCorrections.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="border border-gray-200 dark:border-gray-700 text-gray-900 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-400 justify-self-start"
            onClick={() => update('dictionaryCorrections', [...draft.dictionaryCorrections, { from: '', to: '' }])}
          >
            Add new correction
          </button>
        </div>

        <label className="inline-flex items-center gap-1 text-sm text-gray-900 dark:text-gray-200 col-span-2">
          <input
            className="mr-1 h-4 w-4 text-blue-600 bg-white border-gray-300 rounded dark:bg-slate-700 dark:border-gray-600"
            type="checkbox"
            checked={draft.includeDictionaryInPrompt}
            onChange={(e) => update('includeDictionaryInPrompt', e.target.checked)}
          />
          Include dictionary in LLM prompt
        </label>

        <label className="inline-flex items-center gap-1 text-sm text-gray-900 dark:text-gray-200 col-span-2">
          <input
            className="mr-1 h-4 w-4 text-blue-600 bg-white border-gray-300 rounded dark:bg-slate-700 dark:border-gray-600"
            type="checkbox"
            checked={draft.includeDictionaryDescriptions}
            onChange={(e) => update('includeDictionaryDescriptions', e.target.checked)}
          />
          Include dictionary descriptions
        </label>
      </div>

      <div className="flex justify-between items-center gap-2">
        <div />
        <div className="inline-flex items-center gap-2">
          {status === 'saved' && <span className="text-xs text-gray-500">Saved</span>}
          {status === 'error' && <span className="text-xs text-red-600">Save failed</span>}
          <button type="button" className="border border-gray-200 dark:border-gray-700 text-gray-900 dark:border-gray-600 bg-blue-500 dark:bg-blue-500 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:bg-blue-600 dark:hover:bg-blue-600 hover:border-blue-300 dark:hover:border-blue-400 text-white" onClick={save} disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save Dictionary'}
          </button>
        </div>
      </div>
    </div>
  );
}
