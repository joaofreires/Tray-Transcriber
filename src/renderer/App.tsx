import React, { useEffect, useMemo, useRef, useState } from 'react';
import SettingsPage from './settings/SettingsPage';
import DictionaryPage from './dictionary/DictionaryPage';
import LLMAssistantPage from './assistant/LLMAssistantPage';
import ShortcutsPage from './shortcuts/ShortcutsPage';
import HistoryPage from './history/HistoryPage';
import ThemeToggle from './components/ThemeToggle';
import { useThemeMode } from './theme/useThemeMode';

type AppTab = {
  id: 'dashboard' | 'dictionary' | 'llm-assistant' | 'shortcuts' | 'history' | 'agents' | 'integrations' | 'settings';
  title: string;
  subtitle: string;
  status?: 'ready' | 'coming-soon';
};

const APP_TABS: AppTab[] = [
  { id: 'dashboard', title: 'Workspace', subtitle: 'Record, transcribe, and assist', status: 'ready' },
  { id: 'dictionary', title: 'Dictionary', subtitle: 'Terms and correction mappings', status: 'ready' },
  { id: 'llm-assistant', title: 'LLM Assistant', subtitle: 'AI assistant model settings', status: 'ready' },
  { id: 'shortcuts', title: 'Shortcuts', subtitle: 'Hotkeys, pipelines, and OCR-ready actions', status: 'ready' },
  { id: 'history', title: 'History', subtitle: 'Past transcripts and exports', status: 'ready' },
  { id: 'agents', title: 'AI Agents', subtitle: 'Prompt flows and task assistants', status: 'coming-soon' },
  { id: 'integrations', title: 'Integrations', subtitle: 'Connect external APIs and tools', status: 'coming-soon' },
  { id: 'settings', title: 'Settings', subtitle: 'Device, model and app preferences', status: 'ready' }
];

type TabSurfaceProps = React.PropsWithChildren<{
  title: string;
  description?: string;
  headerExtras?: React.ReactNode;
}>;

