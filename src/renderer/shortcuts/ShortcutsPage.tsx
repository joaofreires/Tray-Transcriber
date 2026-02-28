import React, { useEffect, useMemo, useRef, useState } from 'react';
import HotkeyRecorderField from '../components/HotkeyRecorderField';
import ToggleSwitch from '../components/ToggleSwitch';

type AssistantInputMode = 'prompt_plus_selection' | 'prompt_only';
type TextOutputMode = 'paste_then_clipboard' | 'clipboard_only';
type ScreenshotMode = 'region' | 'active_window' | 'full_screen' | 'choose_each_time';
type OcrMode = 'llm_vision' | 'local_tesseract';

type ShortcutStep =
  | { stepType: 'record_toggle' }
  | { stepType: 'record_press_to_talk' }
  | { stepType: 'record_hold_to_talk'; holdStopOnModifierRelease?: boolean }
  | { stepType: 'screenshot_capture'; mode: ScreenshotMode }
  | { stepType: 'ocr_extract'; providerId?: string; languageHint?: string }
  | { stepType: 'assistant_prompt'; prompt: string; inputMode?: AssistantInputMode }
  | { stepType: 'output_text'; outputMode?: TextOutputMode };

type ShortcutDefinition = {
  id: string;
  label: string;
  enabled: boolean;
  shortcut: string;
  steps: ShortcutStep[];
};

type ShortcutDefaults = {
  assistantInputMode: AssistantInputMode;
  textOutputMode: TextOutputMode;
  ocrProviderId: string;
};

type ShortcutConfig = {
  shortcutsVersion: number;
  shortcutDefaults: ShortcutDefaults;
  shortcuts: ShortcutDefinition[];
};

type SaveConfigResult =
  | {
      ok: true;
      warnings?: Array<{
        code: 'SHORTCUT_REGISTER_FAILED' | 'SHORTCUT_RESERVED_OR_UNAVAILABLE';
        message: string;
        shortcutId?: string;
        field?: 'shortcut';
      }>;
    }
  | { ok: false; code: string; errors: Array<{ code: string; message: string }> };

type TemplateOption = {
  id: string;
  label: string;
};

const TEMPLATE_OPTIONS: TemplateOption[] = [
  { id: 'assistant_prompt', label: 'Assistant Prompt' },
  { id: 'record_toggle', label: 'Recording Toggle' },
  { id: 'record_press_to_talk', label: 'Press-to-Talk' },
  { id: 'record_hold_to_talk', label: 'Hold-to-Talk' },
  { id: 'screenshot_ocr_output', label: 'Screenshot OCR Output' }
];

const STEP_TYPE_LABELS: Record<ShortcutStep['stepType'], string> = {
  record_toggle: 'Record Toggle',
  record_press_to_talk: 'Record Press-to-Talk',
  record_hold_to_talk: 'Record Hold-to-Talk',
  screenshot_capture: 'Screenshot Capture',
  ocr_extract: 'OCR Extract',
  assistant_prompt: 'Assistant Prompt',
  output_text: 'Output Text'
};

const SCREENSHOT_MODE_LABELS: Record<ScreenshotMode, string> = {
  region: 'Region',
  active_window: 'Active Window',
  full_screen: 'Full Screen',
  choose_each_time: 'Ask Every Time'
};

const INPUT_MODE_LABELS: Record<AssistantInputMode, string> = {
  prompt_plus_selection: 'Prompt + Selected Text',
  prompt_only: 'Prompt Only'
};

const OUTPUT_MODE_LABELS: Record<TextOutputMode, string> = {
  paste_then_clipboard: 'Paste Then Keep in Clipboard',
  clipboard_only: 'Clipboard Only'
};

const OCR_MODE_LABELS: Record<OcrMode, string> = {
  llm_vision: 'LLM Vision',
  local_tesseract: 'Local Tesseract'
};

const DEFAULT_SHORTCUTS: ShortcutConfig = {
  shortcutsVersion: 2,
  shortcutDefaults: {
    assistantInputMode: 'prompt_plus_selection',
    textOutputMode: 'paste_then_clipboard',
    ocrProviderId: ''
  },
  shortcuts: [
    {
      id: 'recording-main',
      label: 'Recording',
      enabled: true,
      shortcut: 'CommandOrControl+Shift+Space',
      steps: [{ stepType: 'record_hold_to_talk', holdStopOnModifierRelease: false }]
    }
  ]
};

