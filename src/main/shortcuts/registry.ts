import { globalShortcut } from '../ctx.js';
import {
  clearRecordingRegistration,
  configureRecordingShortcut,
  registerHotkey,
  type RecordingShortcutMode
} from '../hotkeys.js';
import { enqueueShortcutExecution, clearShortcutExecutionQueue } from './executor.js';
import { toElectronAccelerator } from './accelerator.js';
import {
  isRecordingStep,
  validateShortcuts,
  type ShortcutConfigShape,
  type ShortcutDefinition
} from './schema.js';

export type ShortcutRegistrationIssue = {
  code: 'INVALID_ACCELERATOR' | 'REGISTER_FAILED' | 'LIKELY_OS_RESERVED';
  shortcutId: string;
  label: string;
  shortcut: string;
  accelerator: string;
  message: string;
};

export type ShortcutRegistrationReport = {
  registeredAccelerators: string[];
  issues: ShortcutRegistrationIssue[];
};

let registeredNonRecordingShortcuts = new Set<string>();

function unregisterNonRecordingShortcuts(): void {
  for (const shortcut of registeredNonRecordingShortcuts) {
    try {
      globalShortcut.unregister(shortcut);
    } catch (err) {
      console.warn('[shortcuts] failed to unregister shortcut', shortcut, err);
    }
  }
  registeredNonRecordingShortcuts = new Set<string>();
}

function findEnabledRecordingShortcut(shortcuts: ShortcutDefinition[]): ShortcutDefinition | null {
  for (const shortcut of shortcuts) {
    if (!shortcut.enabled) continue;
    if (!shortcut.steps.length) continue;
    if (isRecordingStep(shortcut.steps[0])) return shortcut;
  }
  return null;
}

function isRunnablePipelineShortcut(shortcut: ShortcutDefinition): boolean {
  if (!shortcut.enabled || !shortcut.shortcut || !shortcut.steps.length) return false;
  return !isRecordingStep(shortcut.steps[0]);
}

function isPrintScreenAccelerator(accelerator: string): boolean {
  const normalized = String(accelerator || '').trim().toLowerCase();
  if (!normalized) return false;
  const parts = normalized.split('+').filter(Boolean);
  const main = parts[parts.length - 1] || '';
  return main === 'printscreen' || main === 'prtsc' || main === 'sysrq';
}

export function unregisterAllShortcutHandlers(): void {
  unregisterNonRecordingShortcuts();
  clearRecordingRegistration();
  clearShortcutExecutionQueue();
}

export function registerShortcutHandlers(config: ShortcutConfigShape): ShortcutRegistrationReport {
  const issues: ShortcutRegistrationIssue[] = [];
  unregisterAllShortcutHandlers();

  const validation = validateShortcuts(config.shortcuts || []);
  if (!validation.ok) {
    console.error('[shortcuts] skipping registration due to invalid config', validation.errors);
    return {
      registeredAccelerators: [],
      issues
    };
  }

  const recordingShortcut = findEnabledRecordingShortcut(config.shortcuts || []);
  if (recordingShortcut && recordingShortcut.steps.length) {
    const first = recordingShortcut.steps[0];
    if (isRecordingStep(first)) {
      const mode = first.stepType as RecordingShortcutMode;
      configureRecordingShortcut({
        shortcut: recordingShortcut.shortcut,
        mode,
        holdStopOnModifierRelease: first.stepType === 'record_hold_to_talk' ? !!first.holdStopOnModifierRelease : false
      });
      registerHotkey();
    }
  } else {
    configureRecordingShortcut(null);
  }

  for (const shortcut of config.shortcuts || []) {
    if (!isRunnablePipelineShortcut(shortcut)) continue;
    const accelerator = toElectronAccelerator(shortcut.shortcut);
    if (!accelerator) {
      const issue: ShortcutRegistrationIssue = {
        code: 'INVALID_ACCELERATOR',
        shortcutId: shortcut.id,
        label: shortcut.label,
        shortcut: shortcut.shortcut,
        accelerator,
        message: `Shortcut "${shortcut.label}" has an invalid accelerator and was not registered.`
      };
      issues.push(issue);
      console.error('[shortcuts] invalid shortcut accelerator:', shortcut.shortcut, '=>', accelerator, shortcut.label);
      continue;
    }

    let ok = false;
    try {
      ok = globalShortcut.register(accelerator, () => {
        enqueueShortcutExecution(shortcut, config.shortcutDefaults);
      });
    } catch (err) {
      const issue: ShortcutRegistrationIssue = {
        code: 'INVALID_ACCELERATOR',
        shortcutId: shortcut.id,
        label: shortcut.label,
        shortcut: shortcut.shortcut,
        accelerator,
        message: `Shortcut "${shortcut.label}" has an invalid accelerator and was not registered.`
      };
      issues.push(issue);
      console.error('[shortcuts] invalid shortcut accelerator:', shortcut.shortcut, '=>', accelerator, shortcut.label, err);
      continue;
    }

    if (!ok) {
      const likelyReserved = isPrintScreenAccelerator(accelerator);
      const issue: ShortcutRegistrationIssue = {
        code: likelyReserved ? 'LIKELY_OS_RESERVED' : 'REGISTER_FAILED',
        shortcutId: shortcut.id,
        label: shortcut.label,
        shortcut: shortcut.shortcut,
        accelerator,
        message: likelyReserved
          ? `Shortcut "${shortcut.label}" could not register. PrintScreen is likely reserved by the OS.`
          : `Shortcut "${shortcut.label}" could not register and may be in use by another app or the OS.`
      };
      issues.push(issue);
      console.error('[shortcuts] failed to register shortcut:', shortcut.shortcut, '=>', accelerator, shortcut.label);
      continue;
    }

    registeredNonRecordingShortcuts.add(accelerator);
  }

  return {
    registeredAccelerators: Array.from(registeredNonRecordingShortcuts),
    issues
  };
}
