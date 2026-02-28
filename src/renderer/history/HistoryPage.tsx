import React, { useCallback, useEffect, useMemo, useState } from 'react';

type HistoryEntry = {
  id: number;
  sessionId: string;
  entryType: string;
  timestamp: number;
  title: string;
  preview: string;
  content: string;
  metadata: Record<string, unknown>;
};

type HistorySummary = Omit<HistoryEntry, 'content'>;

const formatTimestamp = (value: number): string => {
  return new Date(value).toLocaleString();
};

const historyTypeBadge = (type: string): string => {
  switch (type.toLowerCase()) {
    case 'assistant':
      return 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-100';
    case 'transcript':
      return 'border border-sky-400/30 bg-sky-500/20 text-sky-100';
    default:
      return 'border border-white/20 bg-white/10 text-white/80';
  }
};

const formatRelativeTime = (value: number): string => {
  const delta = Date.now() - value;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  if (delta < 604_800_000) return `${Math.round(delta / 86_400_000)}d ago`;
  return new Date(value).toLocaleDateString();
};

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistorySummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [notification, setNotification] = useState<string | null>(null);
  const [isExportingEntry, setIsExportingEntry] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const entry = await window.trayTranscriber?.getHistoryEntry?.(id);
      setSelectedEntry(entry);
    } catch (err) {
      console.error('[history] failed to load entry', err);
      setNotification('Unable to load history detail.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshEntries = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.trayTranscriber?.getHistorySummaries?.({ limit: 50, search: debouncedSearch }) ?? [];
      setEntries(list);
      if (list.length === 0) {
        setSelectedId(null);
        setSelectedEntry(null);
        return;
      }
      setSelectedId((prev) => {
        if (prev && list.some((entry) => entry.id === prev)) {
          return prev;
        }
        return list[0].id;
      });
    } catch (err) {
      console.error('[history] failed to refresh', err);
      setNotification('Unable to load history entries.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    refreshEntries();
  }, [refreshEntries]);

  useEffect(() => {
    if (selectedId !== null) {
      loadDetail(selectedId);
    } else {
      setSelectedEntry(null);
    }
  }, [selectedId, loadDetail]);

  useEffect(() => {
    const off = window.trayTranscriber?.onHistoryUpdated?.(() => refreshEntries());
    return () => off?.();
  }, [refreshEntries]);

  const handleExportAll = async () => {
    setIsExportingAll(true);
    try {
      const result = await window.trayTranscriber?.exportHistory?.();
      if (result?.path) {
        setNotification(`Exported ${result.entries.length} records to ${result.path}`);
      }
    } catch (err) {
      console.error('[history] export failed', err);
      setNotification('Failed to export history.');
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleExportEntry = async () => {
    if (!selectedEntry) return;
    setIsExportingEntry(true);
    try {
      const result = await window.trayTranscriber?.exportHistoryEntry?.(selectedEntry.id);
      if (result?.path) {
        setNotification(`Exported entry to ${result.path}`);
      }
    } catch (err) {
      console.error('[history] entry export failed', err);
      setNotification('Failed to export entry.');
    } finally {
      setIsExportingEntry(false);
    }
  };

  const handleCopy = async () => {
    if (!selectedEntry?.content) return;
    try {
      await navigator.clipboard.writeText(selectedEntry.content);
      setNotification('Copied entry text to clipboard.');
    } catch (err) {
      setNotification('Clipboard unavailable.');
    }
  };

  const selectedMetadata = useMemo<Record<string, unknown>>(() => selectedEntry?.metadata ?? {}, [selectedEntry]);
  const metadataEntries = useMemo(() => Object.entries(selectedMetadata), [selectedMetadata]);
  const assistantResponse = selectedMetadata ? selectedMetadata['assistantResponse'] : undefined;

  const typeCounts = useMemo(() => {
    return entries.reduce<Record<string, number>>((acc, entry) => {
      const key = entry.entryType || 'unknown';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  }, [entries]);

  const primaryStream = useMemo(() => {
    const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return 'None yet';
    const [type, count] = sorted[0];
    return `${type} (${count})`;
  }, [typeCounts]);

  const totalEntries = entries.length;
  const lastUpdatedTimestamp = entries.reduce((max, entry) => Math.max(max, entry.timestamp), 0);
  const hasRecentUpdate = lastUpdatedTimestamp > 0;
  const lastUpdatedLabel = hasRecentUpdate ? formatRelativeTime(lastUpdatedTimestamp) : 'No entries yet';
  const lastUpdatedPretty = hasRecentUpdate ? formatTimestamp(lastUpdatedTimestamp) : '—';

  const statCards = [
    { label: 'Total records', value: `${totalEntries}`, footnote: 'saved sessions' },
    { label: 'Last update', value: lastUpdatedLabel, footnote: lastUpdatedPretty },
    { label: 'Primary stream', value: primaryStream, footnote: 'dominant entry type' }
  ];

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/60">History</p>
          <h3 className="text-2xl font-semibold text-white">Browse past transcripts and exports</h3>
          <p className="text-sm text-white/70">
            Jump into any session, copy what you need, and export entire records from a single place.
          </p>
          {notification && <p className="text-xs text-rose-200">{notification}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/60 disabled:opacity-60"
            onClick={refreshEntries}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rounded-2xl border border-transparent bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
            onClick={handleExportAll}
            disabled={isExportingAll}
          >
            {isExportingAll ? 'Exporting…' : 'Export all'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm"
          >
            <p className="text-[10px] uppercase tracking-[0.4em] text-white/60">{card.label}</p>
            <p className="text-2xl font-semibold text-white">{card.value}</p>
            <p className="text-[11px] text-white/60">{card.footnote}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="history-search" className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">
                Search history
              </label>
              <span className="text-[11px] text-white/60">{entries.length} entries</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="history-search"
                className="flex-1 rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-sky-400 focus:outline-none"
                placeholder="Search by title, session, or assistant reply…"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <button
                type="button"
                className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70 disabled:text-white/30"
                onClick={() => setSearchTerm('')}
                disabled={!searchTerm}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-3 overflow-auto max-h-[520px] pr-1">
            {loading && <p className="text-sm text-white/70">Loading history…</p>}
            {!loading && entries.length === 0 && (
              <p className="text-sm text-white/60">No history yet. Start recording to build your archive.</p>
            )}
            {!loading &&
              entries.map((entry) => (
                <button
                  type="button"
                  key={`history-${entry.id}`}
                  className={`w-full text-left transition ${
                    entry.id === selectedId
                      ? 'rounded-2xl border border-sky-400 bg-sky-500/10 px-4 py-3 shadow-inner shadow-sky-500/30'
                      : 'rounded-2xl border border-white/10 bg-white/5 px-4 py-3 hover:border-white/30'
                  }`}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white truncate">{entry.title || entry.entryType}</p>
                      <p className="text-[11px] text-white/50">
                        {formatRelativeTime(entry.timestamp)} · {formatTimestamp(entry.timestamp)}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] uppercase tracking-[0.4em] px-2 py-1 ${historyTypeBadge(entry.entryType)}`}
                    >
                      {entry.entryType}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-white/60 leading-relaxed">{entry.preview || 'No preview available'}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/60">
                    <span className="rounded-full border border-white/20 px-2 py-1">Session {entry.sessionId.slice(-6)}</span>
                    {entry.metadata?.assistantResponse && (
                      <span className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-1 text-emerald-100">
                        Assistant reply
                      </span>
                    )}
                  </div>
                </button>
              ))}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-sm">
          {detailLoading && <p className="text-sm text-white/70">Loading entry…</p>}
          {!detailLoading && !selectedEntry && (
            <p className="text-sm text-white/60">Select a record to review its full text.</p>
          )}
          {!detailLoading && selectedEntry && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-semibold text-white">{selectedEntry.title || selectedEntry.entryType}</p>
                  <p className="text-xs text-white/60">{formatTimestamp(selectedEntry.timestamp)}</p>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-[0.4em] px-2 py-1 ${historyTypeBadge(selectedEntry.entryType)}`}
                >
                  {selectedEntry.entryType}
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="flex-1 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleCopy}
                  disabled={!selectedEntry.content}
                >
                  Copy text
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-2xl border border-transparent bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
                  onClick={handleExportEntry}
                  disabled={isExportingEntry}
                >
                  {isExportingEntry ? 'Exporting…' : 'Export entry'}
                </button>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm text-white/80 leading-relaxed whitespace-pre-wrap min-h-[200px]">
                {selectedEntry.content || 'No details available.'}
              </div>
              {/* {assistantResponse && (
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-900/60 p-3 text-sm text-emerald-50">
                  <span className="font-semibold text-emerald-100">Assistant response:</span> {String(assistantResponse)}
                </div>
              )} */}
              {metadataEntries.length > 0 && (
                <div className="space-y-2 text-xs text-white/70">
                  <p className="font-semibold text-white">Metadata</p>
                  {metadataEntries.map(([key, value]) => (
                    <div key={`meta-${key}`} className="flex items-center gap-2">
                      <span className="text-[9px] uppercase tracking-[0.4em] text-white/40">{key}</span>
                      <span className="text-xs text-white/70">{JSON.stringify(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
