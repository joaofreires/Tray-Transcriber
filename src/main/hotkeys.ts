import { createRequire } from 'node:module';
import { config, globalShortcut, dialog, shell, systemPreferences } from './ctx.js';
import { toElectronAccelerator } from './shortcuts/accelerator.js';
const require = createRequire(import.meta.url);

export type RecordingShortcutMode = 'record_toggle' | 'record_press_to_talk' | 'record_hold_to_talk';

// ── Module-level state ────────────────────────────────────────────────────────
let hook: any = null;
let hookKeyMap: any = null;
let modifierKeycodes: Set<number> = new Set();
let hookListeners: { keydown: any; keyup: any } = { keydown: null, keyup: null };
let holdHotkeySpec: any = null;
let lastHotkeyAt = 0;
let hotkeyGuard = false;
let holdKeyActive = false;
let toggleKeyActive = false;
let registeredGlobalAccelerator = '';

let recordingShortcut = '';
let recordingMode: RecordingShortcutMode = 'record_toggle';
let holdStopOnModifierRelease = false;

// ── Injected callbacks (set via initHotkeys) ──────────────────────────────────
let _setRecording: (state: boolean | undefined) => void = () => {};
let _updateTrayMenu: () => void = () => {};

export function initHotkeys(opts: {
  setRecording: (s: boolean | undefined) => void;
  updateTrayMenu: () => void;
}): void {
  _setRecording = opts.setRecording;
  _updateTrayMenu = opts.updateTrayMenu;
}

export function configureRecordingShortcut(
  next:
    | {
        shortcut: string;
        mode: RecordingShortcutMode;
        holdStopOnModifierRelease?: boolean;
      }
    | null
): void {
  if (!next) {
    recordingShortcut = '';
    recordingMode = 'record_toggle';
    holdStopOnModifierRelease = false;
    return;
  }

  recordingShortcut = String(next.shortcut || '').trim();
  recordingMode = next.mode;
  holdStopOnModifierRelease = !!next.holdStopOnModifierRelease;
}

// ── Accessibility ─────────────────────────────────────────────────────────────
export function hasAccessibilityPermission(): boolean {
  if (process.platform !== 'darwin') return true;
  try {
    return systemPreferences.isTrustedAccessibilityClient(false);
  } catch (err: any) {
    console.warn('[perm] accessibility check failed:', err?.message ?? err);
    return true;
  }
}

export function showAccessibilityWarning(): void {
  if (process.platform !== 'darwin') return;
  dialog
    .showMessageBox({
      type: 'warning',
      buttons: ['OK', 'Open Settings'],
      defaultId: 0,
      cancelId: 0,
      title: 'TrayTranscriber Permission',
      message: 'Accessibility permission is disabled. Global hotkeys and paste automation may not work.',
      detail: 'Enable TrayTranscriber under System Settings → Privacy & Security → Accessibility.'
    })
    .then(({ response }: any) => {
      if (response === 1) {
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      }
    })
    .catch(() => {});
}

// ── Hook loading ──────────────────────────────────────────────────────────────
function buildModifierKeycodes(mods: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean }): Set<number> {
  const codes = new Set<number>();
  if (!hookKeyMap) return codes;
  if (mods.ctrlKey) {
    if (hookKeyMap.Ctrl) codes.add(hookKeyMap.Ctrl);
    if (hookKeyMap.CtrlRight) codes.add(hookKeyMap.CtrlRight);
  }
  if (mods.shiftKey) {
    if (hookKeyMap.Shift) codes.add(hookKeyMap.Shift);
    if (hookKeyMap.ShiftRight) codes.add(hookKeyMap.ShiftRight);
  }
  if (mods.altKey) {
    if (hookKeyMap.Alt) codes.add(hookKeyMap.Alt);
    if (hookKeyMap.AltRight) codes.add(hookKeyMap.AltRight);
  }
  if (mods.metaKey) {
    if (hookKeyMap.Meta) codes.add(hookKeyMap.Meta);
    if (hookKeyMap.MetaRight) codes.add(hookKeyMap.MetaRight);
  }
  return codes;
}

