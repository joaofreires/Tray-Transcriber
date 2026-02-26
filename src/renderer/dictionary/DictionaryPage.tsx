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
    return <div className="text-rose-400 text-sm">Failed to load dictionary settings: {error}</div>;
  }

  if (!draft) {
    return <div className="text-white/60 text-sm">Loading dictionary…</div>;
  }

  const sectionClasses = 'rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-sm';
  const inputClasses =
    'w-full rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-sky-400 focus:outline-none';
  const badgeText = status === 'saved' ? 'Saved' : status === 'error' ? 'Save failed' : 'Idle';
  const badgeColor =
    status === 'saved' ? 'text-emerald-300' : status === 'error' ? 'text-rose-300' : 'text-white/60';

  return (
    <div className="space-y-6 text-white">
      <section className={sectionClasses}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-white/60">Dictionary terms</p>
          <span className="text-xs text-white/50">{draft.dictionary.length} entries</span>
        </div>
        <div className="space-y-3 pt-4">
          {draft.dictionary.map((entry, index) => (
            <div key={`dict-${index}`} className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-white/60 uppercase tracking-[0.3em]">Term</span>
                <button
                  type="button"
                  className="rounded-full border border-rose-400/60 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
                  onClick={() => update('dictionary', draft.dictionary.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
              <input
                className={inputClasses}
                value={entry.term}
                placeholder="Term"
                onChange={(e) => {
                  const next = [...draft.dictionary];
                  next[index] = { ...next[index], term: e.target.value };
                  update('dictionary', next);
                }}
              />
              <span className="text-xs text-white/60 uppercase tracking-[0.3em]">Description</span>
              <input
                className={inputClasses}
                value={entry.description}
                placeholder="Description"
                onChange={(e) => {
                  const next = [...draft.dictionary];
                  next[index] = { ...next[index], description: e.target.value };
                  update('dictionary', next);
                }}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40"
          onClick={() => update('dictionary', [...draft.dictionary, { term: '', description: '' }])}
        >
          Add new term
        </button>
      </section>

      <section className={sectionClasses}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-white/60">Corrections</p>
          <span className="text-xs text-white/50">{draft.dictionaryCorrections.length} entries</span>
        </div>
        <div className="space-y-3 pt-4">
          {draft.dictionaryCorrections.map((entry, index) => (
            <div key={`corr-${index}`} className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-white/60 uppercase tracking-[0.3em]">Correction</span>
                <button
                  type="button"
                  className="rounded-full border border-rose-400/60 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
                  onClick={() => update('dictionaryCorrections', draft.dictionaryCorrections.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
              <input
                className={inputClasses}
                value={entry.from}
                placeholder="From"
                onChange={(e) => {
                  const next = [...draft.dictionaryCorrections];
                  next[index] = { ...next[index], from: e.target.value };
                  update('dictionaryCorrections', next);
                }}
              />
              <input
                className={inputClasses}
                value={entry.to}
                placeholder="To"
                onChange={(e) => {
                  const next = [...draft.dictionaryCorrections];
                  next[index] = { ...next[index], to: e.target.value };
                  update('dictionaryCorrections', next);
                }}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40"
          onClick={() => update('dictionaryCorrections', [...draft.dictionaryCorrections, { from: '', to: '' }])}
        >
          Add new correction
        </button>
      </section>

      <section className={sectionClasses}>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              className="h-4 w-4 rounded border border-white/30 bg-slate-950 text-emerald-400 focus:ring-emerald-400"
              type="checkbox"
              checked={draft.includeDictionaryInPrompt}
              onChange={(e) => update('includeDictionaryInPrompt', e.target.checked)}
            />
            Include dictionary in LLM prompt
          </label>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              className="h-4 w-4 rounded border border-white/30 bg-slate-950 text-emerald-400 focus:ring-emerald-400"
              type="checkbox"
              checked={draft.includeDictionaryDescriptions}
              onChange={(e) => update('includeDictionaryDescriptions', e.target.checked)}
            />
            Include dictionary descriptions
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className={`text-xs uppercase tracking-[0.4em] ${badgeColor}`}>{badgeText}</span>
          <button
            type="button"
            className="rounded-2xl border border-transparent bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
            onClick={save}
            disabled={status === 'saving'}
          >
            {status === 'saving' ? 'Saving…' : 'Save Dictionary'}
          </button>
        </div>
      </section>
    </div>
  );
}