const inputClasses =
  'w-full rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-sky-400 focus:outline-none';
const selectClasses = `${inputClasses} bg-slate-950/60`;
const textAreaClasses = `${inputClasses} min-h-[120px] resize-none`;

function makeShortcutId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function normalizeOcrMode(value: unknown): OcrMode {
  return value === 'local_tesseract' ? 'local_tesseract' : 'llm_vision';
}

function resolveActiveProviderId(mode: OcrMode): string {
  return mode === 'local_tesseract' ? 'local_tesseract' : 'llm_vision';
}

function normalizeProviderId(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function isProviderCompatible(providerId: string, mode: OcrMode): boolean {
  const normalized = normalizeProviderId(providerId);
  if (!normalized) return true;
  const activeProviderId = resolveActiveProviderId(mode);
  return normalized === activeProviderId;
}

function normalizeShortcutStep(raw: any): ShortcutStep | null {
  const stepType = String(raw?.stepType ?? '').trim();
  if (!stepType) return null;

  if (stepType === 'record_toggle') return { stepType };
  if (stepType === 'record_press_to_talk') return { stepType };
  if (stepType === 'record_hold_to_talk') {
    return { stepType, holdStopOnModifierRelease: !!raw?.holdStopOnModifierRelease };
  }
  if (stepType === 'screenshot_capture') {
    const mode =
      raw?.mode === 'active_window' || raw?.mode === 'full_screen' || raw?.mode === 'choose_each_time'
        ? raw.mode
        : 'region';
    return { stepType, mode };
  }
  if (stepType === 'ocr_extract') {
    return {
      stepType,
      providerId: normalizeProviderId(raw?.providerId),
      languageHint: String(raw?.languageHint ?? '').trim()
    };
  }
  if (stepType === 'assistant_prompt') {
    return {
      stepType,
      prompt: String(raw?.prompt ?? '').trim(),
      inputMode: raw?.inputMode === 'prompt_only' ? 'prompt_only' : 'prompt_plus_selection'
    };
  }
  if (stepType === 'output_text') {
    return {
      stepType,
      outputMode: raw?.outputMode === 'clipboard_only' ? 'clipboard_only' : 'paste_then_clipboard'
    };
  }

  return null;
}

function normalizeShortcut(raw: any, index: number): ShortcutDefinition {
  return {
    id: String(raw?.id ?? '').trim() || `shortcut-${index + 1}`,
    label: String(raw?.label ?? '').trim() || `Shortcut ${index + 1}`,
    enabled: raw?.enabled !== false,
    shortcut: String(raw?.shortcut ?? '').trim(),
    steps: Array.isArray(raw?.steps)
      ? raw.steps
          .map((step: any) => normalizeShortcutStep(step))
          .filter((step: ShortcutStep | null): step is ShortcutStep => !!step)
      : []
  };
}

function normalizeShortcutConfig(raw: any): ShortcutConfig {
  return {
    shortcutsVersion: Number(raw?.shortcutsVersion) || 2,
    shortcutDefaults: {
      assistantInputMode: raw?.shortcutDefaults?.assistantInputMode === 'prompt_only' ? 'prompt_only' : 'prompt_plus_selection',
      textOutputMode: raw?.shortcutDefaults?.textOutputMode === 'clipboard_only' ? 'clipboard_only' : 'paste_then_clipboard',
      ocrProviderId: normalizeProviderId(raw?.shortcutDefaults?.ocrProviderId)
    },
    shortcuts: Array.isArray(raw?.shortcuts)
      ? raw.shortcuts.map((entry: any, index: number) => normalizeShortcut(entry, index))
      : DEFAULT_SHORTCUTS.shortcuts
  };
}

function createStepTemplate(stepType: ShortcutStep['stepType']): ShortcutStep {
  if (stepType === 'record_toggle') return { stepType };
  if (stepType === 'record_press_to_talk') return { stepType };
  if (stepType === 'record_hold_to_talk') return { stepType, holdStopOnModifierRelease: false };
  if (stepType === 'screenshot_capture') return { stepType, mode: 'region' };
  if (stepType === 'ocr_extract') return { stepType, providerId: '', languageHint: '' };
  if (stepType === 'assistant_prompt') return { stepType, prompt: '', inputMode: 'prompt_plus_selection' };
  return { stepType: 'output_text', outputMode: 'paste_then_clipboard' };
}

function createShortcutTemplate(templateId: string): ShortcutDefinition {
  if (templateId === 'record_toggle') {
    return {
      id: makeShortcutId('record-toggle'),
      label: 'Record Toggle',
      enabled: true,
      shortcut: '',
      steps: [{ stepType: 'record_toggle' }]
    };
  }

  if (templateId === 'record_press_to_talk') {
    return {
      id: makeShortcutId('record-ptt'),
      label: 'Record Press-to-Talk',
      enabled: true,
      shortcut: '',
      steps: [{ stepType: 'record_press_to_talk' }]
    };
  }

  if (templateId === 'record_hold_to_talk') {
    return {
      id: makeShortcutId('record-htt'),
      label: 'Record Hold-to-Talk',
      enabled: true,
      shortcut: '',
      steps: [{ stepType: 'record_hold_to_talk', holdStopOnModifierRelease: false }]
    };
  }

  if (templateId === 'assistant_prompt') {
    return {
      id: makeShortcutId('assistant'),
      label: 'Assistant Prompt',
      enabled: true,
      shortcut: '',
      steps: [
        { stepType: 'assistant_prompt', prompt: '', inputMode: 'prompt_plus_selection' },
        { stepType: 'output_text', outputMode: 'paste_then_clipboard' }
      ]
    };
  }

  if (templateId === 'screenshot_ocr_output') {
    return {
      id: makeShortcutId('screenshot-ocr'),
      label: 'Screenshot OCR',
      enabled: true,
      shortcut: '',
      steps: [
        { stepType: 'screenshot_capture', mode: 'choose_each_time' },
        { stepType: 'ocr_extract', providerId: '', languageHint: '' },
        { stepType: 'output_text', outputMode: 'paste_then_clipboard' }
      ]
    };
  }

  return {
    id: makeShortcutId('shortcut'),
    label: 'New Shortcut',
    enabled: true,
    shortcut: '',
    steps: [{ stepType: 'assistant_prompt', prompt: '', inputMode: 'prompt_plus_selection' }, { stepType: 'output_text', outputMode: 'paste_then_clipboard' }]
  };
}

function PanelField({ label, children, className }: React.PropsWithChildren<{ label: string; className?: string }>) {
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

export default function ShortcutsPage() {
  const [baseConfig, setBaseConfig] = useState<any>(null);
  const [draft, setDraft] = useState<ShortcutConfig | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saveWarnings, setSaveWarnings] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('assistant_prompt');
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const splitButtonRef = useRef<HTMLDivElement | null>(null);

  const selectedTemplate = useMemo(
    () => TEMPLATE_OPTIONS.find((option) => option.id === selectedTemplateId) ?? TEMPLATE_OPTIONS[0],
    [selectedTemplateId]
  );
  const activeOcrMode = useMemo(() => normalizeOcrMode(baseConfig?.ocr?.mode), [baseConfig]);
  const activeOcrProviderId = useMemo(() => resolveActiveProviderId(activeOcrMode), [activeOcrMode]);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await window.trayTranscriber?.getConfig?.();
        setBaseConfig(cfg ?? {});
        setDraft(normalizeShortcutConfig(cfg ?? {}));
      } catch (err) {
        setLoadError(String(err));
      }
    })();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!splitButtonRef.current) return;
      if (splitButtonRef.current.contains(event.target as Node)) return;
      setTemplateMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  if (loadError) return <div className="text-rose-400 text-sm">Failed to load shortcuts: {loadError}</div>;
  if (!draft) return <div className="text-white/60 text-sm">Loading shortcuts…</div>;

  const updateDraft = (next: ShortcutConfig) => {
    setDraft(next);
    setStatus('idle');
    setValidationErrors([]);
    setSaveWarnings([]);
  };

  const updateShortcut = (index: number, updater: (value: ShortcutDefinition) => ShortcutDefinition) => {
    const nextShortcuts = [...draft.shortcuts];
    nextShortcuts[index] = updater(nextShortcuts[index]);
    updateDraft({ ...draft, shortcuts: nextShortcuts });
  };

  const removeShortcut = (index: number) => {
    updateDraft({
      ...draft,
      shortcuts: draft.shortcuts.filter((_, idx) => idx !== index)
    });
  };

  const duplicateShortcut = (index: number) => {
    const source = draft.shortcuts[index];
    const clone: ShortcutDefinition = {
      ...source,
      id: makeShortcutId('shortcut-copy'),
      label: `${source.label} Copy`,
      steps: source.steps.map((step) => ({ ...step } as ShortcutStep))
    };
    const next = [...draft.shortcuts];
    next.splice(index + 1, 0, clone);
    updateDraft({ ...draft, shortcuts: next });
  };

  const moveShortcut = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.shortcuts.length) return;
    const next = [...draft.shortcuts];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    updateDraft({ ...draft, shortcuts: next });
  };

  const updateStep = (shortcutIndex: number, stepIndex: number, updater: (step: ShortcutStep) => ShortcutStep) => {
    updateShortcut(shortcutIndex, (shortcut) => {
      const steps = [...shortcut.steps];
      steps[stepIndex] = updater(steps[stepIndex]);
      return { ...shortcut, steps };
    });
  };

  const removeStep = (shortcutIndex: number, stepIndex: number) => {
    updateShortcut(shortcutIndex, (shortcut) => ({
      ...shortcut,
      steps: shortcut.steps.filter((_, index) => index !== stepIndex)
    }));
  };

  const moveStep = (shortcutIndex: number, stepIndex: number, direction: -1 | 1) => {
    updateShortcut(shortcutIndex, (shortcut) => {
      const target = stepIndex + direction;
      if (target < 0 || target >= shortcut.steps.length) return shortcut;
      const steps = [...shortcut.steps];
      const [item] = steps.splice(stepIndex, 1);
      steps.splice(target, 0, item);
      return { ...shortcut, steps };
    });
  };

  const addStep = (shortcutIndex: number, stepType: ShortcutStep['stepType']) => {
    updateShortcut(shortcutIndex, (shortcut) => ({
      ...shortcut,
      steps: [...shortcut.steps, createStepTemplate(stepType)]
    }));
  };

  const addTemplateShortcut = (templateId: string) => {
    updateDraft({
      ...draft,
      shortcuts: [...draft.shortcuts, createShortcutTemplate(templateId)]
    });
  };

  const save = async () => {
    setStatus('saving');
    setValidationErrors([]);
    setSaveWarnings([]);

    try {
      const payload = {
        ...(baseConfig ?? {}),
        shortcutsVersion: draft.shortcutsVersion,
        shortcutDefaults: draft.shortcutDefaults,
        shortcuts: draft.shortcuts
      };
      const result = (await window.trayTranscriber?.updateConfig?.(payload)) as SaveConfigResult | undefined;
      if (!result || !result.ok) {
        const errors = result && !result.ok && Array.isArray(result.errors) ? result.errors.map((entry) => entry.message) : ['Configuration save failed.'];
        setValidationErrors(errors);
        setStatus('error');
        return;
      }
      const warnings = Array.isArray(result.warnings) ? result.warnings.map((warning) => warning.message) : [];
      setSaveWarnings(warnings);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1400);
    } catch (err) {
      setStatus('error');
      setValidationErrors([String(err)]);
    }
  };

  const renderStepEditor = (shortcutIndex: number, step: ShortcutStep, stepIndex: number) => (
    <div key={`step-${shortcutIndex}-${stepIndex}`} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-center">
        <PanelField label={`Step ${stepIndex + 1}`}>
          <select
            className={selectClasses}
            value={step.stepType}
            onChange={(event) => {
              const stepType = event.target.value as ShortcutStep['stepType'];
              updateStep(shortcutIndex, stepIndex, () => createStepTemplate(stepType));
            }}
          >
            <option value="record_toggle">{STEP_TYPE_LABELS.record_toggle}</option>
            <option value="record_press_to_talk">{STEP_TYPE_LABELS.record_press_to_talk}</option>
            <option value="record_hold_to_talk">{STEP_TYPE_LABELS.record_hold_to_talk}</option>
            <option value="screenshot_capture">{STEP_TYPE_LABELS.screenshot_capture}</option>
            <option value="ocr_extract">{STEP_TYPE_LABELS.ocr_extract}</option>
            <option value="assistant_prompt">{STEP_TYPE_LABELS.assistant_prompt}</option>
            <option value="output_text">{STEP_TYPE_LABELS.output_text}</option>
          </select>
        </PanelField>
        <div className="flex flex-wrap gap-2 md:pt-6">
          <button
            type="button"
            className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80"
            onClick={() => moveStep(shortcutIndex, stepIndex, -1)}
          >
            Up
          </button>
          <button
            type="button"
            className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80"
            onClick={() => moveStep(shortcutIndex, stepIndex, 1)}
          >
            Down
          </button>
          <button
            type="button"
            className="rounded-full border border-rose-400/70 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100"
            onClick={() => removeStep(shortcutIndex, stepIndex)}
          >
            Remove
          </button>
        </div>
      </div>

      {step.stepType === 'record_hold_to_talk' && (
        <ToggleField
          label="Stop when modifier key releases"
          checked={!!step.holdStopOnModifierRelease}
          onChange={(value) => updateStep(shortcutIndex, stepIndex, () => ({ ...step, holdStopOnModifierRelease: value }))}
        />
      )}

      {step.stepType === 'screenshot_capture' && (
        <PanelField label="Capture Mode">
          <select
            className={selectClasses}
            value={step.mode}
            onChange={(event) => updateStep(shortcutIndex, stepIndex, () => ({ ...step, mode: event.target.value as ScreenshotMode }))}
          >
            <option value="region">{SCREENSHOT_MODE_LABELS.region}</option>
            <option value="active_window">{SCREENSHOT_MODE_LABELS.active_window}</option>
            <option value="full_screen">{SCREENSHOT_MODE_LABELS.full_screen}</option>
            <option value="choose_each_time">{SCREENSHOT_MODE_LABELS.choose_each_time}</option>
          </select>
        </PanelField>
      )}

      {step.stepType === 'ocr_extract' && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <PanelField label="OCR Provider ID">
              <input
                className={inputClasses}
                value={step.providerId || ''}
                placeholder="Leave blank for active mode provider"
                onChange={(event) => updateStep(shortcutIndex, stepIndex, () => ({ ...step, providerId: normalizeProviderId(event.target.value) }))}
              />
            </PanelField>
            <PanelField label="Language Hint">
              <input
                className={inputClasses}
                value={step.languageHint || ''}
                placeholder="e.g. eng"
                onChange={(event) => updateStep(shortcutIndex, stepIndex, () => ({ ...step, languageHint: event.target.value }))}
              />
            </PanelField>
          </div>
          <p className="text-[11px] text-white/60">
            Active OCR mode: {OCR_MODE_LABELS[activeOcrMode]} ({activeOcrProviderId})
          </p>
          {!!step.providerId && !isProviderCompatible(step.providerId, activeOcrMode) && (
            <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
              Provider "{step.providerId}" is not active for mode "{activeOcrMode}". Saving will fail until this matches {activeOcrProviderId} or is blank.
            </p>
          )}
        </div>
      )}

      {step.stepType === 'assistant_prompt' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <PanelField label="Prompt">
            <textarea
              className={textAreaClasses}
              value={step.prompt}
              onChange={(event) => updateStep(shortcutIndex, stepIndex, () => ({ ...step, prompt: event.target.value }))}
            />
          </PanelField>
          <PanelField label="Input Mode">
            <select
              className={selectClasses}
              value={step.inputMode || 'prompt_plus_selection'}
              onChange={(event) => updateStep(shortcutIndex, stepIndex, () => ({ ...step, inputMode: event.target.value as AssistantInputMode }))}
            >
              <option value="prompt_plus_selection">{INPUT_MODE_LABELS.prompt_plus_selection}</option>
              <option value="prompt_only">{INPUT_MODE_LABELS.prompt_only}</option>
            </select>
          </PanelField>
        </div>
      )}

      {step.stepType === 'output_text' && (
        <PanelField label="Output Mode">
          <select
            className={selectClasses}
            value={step.outputMode || 'paste_then_clipboard'}
            onChange={(event) => updateStep(shortcutIndex, stepIndex, () => ({ ...step, outputMode: event.target.value as TextOutputMode }))}
          >
            <option value="paste_then_clipboard">{OUTPUT_MODE_LABELS.paste_then_clipboard}</option>
            <option value="clipboard_only">{OUTPUT_MODE_LABELS.clipboard_only}</option>
          </select>
        </PanelField>
      )}
    </div>
  );

  return (
    <div className="space-y-5 text-white">
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-3 text-xs text-white/75">
        Active OCR mode from LLM Assistant: <span className="font-semibold text-emerald-200">{OCR_MODE_LABELS[activeOcrMode]}</span> ({activeOcrProviderId})
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <PanelField label="Default Assistant Input Mode">
          <select
            className={selectClasses}
            value={draft.shortcutDefaults.assistantInputMode}
            onChange={(event) =>
              updateDraft({
                ...draft,
                shortcutDefaults: { ...draft.shortcutDefaults, assistantInputMode: event.target.value as AssistantInputMode }
              })
            }
          >
            <option value="prompt_plus_selection">{INPUT_MODE_LABELS.prompt_plus_selection}</option>
            <option value="prompt_only">{INPUT_MODE_LABELS.prompt_only}</option>
          </select>
        </PanelField>

        <PanelField label="Default Text Output Mode">
          <select
            className={selectClasses}
            value={draft.shortcutDefaults.textOutputMode}
            onChange={(event) =>
              updateDraft({
                ...draft,
                shortcutDefaults: { ...draft.shortcutDefaults, textOutputMode: event.target.value as TextOutputMode }
              })
            }
          >
            <option value="paste_then_clipboard">{OUTPUT_MODE_LABELS.paste_then_clipboard}</option>
            <option value="clipboard_only">{OUTPUT_MODE_LABELS.clipboard_only}</option>
          </select>
        </PanelField>

        <PanelField label="Default OCR Provider ID">
          <input
            className={inputClasses}
            value={draft.shortcutDefaults.ocrProviderId}
            placeholder="optional"
            onChange={(event) =>
              updateDraft({
                ...draft,
                shortcutDefaults: { ...draft.shortcutDefaults, ocrProviderId: normalizeProviderId(event.target.value) }
              })
            }
          />
        </PanelField>
      </div>

      {!!draft.shortcutDefaults.ocrProviderId && !isProviderCompatible(draft.shortcutDefaults.ocrProviderId, activeOcrMode) && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100">
          Default OCR provider "{draft.shortcutDefaults.ocrProviderId}" is inactive for mode "{activeOcrMode}". Saving will fail until it matches {activeOcrProviderId} or is blank.
        </div>
      )}

      <div className="relative inline-flex items-stretch" ref={splitButtonRef}>
        <button
          type="button"
          className="rounded-l-2xl border border-emerald-300/50 bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-950 transition hover:bg-emerald-400"
          onClick={() => addTemplateShortcut(selectedTemplate.id)}
        >
          Add New Shortcut
        </button>
        <button
          type="button"
          className="rounded-r-2xl border border-l-0 border-emerald-300/50 bg-emerald-500 px-3 text-slate-950 transition hover:bg-emerald-400"
          aria-label="Select shortcut template"
          aria-haspopup="menu"
          aria-expanded={templateMenuOpen}
          onClick={() => setTemplateMenuOpen((prev) => !prev)}
        >
          <span aria-hidden="true">▾</span>
        </button>
        {templateMenuOpen && (
          <div className="absolute left-0 top-[calc(100%+8px)] z-10 min-w-[280px] rounded-2xl border border-white/15 bg-slate-900 p-2 shadow-2xl" role="menu">
            {TEMPLATE_OPTIONS.map((option) => {
              const active = option.id === selectedTemplate.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="menuitem"
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                    active ? 'bg-emerald-500/20 text-emerald-200' : 'text-white/80 hover:bg-white/10'
                  }`}
                  onClick={() => {
                    setSelectedTemplateId(option.id);
                    setTemplateMenuOpen(false);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-white/60">Current template: {selectedTemplate.label}</p>

      {!draft.shortcuts.length && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 text-center">
          <p className="text-sm text-white/70">No shortcuts configured yet.</p>
          <p className="mt-1 text-xs text-white/50">Use the green Add New Shortcut button to create your first one.</p>
        </div>
      )}

      <div className="grid gap-4">
        {draft.shortcuts.map((shortcut, shortcutIndex) => (
          <div key={shortcut.id} className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="text-xs uppercase tracking-[0.3em] text-white/70">Active</span>
                <ToggleSwitch
                  checked={shortcut.enabled}
                  ariaLabel={`Toggle shortcut ${shortcut.label}`}
                  onChange={(value) => updateShortcut(shortcutIndex, (entry) => ({ ...entry, enabled: value }))}
                />
              </div>
              <PanelField label="Label">
                <input
                  className={inputClasses}
                  value={shortcut.label}
                  onChange={(event) => updateShortcut(shortcutIndex, (entry) => ({ ...entry, label: event.target.value }))}
                />
              </PanelField>
              <PanelField label="Shortcut" className="md:col-span-2">
                <HotkeyRecorderField
                  className={inputClasses}
                  value={shortcut.shortcut}
                  placeholder="Click and press shortcut"
                  ariaLabel={`Shortcut ${shortcutIndex + 1}`}
                  onChange={(nextShortcut) => updateShortcut(shortcutIndex, (entry) => ({ ...entry, shortcut: nextShortcut }))}
                />
              </PanelField>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80"
                onClick={() => moveShortcut(shortcutIndex, -1)}
              >
                Move Up
              </button>
              <button
                type="button"
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80"
                onClick={() => moveShortcut(shortcutIndex, 1)}
              >
                Move Down
              </button>
              <button
                type="button"
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80"
                onClick={() => duplicateShortcut(shortcutIndex)}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="rounded-full border border-rose-400/70 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100"
                onClick={() => removeShortcut(shortcutIndex)}
              >
                Remove Shortcut
              </button>
            </div>

            <div className="space-y-3">{shortcut.steps.map((step, stepIndex) => renderStepEditor(shortcutIndex, step, stepIndex))}</div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80"
                onClick={() => addStep(shortcutIndex, 'assistant_prompt')}
              >
                + Assistant Prompt
              </button>
              <button
                type="button"
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80"
                onClick={() => addStep(shortcutIndex, 'output_text')}
              >
                + Output Text
              </button>
              <button
                type="button"
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80"
                onClick={() => addStep(shortcutIndex, 'screenshot_capture')}
              >
                + Screenshot Capture
              </button>
              <button
                type="button"
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80"
                onClick={() => addStep(shortcutIndex, 'ocr_extract')}
              >
                + OCR Extract
              </button>
            </div>
          </div>
        ))}
      </div>

      {!!validationErrors.length && (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          {validationErrors.map((entry, index) => (
            <p key={`validation-${index}`}>{entry}</p>
          ))}
        </div>
      )}

      {!!saveWarnings.length && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p className="mb-1 font-semibold uppercase tracking-[0.2em]">Saved with warnings</p>
          {saveWarnings.map((entry, index) => (
            <p key={`warning-${index}`}>{entry}</p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {status === 'saved' && <span className="text-xs uppercase tracking-[0.4em] text-emerald-300">Saved</span>}
        {status === 'error' && <span className="text-xs uppercase tracking-[0.4em] text-rose-300">Save failed</span>}
        <button
          type="button"
          className="rounded-2xl border border-transparent bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
          onClick={save}
          disabled={status === 'saving'}
        >
          {status === 'saving' ? 'Saving…' : 'Save Shortcuts'}
        </button>
      </div>
    </div>
  );
}