function initHookMeta(mod: any, key: any): void {
  hookKeyMap = key || null;
  modifierKeycodes = buildModifierKeycodes({ ctrlKey: true, shiftKey: true, altKey: true, metaKey: true });
}

const KEY_PART_ALIASES: Record<string, string> = {
  return: 'enter',
  esc: 'escape',
  del: 'delete',
  ins: 'insert',
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown',
  backtick: 'backquote',
  apostrophe: 'quote',
  ';': 'semicolon',
  '=': 'equal',
  ',': 'comma',
  '-': 'minus',
  '.': 'period',
  '/': 'slash',
  printscreen: 'printscreen',
  prtsc: 'printscreen',
  sysrq: 'printscreen',
  '`': 'backquote',
  '[': 'bracketleft',
  '\\': 'backslash',
  ']': 'bracketright',
  "'": 'quote'
};

const STATIC_KEYCODE_TABLE: Record<string, number> = {
  space: 57,
  enter: 28,
  tab: 15,
  escape: 1,
  backspace: 14,
  delete: 3651,
  insert: 3666,
  home: 3655,
  end: 3663,
  pageup: 3657,
  pagedown: 3665,
  arrowleft: 57419,
  arrowup: 57416,
  arrowright: 57421,
  arrowdown: 57424,
  printscreen: 3639,
  semicolon: 39,
  equal: 13,
  comma: 51,
  minus: 12,
  period: 52,
  slash: 53,
  backquote: 41,
  bracketleft: 26,
  backslash: 43,
  bracketright: 27,
  quote: 40,
  '0': 11,
  '1': 2,
  '2': 3,
  '3': 4,
  '4': 5,
  '5': 6,
  '6': 7,
  '7': 8,
  '8': 9,
  '9': 10,
  f1: 59,
  f2: 60,
  f3: 61,
  f4: 62,
  f5: 63,
  f6: 64,
  f7: 65,
  f8: 66,
  f9: 67,
  f10: 68,
  f11: 87,
  f12: 88,
  f13: 91,
  f14: 92,
  f15: 93,
  f16: 99,
  f17: 100,
  f18: 101,
  f19: 102,
  f20: 103,
  f21: 104,
  f22: 105,
  f23: 106,
  f24: 107
};

export function tryLoadHook(): any {
  if (hook) return hook;
  if (!hasAccessibilityPermission()) {
    console.warn('[hotkey] accessibility disabled; skipping uiohook');
    showAccessibilityWarning();
    return null;
  }
  try {
    const mod = require('uiohook-napi');
    if (mod?.uIOhook && typeof mod.uIOhook.on === 'function') {
      hook = mod.uIOhook;
      initHookMeta(mod, mod.UiohookKey);
      return hook;
    }
    if (mod && typeof mod.on === 'function') {
      hook = mod;
      initHookMeta(mod, mod.UiohookKey);
      return hook;
    }
    console.warn('[hotkey] uiohook-napi loaded but has no usable hook');
    hook = null;
    hookKeyMap = null;
    modifierKeycodes = new Set();
    return null;
  } catch (_firstErr) {
    try {
      hook = require('iohook');
      if (typeof hook.on !== 'function') {
        console.warn('[hotkey] iohook has no .on');
        hook = null;
        hookKeyMap = null;
        modifierKeycodes = new Set();
        return null;
      }
      initHookMeta(hook, hook.UiohookKey);
      return hook;
    } catch (_secondErr) {
      console.warn('[hotkey] failed to load iohook/uiohook-napi');
      hookKeyMap = null;
      modifierKeycodes = new Set();
      return null;
    }
  }
}

// ── Hotkey matching ───────────────────────────────────────────────────────────
function keycodeFromKeyPart(part: string): number | null {
  const normalized = KEY_PART_ALIASES[part] ?? part;

  if (hookKeyMap) {
    const key = Object.keys(hookKeyMap).find((item) => item.toLowerCase() === normalized);
    if (key && hookKeyMap[key]) return hookKeyMap[key];
  }

  if (STATIC_KEYCODE_TABLE[normalized]) return STATIC_KEYCODE_TABLE[normalized];
  if (/^[a-z]$/.test(normalized)) return normalized.toUpperCase().charCodeAt(0);
  return null;
}

