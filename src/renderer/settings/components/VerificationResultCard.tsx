import React, { useMemo, useState } from 'react';
import type { VerificationResult } from '../types';

type VerificationResultCardProps = {
  result: VerificationResult | null;
  onDismiss?: () => void;
};

function formatErrorForClipboard(result: VerificationResult): string {
  return [
    `Target: ${result.target}`,
    `Message: ${result.message}`,
    result.error ? `Error: ${result.error}` : '',
    result.details ? `Details: ${result.details}` : '',
    result.issueUrl ? `Issue URL: ${result.issueUrl}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

export default function VerificationResultCard({ result, onDismiss }: VerificationResultCardProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [openStatus, setOpenStatus] = useState<'idle' | 'failed'>('idle');

  const canCopyError = !!result && !result.ok && !!result.error;
  const canOpenIssue = !!result && !result.ok && !!String(result.issueUrl || '').trim();
  const surfaceClass = useMemo(() => {
    if (!result) return '';
    if (result.ok) return 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100';
    return 'border-rose-300/40 bg-rose-500/10 text-rose-100';
  }, [result]);

  if (!result) return null;

  const copyError = async () => {
    if (!canCopyError) return;
    try {
      await navigator.clipboard.writeText(formatErrorForClipboard(result));
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 1600);
    } catch {
      setCopyStatus('failed');
      setTimeout(() => setCopyStatus('idle'), 1600);
    }
  };

  const openIssue = async () => {
    if (!canOpenIssue) return;
    const issueUrl = String(result.issueUrl || '').trim();
    try {
      const opened = await window.trayTranscriber?.openExternalUrl?.(issueUrl);
      if (!opened) {
        window.open(issueUrl, '_blank', 'noopener,noreferrer');
      }
      setOpenStatus('idle');
    } catch {
      setOpenStatus('failed');
      setTimeout(() => setOpenStatus('idle'), 1600);
    }
  };

  return (
    <div className={`rounded-xl border px-3 py-3 text-xs ${surfaceClass}`}>
      <p className="font-semibold">{result.message}</p>
      {result.details ? <p className="mt-1 whitespace-pre-wrap opacity-90">{result.details}</p> : null}
      {!result.ok && result.error ? (
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/20 p-2 text-[11px] whitespace-pre-wrap">{result.error}</pre>
      ) : null}
      {!result.ok ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-white/30 px-2 py-1 text-[11px] hover:bg-white/15 disabled:opacity-60"
            onClick={() => void copyError()}
            disabled={!canCopyError}
          >
            Copy error
          </button>
          <button
            className="rounded-lg border border-white/30 px-2 py-1 text-[11px] hover:bg-white/15 disabled:opacity-60"
            onClick={() => void openIssue()}
            disabled={!canOpenIssue}
          >
            Open GitHub issue
          </button>
          {onDismiss ? (
            <button
              className="rounded-lg border border-white/30 px-2 py-1 text-[11px] hover:bg-white/15"
              onClick={onDismiss}
            >
              Dismiss error
            </button>
          ) : null}
          {copyStatus === 'copied' ? <span className="self-center text-[11px]">Copied</span> : null}
          {copyStatus === 'failed' ? <span className="self-center text-[11px]">Copy failed</span> : null}
          {openStatus === 'failed' ? <span className="self-center text-[11px]">Open failed</span> : null}
        </div>
      ) : null}
    </div>
  );
}