function TabSurface({ title, description, headerExtras, children }: TabSurfaceProps) {
  return (
    <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/60">{title}</p>
          {description && <p className="text-sm text-white/60">{description}</p>}
        </div>
        {headerExtras && <div className="flex flex-wrap gap-2">{headerExtras}</div>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

type NavItemProps = {
  tab: AppTab;
  isActive: boolean;
  onClick: () => void;
};

function NavItem({ tab, isActive, onClick }: NavItemProps) {
  const baseClasses =
    'group flex flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition duration-200';
  const activeStyles = 'border-sky-400/80 bg-sky-500/10 shadow-[0_0_30px_rgba(14,165,233,0.2)]';
  const idleStyles = 'border-white/10 bg-white/5 hover:border-white/30';

  return (
    <button
      type="button"
      className={`${baseClasses} ${isActive ? activeStyles : idleStyles}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{tab.title}</p>
        {tab.status === 'coming-soon' && (
          <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-white/60">
            Soon
          </span>
        )}
      </div>
      <p className="text-[11px] text-white/60">{tab.subtitle}</p>
    </button>
  );
}

type NavListProps = {
  activeTab: AppTab['id'];
  onTabSelect: (id: AppTab['id']) => void;
  onSelectClose?: () => void;
};

function NavList({ activeTab, onTabSelect, onSelectClose }: NavListProps) {
  return (
    <nav className="grid gap-3" aria-label="Main navigation">
      {APP_TABS.map((tab) => (
        <NavItem
          key={tab.id}
          tab={tab}
          isActive={activeTab === tab.id}
          onClick={() => {
            onTabSelect(tab.id);
            onSelectClose?.();
          }}
        />
      ))}
    </nav>
  );
}

type DashboardViewProps = {
  isRecording: boolean;
  startBusy: boolean;
  stopBusy: boolean;
  copyBusy: boolean;
  isTranscribing: boolean;
  transcript: string;
  recorderError: string | null;
  onStartRecording: () => Promise<void>;
  onStopRecording: () => void;
  onCopyTranscript: () => Promise<void>;
};

function DashboardView({
  isRecording,
  startBusy,
  stopBusy,
  copyBusy,
  isTranscribing,
  transcript,
  recorderError,
  onStartRecording,
  onStopRecording,
  onCopyTranscript
}: DashboardViewProps) {
  return (
    <section className="bg-white/95 dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-lg min-h-[360px]">
      <div className="flex justify-between items-center gap-2 mb-2">
        <h2>Recorder</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 dark:border-gray-600 bg-gray-100 dark:bg-slate-700 rounded-full px-2 py-1 whitespace-nowrap">
          {isRecording ? 'Recording…' : 'Ready'}
        </span>
      </div>
      <p className="mt-0 mb-4 text-sm text-gray-500 dark:text-gray-400">Start capturing audio from the tray and generate a transcript in real time.</p>

      <div className="flex flex-wrap gap-2">
        <button
          id="start-record"
          className="border border-gray-200 dark:border-gray-700 text-gray-900 bg-blue-500 dark:bg-blue-600 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:bg-blue-600 dark:hover:bg-blue-700 hover:border-blue-300 text-white"
          type="button"
          onClick={onStartRecording}
          disabled={isRecording}
        >
          {isRecording ? 'Starting…' : 'Start Recording'}
        </button>
        <button
          id="stop-record"
          className="border border-gray-200 dark:border-gray-700 text-gray-900 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-400"
          type="button"
          onClick={onStopRecording}
          disabled={!isRecording}
        >
          {stopBusy ? 'Stopping…' : 'Stop'}
        </button>
        <button
          className="border border-gray-200 dark:border-gray-700 text-gray-900 bg-white dark:bg-slate-700 dark:border-gray-600 dark:text-gray-100 rounded-lg text-sm font-semibold px-3 py-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-400"
          type="button"
          onClick={onCopyTranscript}
          disabled={!transcript.trim() || copyBusy}
        >
          {copyBusy ? 'Copying…' : 'Copy Text'}
        </button>
      </div>

      <div className="mt-4 border border-gray-200 dark:border-gray-700 dark:border-gray-600 bg-gray-100 dark:bg-slate-700 rounded-lg min-h-[140px] max-h-[340px] overflow-auto p-3 text-sm whitespace-pre-wrap" aria-live="polite">
        {transcript || (isTranscribing ? 'Transcribing…' : 'Transcript will appear here after you stop recording.')}
      </div>

      {recorderError && <p className="mt-2 text-red-600 text-sm">{recorderError}</p>}
    </section>
  );
}

function ComingSoonView({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="bg-white/95 dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-lg min-h-[360px]">
      <div className="flex justify-between items-center gap-2 mb-2">
        <h2>{title}</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 dark:border-gray-600 bg-gray-100 dark:bg-slate-700 rounded-full px-2 py-1 whitespace-nowrap">Coming Soon</span>
      </div>
      <p className="mt-0 mb-4 text-sm text-gray-500">{subtitle}</p>
      <p className="text-sm text-gray-500 max-w-prose">
        This space is intentionally prepared for future capabilities so new modules can be added without changing the navigation structure.
      </p>
    </section>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab['id']>('dashboard');
  const { mode, setMode, resolvedTheme } = useThemeMode();
  const [windowType, setWindowType] = useState<'main' | 'config' | 'unknown'>('unknown');

  // when main process toggles the busy cursor, apply it globally
  useEffect(() => {
    const off = window.trayTranscriber?.onCursorBusy?.((flag: boolean) => {
      document.body.style.cursor = flag ? 'wait' : 'default';
    });
    return off;
  }, []);
  const [isRecording, setIsRecording] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [recorderError, setRecorderError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const sessionOriginRef = useRef<'ui' | 'external'>('ui');
  const startLockRef = useRef(false);
  const stopLockRef = useRef(false);
  const copyLockRef = useRef(false);

  useEffect(() => {
    const unsub = window.trayTranscriber?.onTranscriptReady?.((payload: { text?: string }) => {
      const text = String(payload?.text ?? '').trim();
      setTranscript(text);
      setIsTranscribing(false);
      setRecorderError(null);
    });
    return () => { unsub?.(); };
  }, []);

  useEffect(() => {
    let active = true;
    window.trayTranscriber?.getWindowType?.().then((type) => {
      if (!active) return;
      setWindowType(type);
    }).catch(() => {
      if (!active) return;
      setWindowType('unknown');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (windowType !== 'main') return;
    const unsub = window.trayTranscriber?.onToggleRecording?.(({ isRecording: nextRecordingState }: { isRecording: boolean }) => {
      if (nextRecordingState) {
        startRecording('external');
      } else {
        stopRecording('external');
      }
    });
    return () => { unsub?.(); };
  }, [windowType]);

  const startRecording = async (origin: 'ui' | 'external' = 'ui') => {
    if (recorderRef.current || startLockRef.current) return;
    startLockRef.current = true;
    setStartBusy(true);

    setRecorderError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let options: MediaRecorderOptions = { mimeType: 'audio/webm;codecs=opus' };

      if (!MediaRecorder.isTypeSupported(options.mimeType || '')) {
        options = {};
      }

      const recorder = new MediaRecorder(stream, options);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          chunksRef.current = [];
          const arrayBuffer = await blob.arrayBuffer();
          setIsTranscribing(true);

          window.trayTranscriber?.notifyRecordingComplete?.({
            buffer: Array.from(new Uint8Array(arrayBuffer)),
            extension: 'webm',
            size: blob.size,
            durationMs: 0,
            uiSession: sessionOriginRef.current === 'ui'
          });
        } catch (error) {
          setRecorderError(`Failed to process recording: ${String(error)}`);
          setIsTranscribing(false);
        } finally {
          stopLockRef.current = false;
          setStopBusy(false);
        }
      };

      recorder.start(200);
      recorderRef.current = recorder;
      sessionOriginRef.current = origin;
      setIsRecording(true);

      if (origin === 'ui') {
        window.trayTranscriber?.setRecordingState?.({ isRecording: true });
        window.trayTranscriber?.updateTrayIcon?.();
      }
    } catch (error) {
      setRecorderError(`Unable to access microphone: ${String(error)}`);
      if (origin === 'ui') {
        window.trayTranscriber?.setRecordingState?.({ isRecording: false });
      }
    } finally {
      startLockRef.current = false;
      setStartBusy(false);
    }
  };

  const stopRecording = (origin: 'ui' | 'external' = 'ui') => {
    if (stopLockRef.current) return;
    stopLockRef.current = true;
    setStopBusy(true);

    const recorder = recorderRef.current;
    if (!recorder) {
      stopLockRef.current = false;
      setStopBusy(false);
      return;
    }

    if (recorder.state === 'recording') {
      recorder.stop();
    }

    recorder.stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    setIsRecording(false);

    if (origin === 'ui') {
      window.trayTranscriber?.setRecordingState?.({ isRecording: false });
    }
  };

  const copyTranscript = async () => {
    if (copyLockRef.current) return;
    if (!transcript.trim()) return;

    copyLockRef.current = true;
    setCopyBusy(true);

    try {
      await navigator.clipboard.writeText(transcript);
      setRecorderError(null);
    } catch (error) {
      setRecorderError(`Failed to copy transcript: ${String(error)}`);
    } finally {
      copyLockRef.current = false;
      setCopyBusy(false);
    }
  };

  const currentTab = useMemo(
    () => APP_TABS.find((tab) => tab.id === activeTab) ?? APP_TABS[0],
    [activeTab]
  );

  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="relative min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-950 to-slate-900 opacity-90" />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
        <header className="relative rounded-[32px] border border-white/10 bg-slate-900/70 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.8)] backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-white md:hidden"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open navigation"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 text-lg font-bold text-slate-950">
                TT
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Tray Transcriber</p>
                <p className="text-xs text-white/60">Record · Transcribe · Assist</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-[0.4em] text-white/70">
                {isRecording ? 'Recording' : 'Idle'}
              </div>
              <ThemeToggle value={mode} onChange={setMode} />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">All your conversations, surfaced.</h1>
            <p className="text-sm text-white/70">
              Keep your transcripts, assistant replies, and integrations in one organized workspace.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/60"
                onClick={() => setActiveTab('dashboard')}
              >
                Go to Workspace
              </button>
              <button
                type="button"
                className="rounded-2xl border border-transparent bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                onClick={() => setActiveTab('history')}
              >
                Review History
              </button>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden md:block">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/60">Navigation</p>
              <p className="text-[11px] text-white/50">Pick a workspace</p>
              <div className="mt-4">
                <NavList activeTab={activeTab} onTabSelect={setActiveTab} />
              </div>
            </div>
          </aside>

          <section className="flex flex-col gap-6">
            {currentTab.id === 'dashboard' && (
              <TabSurface title="Workspace" description="Record, transcribe, and assist">
                <DashboardView
                  isRecording={isRecording}
                  startBusy={startBusy}
                  stopBusy={stopBusy}
                  copyBusy={copyBusy}
                  isTranscribing={isTranscribing}
                  transcript={transcript}
                  recorderError={recorderError}
                  onStartRecording={startRecording}
                  onStopRecording={stopRecording}
                  onCopyTranscript={copyTranscript}
                />
              </TabSurface>
            )}
            {currentTab.id === 'dictionary' && (
              <TabSurface title="Dictionary" description="Terms and correction mappings">
                <DictionaryPage />
              </TabSurface>
            )}
            {currentTab.id === 'settings' && (
              <TabSurface title="Settings" description="Device, model, and app preferences">
                <SettingsPage />
              </TabSurface>
            )}
            {currentTab.id === 'llm-assistant' && (
              <TabSurface title="LLM Assistant" description="AI assistant model behaviors">
                <LLMAssistantPage />
              </TabSurface>
            )}
            {currentTab.id === 'shortcuts' && (
              <TabSurface title="Shortcuts" description="Hotkeys, pipelines, and OCR-ready actions">
                <ShortcutsPage />
              </TabSurface>
            )}
            {currentTab.id === 'history' && <HistoryPage />}
            {['agents', 'integrations'].includes(currentTab.id) && (
              <ComingSoonView title={currentTab.title} subtitle={currentTab.subtitle} />
            )}
          </section>
        </div>

        {drawerOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-slate-950/80" onClick={closeDrawer} />
            <aside className="relative z-10 w-72 space-y-4 rounded-[28px] border border-white/10 bg-slate-900/90 p-5 shadow-2xl">
              <button
                type="button"
                className="ml-auto inline-flex rounded-full border border-white/20 p-2 text-white transition hover:border-white/40"
                onClick={closeDrawer}
                aria-label="Close navigation"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/60">Navigation</p>
              <NavList activeTab={activeTab} onTabSelect={setActiveTab} onSelectClose={closeDrawer} />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