export function parseHotkeyString(hotkey: string): any | null {
  if (!hotkey) return null;
  const parts = hotkey
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return null;

  const hasCommandOrControl = parts.includes('commandorcontrol');
  const isMac = process.platform === 'darwin';
  const wantsCtrl = parts.some((p) => ['control', 'ctrl'].includes(p)) || (hasCommandOrControl && !isMac);
  const wantsShift = parts.includes('shift');
  const wantsAlt = parts.some((p) => ['alt', 'option'].includes(p));
  const wantsMeta = parts.some((p) => ['command', 'meta'].includes(p)) || (hasCommandOrControl && isMac);
  const keycode = keycodeFromKeyPart(parts[parts.length - 1]);
  if (!keycode) return null;

  return {
    keycode,
    ctrlKey: wantsCtrl,
    shiftKey: wantsShift,
    altKey: wantsAlt,
    metaKey: wantsMeta,
    modifierKeycodes: buildModifierKeycodes({
      ctrlKey: wantsCtrl,
      shiftKey: wantsShift,
      altKey: wantsAlt,
      metaKey: wantsMeta
    })
  };
}

function matchesHoldSpec(event: any, spec: any): boolean {
  return (
    event.keycode === spec.keycode &&
    (!spec.ctrlKey || !!event.ctrlKey) &&
    (!spec.shiftKey || !!event.shiftKey) &&
    (!spec.altKey || !!event.altKey) &&
    (!spec.metaKey || !!event.metaKey)
  );
}

function shouldReleaseHold(event: any, spec: any): boolean {
  if (event.keycode === spec.keycode) return true;
  if (holdStopOnModifierRelease && spec.modifierKeycodes?.has(event.keycode)) return true;
  return false;
}

function matchesToggleHotkey(event: any): boolean {
  const spec = parseHotkeyString(recordingShortcut || '');
  if (!spec) return false;
  return (
    event.keycode === spec.keycode &&
    !!event.ctrlKey === !!spec.ctrlKey &&
    !!event.shiftKey === !!spec.shiftKey &&
    !!event.altKey === !!spec.altKey &&
    !!event.metaKey === !!spec.metaKey
  );
}

function summarizeEvent(event: any) {
  return {
    keycode: event.keycode,
    ctrlKey: !!event.ctrlKey,
    shiftKey: !!event.shiftKey,
    altKey: !!event.altKey,
    metaKey: !!event.metaKey
  };
}

// ── Hook lifecycle ────────────────────────────────────────────────────────────
function clearHookListeners(h: any): void {
  if (!h) return;
  for (const type of ['keydown', 'keyup'] as const) {
    const fn = hookListeners[type];
    if (!fn) continue;
    if (typeof h.off === 'function') h.off(type, fn);
    else if (typeof h.removeListener === 'function') h.removeListener(type, fn);
  }
  hookListeners = { keydown: null, keyup: null };
}

function safeStartHook(h: any): void {
  try {
    if (!hasAccessibilityPermission()) {
      showAccessibilityWarning();
      return;
    }
    if (typeof h.start === 'function') {
      const result = h.start();
      if (result && typeof result.catch === 'function') {
        result.catch((err: any) => console.warn('[hotkey] hook start failed:', err));
      }
    }
  } catch (err) {
    console.warn('[hotkey] hook start error:', err);
  }
}

function unregisterGlobalHotkey(): void {
  if (!registeredGlobalAccelerator) return;
  try {
    globalShortcut.unregister(registeredGlobalAccelerator);
  } catch (_) {
    // ignore
  }
  registeredGlobalAccelerator = '';
}

export function clearRecordingRegistration(): void {
  unregisterGlobalHotkey();
  clearHookListeners(hook);
  holdHotkeySpec = null;
  holdKeyActive = false;
  toggleKeyActive = false;
}

// ── Setup helpers ─────────────────────────────────────────────────────────────
function buildHoldHotkeySpec(): any {
  return recordingShortcut ? parseHotkeyString(recordingShortcut) : null;
}

function fallbackToToggle(reason: string): void {
  console.warn(`[hotkey] ${reason}, falling back to toggle`);
  recordingMode = 'record_toggle';
  registerHotkey();
  _updateTrayMenu();
}

