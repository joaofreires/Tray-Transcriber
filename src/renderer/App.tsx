import React, { useEffect, useMemo, useRef, useState } from 'react';
import SettingsPage from './settings/SettingsPage';
import DictionaryPage from './dictionary/DictionaryPage';
import LLMAssistantPage from './assistant/LLMAssistantPage';
import ThemeToggle from './components/ThemeToggle';
import { useThemeMode } from './theme/useThemeMode';

type AppTab = {
  id: 'dashboard' | 'dictionary' | 'llm-assistant' | 'history' | 'agents' | 'integrations' | 'settings';
  title: string;
  subtitle: string;
  status?: 'ready' | 'coming-soon';
};

const APP_TABS: AppTab[] = [
  { id: 'dashboard', title: 'Workspace', subtitle: 'Record, transcribe, and assist', status: 'ready' },
  { id: 'dictionary', title: 'Dictionary', subtitle: 'Terms and correction mappings', status: 'ready' },
  { id: 'llm-assistant', title: 'LLM Assistant', subtitle: 'AI assistant & shortcuts', status: 'ready' },
  { id: 'history', title: 'History', subtitle: 'Past transcripts and exports', status: 'coming-soon' },
  { id: 'agents', title: 'AI Agents', subtitle: 'Prompt flows and task assistants', status: 'coming-soon' },
  { id: 'integrations', title: 'Integrations', subtitle: 'Connect external APIs and tools', status: 'coming-soon' },
  { id: 'settings', title: 'Settings', subtitle: 'Device, model and app preferences', status: 'ready' }
];

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
    const unsub = window.trayTranscriber?.onToggleRecording?.(({ isRecording: nextRecordingState }: { isRecording: boolean }) => {
      if (nextRecordingState) {
        startRecording('external');
      } else {
        stopRecording('external');
      }
    });
    return () => { unsub?.(); };
  }, []);

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
    <div className="min-h-screen flex flex-col p-6 max-w-[1200px] mx-auto bg-slate-50 dark:bg-slate-900 text-gray-900 dark:text-gray-100">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-5 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-slate-800 shadow-lg">
        <div className="flex items-center gap-3 mb-3 md:mb-0">
          {/* drawer button visible on small screens */}
          <button
            type="button"
            className="md:hidden p-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="w-10 h-10 rounded-lg grid place-items-center font-bold text-white bg-gradient-to-br from-cyan-400 to-blue-600">TT</div>
          <div>
            <div className="text-base font-bold text-gray-900 dark:text-gray-100">Tray Transcriber</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Record · Transcribe · Assist</div>
          </div>
        </div>

        <div className="inline-flex items-center gap-2">
          <ThemeToggle value={mode} onChange={setMode} />
        </div>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] gap-5">
        {!drawerOpen && (
          <aside className="hidden md:block self-start md:sticky md:top-5 bg-white/95 dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-lg w-full md:w-auto">
            <h2 className="mb-2 text-xs tracking-widest uppercase text-gray-500 dark:text-gray-400">Navigation</h2>
            <nav className="grid gap-1" aria-label="Main tabs">
            {APP_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`border border-transparent bg-transparent text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 flex items-center justify-between gap-2 hover:border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-slate-700 text-left ${
                  activeTab === tab.id ? 'border-blue-300 bg-blue-100 dark:border-blue-400 dark:bg-blue-900' : ''
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <div>
                  <div className="text-sm font-semibold">{tab.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{tab.subtitle}</div>
                </div>
                {tab.status === 'coming-soon' && (
                  <span className="text-xs text-gray-500 border border-gray-200 dark:border-gray-700 bg-gray-100 rounded-full px-2 py-1 whitespace-nowrap">
                    Soon
                  </span>
                )}
              </button>
            ))}
          </nav>
          </aside>
        )}
        {/* drawer overlay on small screens */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={closeDrawer}
            />
            <aside className="relative bg-white/95 dark:bg-slate-800 w-64 p-4 border border-gray-200 dark:border-gray-700 shadow-lg">
              <button
                type="button"
                className="absolute top-2 right-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md p-1"
                onClick={closeDrawer}
                aria-label="Close navigation"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h2 className="mb-2 text-xs tracking-widest uppercase text-gray-500 dark:text-gray-400">Navigation</h2>
              <nav className="grid gap-1" aria-label="Main tabs">
                {APP_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`border border-transparent bg-transparent text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 flex items-center justify-between gap-2 hover:border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-slate-700 text-left ${
                      activeTab === tab.id ? 'border-blue-300 bg-blue-100 dark:border-blue-400 dark:bg-blue-900' : ''
                    }`}
                    onClick={() => {
                      setActiveTab(tab.id);
                      closeDrawer();
                    }}
                  >
                    <div>
                      <div className="text-sm font-semibold">{tab.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{tab.subtitle}</div>
                    </div>
                    {tab.status === 'coming-soon' && (
                      <span className="text-xs text-gray-500 border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-slate-700 rounded-full px-2 py-1 whitespace-nowrap">
                        Soon
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        <section className="content-area mt-4 md:mt-0">
          {currentTab.id === 'dashboard' && (
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
          )}
          {currentTab.id === 'dictionary' && (
            <section className="bg-white/95 dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-lg min-h-[360px]">
              <div className="flex justify-between items-center gap-2 mb-2">
                <h2 className="text-gray-900 dark:text-gray-100">Dictionary</h2>
                <span className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-slate-700 rounded-full px-2 py-1 whitespace-nowrap text-gray-900 border-blue-200 bg-blue-100">
                  Config
                </span>
              </div>
              <p className="mt-0 mb-4 text-sm text-gray-500 dark:text-gray-400">Manage dictionary terms and correction mappings used across transcriptions.</p>
              <DictionaryPage />
            </section>
          )}
          {currentTab.id === 'settings' && (
            <section className="bg-white/95 dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-lg min-h-[360px]">
              <div className="flex justify-between items-center gap-2 mb-2">
                <h2 className="text-gray-900 dark:text-gray-100">Settings</h2>
                <span className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-slate-700 rounded-full px-2 py-1 whitespace-nowrap text-gray-900 border-blue-200 bg-blue-100">
                  Config
                </span>
              </div>
              <p className="mt-0 mb-4 text-sm text-gray-500 dark:text-gray-400">
                Adjust app behavior, providers and app preferences.
              </p>
              <SettingsPage />
            </section>
          )}
          {currentTab.id === 'llm-assistant' && (
            <section className="bg-white/95 dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-lg min-h-[360px]">
              <div className="flex justify-between items-center gap-2 mb-2">
                <h2 className="text-gray-900 dark:text-gray-100">LLM Assistant</h2>
                <span className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-slate-700 rounded-full px-2 py-1 whitespace-nowrap text-gray-900 border-blue-200 bg-blue-100">
                  Config
                </span>
              </div>
              <p className="mt-0 mb-4 text-sm text-gray-500 dark:text-gray-400">
                Configure AI assistant trigger words and keyboard shortcuts.
              </p>
              <LLMAssistantPage />
            </section>
          )}
          {currentTab.id !== 'dashboard' && currentTab.id !== 'dictionary' && currentTab.id !== 'settings' && currentTab.id !== 'llm-assistant' && (
            <ComingSoonView title={currentTab.title} subtitle={currentTab.subtitle} />
          )}
        </section>
      </main>
    </div>
  );
}