function setupHoldToTalk(): void {
  const localHook = tryLoadHook();
  if (!localHook) {
    fallbackToToggle('hold-to-talk unavailable');
    return;
  }

  clearHookListeners(localHook);
  holdHotkeySpec = buildHoldHotkeySpec();
  if (!holdHotkeySpec) {
    fallbackToToggle('hold-to-talk missing hotkey');
    return;
  }

  const onKeyDown = (event: any) => {
    if (!matchesHoldSpec(event, holdHotkeySpec) || holdKeyActive) return;
    holdKeyActive = true;
    _setRecording(true);
  };

  const onKeyUp = (event: any) => {
    if (!shouldReleaseHold(event, holdHotkeySpec)) return;
    holdKeyActive = false;
    _setRecording(false);
  };

  hookListeners = { keydown: onKeyDown, keyup: onKeyUp };
  localHook.on('keydown', onKeyDown);
  localHook.on('keyup', onKeyUp);
  safeStartHook(localHook);
}

function setupToggleWithHook(): boolean {
  const localHook = tryLoadHook();
  if (!localHook) return false;

  clearHookListeners(localHook);

  const onKeyDown = (event: any) => {
    if (!matchesToggleHotkey(event) || toggleKeyActive) return;
    toggleKeyActive = true;
    toggleRecording();
  };

  const onKeyUp = (event: any) => {
    if (!matchesToggleHotkey(event)) return;
    toggleKeyActive = false;
  };

  hookListeners = { keydown: onKeyDown, keyup: onKeyUp };
  localHook.on('keydown', onKeyDown);
  localHook.on('keyup', onKeyUp);
  safeStartHook(localHook);
  return true;
}

function setupPressToTalkWithHook(): boolean {
  const localHook = tryLoadHook();
  if (!localHook) return false;

  clearHookListeners(localHook);

  const onKeyDown = (event: any) => {
    if (!matchesToggleHotkey(event) || toggleKeyActive) return;
    toggleKeyActive = true;
    console.log('[hotkey] press-to-talk down', summarizeEvent(event));
    _setRecording(true);
  };

  const onKeyUp = (event: any) => {
    if (!matchesToggleHotkey(event)) return;
    toggleKeyActive = false;
    console.log('[hotkey] press-to-talk up', summarizeEvent(event));
    _setRecording(false);
  };

  hookListeners = { keydown: onKeyDown, keyup: onKeyUp };
  localHook.on('keydown', onKeyDown);
  localHook.on('keyup', onKeyUp);
  safeStartHook(localHook);
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function toggleRecording(): void {
  const now = Date.now();
  if (now - lastHotkeyAt < 400 || hotkeyGuard) return;
  hotkeyGuard = true;
  setTimeout(() => {
    hotkeyGuard = false;
  }, 700);
  lastHotkeyAt = now;

  console.log('[hotkey] toggle fired');
  _setRecording(undefined);
}

export function registerHotkey(): void {
  clearRecordingRegistration();

  if (!recordingShortcut) return;

  if (recordingMode === 'record_hold_to_talk') {
    setupHoldToTalk();
    return;
  }

  if (recordingMode === 'record_press_to_talk' && config?.preferKeyHook && setupPressToTalkWithHook()) {
    return;
  }

  if (recordingMode === 'record_toggle' && config?.preferKeyHook && setupToggleWithHook()) {
    return;
  }

  if (recordingMode === 'record_press_to_talk') {
    console.warn('[hotkey] press-to-talk key hook unavailable, falling back to toggle shortcut behavior');
  }

  const accelerator = toElectronAccelerator(recordingShortcut);
  if (!accelerator) return;

  let ok = false;
  try {
    ok = globalShortcut.register(accelerator, () => {
      _setRecording(undefined);
    });
  } catch (err) {
    console.error('[hotkey] invalid recording hotkey accelerator:', recordingShortcut, '=>', accelerator, err);
    return;
  }

  if (!ok) {
    console.error('[hotkey] failed to register recording hotkey:', recordingShortcut, '=>', accelerator);
    return;
  }

  registeredGlobalAccelerator = accelerator;
}
