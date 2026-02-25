import { createRequire } from 'node:module';
import { config, globalShortcut, dialog, shell, systemPreferences } from './ctx.js';
import { saveConfig } from './config-manager.js';
const require = createRequire(import.meta.url);

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
let learningHotkey = false;

// ── Injected callbacks (set via initHotkeys) ──────────────────────────────────
let _setRecording: (state: boolean) => void = () => {};
let _updateTrayMenu: () => void = () => {};
let _handleAssistantShortcut: (prompt: string) => void = () => {};

export function initHotkeys(opts: {
  setRecording: (s: boolean) => void;
  updateTrayMenu: () => void;
  handleAssistantShortcut: (p: string) => void;
}): void {
  _setRecording = opts.setRecording;
  _updateTrayMenu = opts.updateTrayMenu;
  _handleAssistantShortcut = opts.handleAssistantShortcut;
}

// ── Accessibility ─────────────────────────────────────────────────────────────
export function hasAccessibilityPermission(): boolean {
  if (process.platform !== 'darwin') return true;
  try { return systemPreferences.isTrustedAccessibilityClient(false); }
  catch (err: any) { console.warn('[perm] accessibility check failed:', err?.message ?? err); return true; }
}

export function showAccessibilityWarning(): void {
  if (process.platform !== 'darwin') return;
  dialog
    .showMessageBox({
      type: 'warning',
      buttons: ['OK', 'Open Settings'],
      defaultId: 0, cancelId: 0,
      title: 'TrayTranscriber Permission',
      message: 'Accessibility permission is disabled. Global hotkeys and paste automation may not work.',
      detail: 'Enable TrayTranscriber under System Settings → Privacy & Security → Accessibility.'
    })
    .then(({ response }: any) => {
      if (response === 1) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    })
    .catch(() => {});
}

// ── Hook loading ──────────────────────────────────────────────────────────────
function buildModifierKeycodes(mods: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean }): Set<number> {
  const codes = new Set<number>();
  if (!hookKeyMap) return codes;
  if (mods.ctrlKey) { if (hookKeyMap.Ctrl) codes.add(hookKeyMap.Ctrl); if (hookKeyMap.CtrlRight) codes.add(hookKeyMap.CtrlRight); }
  if (mods.shiftKey) { if (hookKeyMap.Shift) codes.add(hookKeyMap.Shift); if (hookKeyMap.ShiftRight) codes.add(hookKeyMap.ShiftRight); }
  if (mods.altKey) { if (hookKeyMap.Alt) codes.add(hookKeyMap.Alt); if (hookKeyMap.AltRight) codes.add(hookKeyMap.AltRight); }
  if (mods.metaKey) { if (hookKeyMap.Meta) codes.add(hookKeyMap.Meta); if (hookKeyMap.MetaRight) codes.add(hookKeyMap.MetaRight); }
  return codes;
}

function initHookMeta(mod: any, key: any): void {
  hookKeyMap = key || null;
  modifierKeycodes = buildModifierKeycodes({ ctrlKey: true, shiftKey: true, altKey: true, metaKey: true });
}

export function tryLoadHook(): any {
  if (hook) return hook;
  if (!hasAccessibilityPermission()) { console.warn('[hotkey] accessibility disabled; skipping uiohook'); showAccessibilityWarning(); return null; }
  try {
    const mod = require('uiohook-napi');
    if (mod?.uIOhook && typeof mod.uIOhook.on === 'function') { hook = mod.uIOhook; initHookMeta(mod, mod.UiohookKey); return hook; }
    if (mod && typeof mod.on === 'function') { hook = mod; initHookMeta(mod, mod.UiohookKey); return hook; }
    console.warn('[hotkey] uiohook-napi loaded but has no usable hook');
    hook = null; hookKeyMap = null; modifierKeycodes = new Set(); return null;
  } catch (_) {
    try {
      hook = require('iohook');
      if (typeof hook.on !== 'function') { console.warn('[hotkey] iohook has no .on'); hook = null; hookKeyMap = null; modifierKeycodes = new Set(); return null; }
      initHookMeta(hook, hook.UiohookKey); return hook;
    } catch (_2) {
      console.warn('[hotkey] failed to load iohook/uiohook-napi');
      hookKeyMap = null; modifierKeycodes = new Set(); return null;
    }
  }
}

// ── Hotkey matching ───────────────────────────────────────────────────────────
function keycodeFromKeyPart(part: string): number | null {
  if (hookKeyMap) {
    const k = Object.keys(hookKeyMap).find((k) => k.toLowerCase() === part);
    if (k && hookKeyMap[k]) return hookKeyMap[k];
  }
  const table: Record<string, number> = { space: 57, return: 28, enter: 28, tab: 15, escape: 1, esc: 1 };
  if (table[part]) return table[part];
  if (/^[a-z]$/.test(part)) return part.toUpperCase().charCodeAt(0);
  return null;
}

export function parseHotkeyString(hotkey: string): any | null {
  if (!hotkey) return null;
  const parts = hotkey.split('+').map((p) => p.trim().toLowerCase());
  const wantsCtrl = parts.some((p) => ['commandorcontrol', 'control', 'ctrl'].includes(p));
  const wantsShift = parts.includes('shift');
  const wantsAlt = parts.some((p) => ['alt', 'option'].includes(p));
  const wantsMeta = parts.some((p) => ['command', 'meta'].includes(p));
  const keycode = keycodeFromKeyPart(parts[parts.length - 1]);
  if (!keycode) return null;
  return {
    keycode, ctrlKey: wantsCtrl, shiftKey: wantsShift, altKey: wantsAlt, metaKey: wantsMeta,
    modifierKeycodes: buildModifierKeycodes({ ctrlKey: wantsCtrl, shiftKey: wantsShift, altKey: wantsAlt, metaKey: wantsMeta })
  };
}

function matchesHoldSpec(event: any, spec: any): boolean {
  return event.keycode === spec.keycode &&
    (!spec.ctrlKey || !!event.ctrlKey) && (!spec.shiftKey || !!event.shiftKey) &&
    (!spec.altKey || !!event.altKey) && (!spec.metaKey || !!event.metaKey);
}

function shouldReleaseHold(event: any, spec: any): boolean {
  if (event.keycode === spec.keycode) return true;
  if (config?.holdStopOnModifierRelease && spec.modifierKeycodes?.has(event.keycode)) return true;
  return false;
}

function matchesToggleHotkey(event: any): boolean {
  const spec = parseHotkeyString(config?.hotkey || '');
  if (!spec) return false;
  return event.keycode === spec.keycode &&
    !!event.ctrlKey === !!spec.ctrlKey && !!event.shiftKey === !!spec.shiftKey &&
    !!event.altKey === !!spec.altKey && !!event.metaKey === !!spec.metaKey;
}

function isModifierKeycode(kc: number): boolean {
  return !!modifierKeycodes?.has(kc);
}

function summarizeEvent(e: any) {
  return { keycode: e.keycode, ctrlKey: !!e.ctrlKey, shiftKey: !!e.shiftKey, altKey: !!e.altKey, metaKey: !!e.metaKey };
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
    if (!hasAccessibilityPermission()) { showAccessibilityWarning(); return; }
    if (typeof h.start === 'function') {
      const r = h.start();
      if (r && typeof r.catch === 'function') r.catch((err: any) => console.warn('[hotkey] hook start failed:', err));
    }
  } catch (err) { console.warn('[hotkey] hook start error:', err); }
}

// ── Setup helpers ─────────────────────────────────────────────────────────────
function buildHoldHotkeySpec(): any {
  if (config?.holdHotkey && typeof config.holdHotkey.keycode === 'number') {
    if (isModifierKeycode(config.holdHotkey.keycode)) {
      console.warn('[hotkey] holdHotkey is modifier-only, falling back to hotkey string');
    } else {
      return { ...config.holdHotkey, modifierKeycodes: buildModifierKeycodes(config.holdHotkey) };
    }
  }
  return config?.hotkey ? parseHotkeyString(config.hotkey) : null;
}

function fallbackToToggle(reason: string): void {
  console.warn(`[hotkey] ${reason}, falling back to toggle`);
  config.holdToTalk = false;
  saveConfig(config);
  registerHotkey();
  _updateTrayMenu();
}

function setupHoldToTalk(): void {
  const h = tryLoadHook();
  if (!h) { fallbackToToggle('hold-to-talk unavailable'); return; }
  clearHookListeners(h);
  holdHotkeySpec = buildHoldHotkeySpec();
  if (!holdHotkeySpec) { fallbackToToggle('hold-to-talk missing hotkey'); return; }

  const onKeyDown = (event: any) => {
    if (learningHotkey || !matchesHoldSpec(event, holdHotkeySpec) || holdKeyActive) return;
    holdKeyActive = true;
    _setRecording(true);
  };
  const onKeyUp = (event: any) => {
    if (learningHotkey || !shouldReleaseHold(event, holdHotkeySpec)) return;
    holdKeyActive = false;
    _setRecording(false);
  };
  hookListeners = { keydown: onKeyDown, keyup: onKeyUp };
  h.on('keydown', onKeyDown);
  h.on('keyup', onKeyUp);
  safeStartHook(h);
}

function setupToggleWithHook(): boolean {
  const h = tryLoadHook();
  if (!h) return false;
  clearHookListeners(h);
  const onKeyDown = (event: any) => {
    if (learningHotkey || !matchesToggleHotkey(event) || toggleKeyActive) return;
    toggleKeyActive = true;
    toggleRecording();
  };
  const onKeyUp = (event: any) => {
    if (learningHotkey || !matchesToggleHotkey(event)) return;
    toggleKeyActive = false;
  };
  hookListeners = { keydown: onKeyDown, keyup: onKeyUp };
  h.on('keydown', onKeyDown);
  h.on('keyup', onKeyUp);
  safeStartHook(h);
  return true;
}

function setupPressToTalkWithHook(): boolean {
  const h = tryLoadHook();
  if (!h) return false;
  clearHookListeners(h);
  const onKeyDown = (event: any) => {
    if (learningHotkey || !matchesToggleHotkey(event) || toggleKeyActive) return;
    toggleKeyActive = true;
    console.log('[hotkey] press-to-talk down', summarizeEvent(event));
    _setRecording(true);
  };
  const onKeyUp = (event: any) => {
    if (learningHotkey || !matchesToggleHotkey(event)) return;
    toggleKeyActive = false;
    console.log('[hotkey] press-to-talk up', summarizeEvent(event));
    _setRecording(false);
  };
  hookListeners = { keydown: onKeyDown, keyup: onKeyUp };
  h.on('keydown', onKeyDown);
  h.on('keyup', onKeyUp);
  safeStartHook(h);
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function toggleRecording(): void {
  const now = Date.now();
  if (now - lastHotkeyAt < 400 || hotkeyGuard) return;
  hotkeyGuard = true;
  setTimeout(() => { hotkeyGuard = false; }, 700);
  lastHotkeyAt = now;
  console.log('[hotkey] toggle fired');
  // We defer to the injected callback so the coordinating layer drives state.
  _setRecording(undefined as any); // signal "toggle" - main.ts will resolve current state
}

export function registerHotkey(): void {
  globalShortcut.unregisterAll();

  if (Array.isArray(config?.assistantShortcuts)) {
    for (const item of config.assistantShortcuts) {
      if (item?.shortcut && item?.prompt) {
        const ok = globalShortcut.register(item.shortcut, () => {
          console.log('[hotkey] assistant shortcut fired:', item.shortcut);
          _handleAssistantShortcut(item.prompt);
        });
        if (!ok) console.error('[hotkey] failed to register assistant shortcut:', item.shortcut);
      }
    }
  }

  if (!config?.hotkey) return;
  if (config.holdToTalk) { setupHoldToTalk(); return; }
  if (config.pressToTalk && config.preferKeyHook && setupPressToTalkWithHook()) return;
  if (config.preferKeyHook && setupToggleWithHook()) return;

  const ok = globalShortcut.register(config.hotkey, () => { _setRecording(undefined as any); });
  if (!ok) console.error('[hotkey] failed to register hotkey:', config.hotkey);
}

export function learnHoldHotkey(): void {
  const h = tryLoadHook();
  if (!h) return;
  learningHotkey = true;
  console.log('[hotkey] learning hold-to-talk hotkey: press desired combo now');
  const onKeyDown = (event: any) => {
    if (isModifierKeycode(event.keycode)) { console.log('[hotkey] ignoring modifier-only key'); return; }
    const next = { keycode: event.keycode, ctrlKey: !!event.ctrlKey, shiftKey: !!event.shiftKey, altKey: !!event.altKey, metaKey: !!event.metaKey };
    config.holdHotkey = next;
    config.holdToTalk = true;
    saveConfig(config);
    learningHotkey = false;
    console.log('[hotkey] learned:', next);
    if (typeof h.off === 'function') h.off('keydown', onKeyDown);
    else if (typeof h.removeListener === 'function') h.removeListener('keydown', onKeyDown);
    setupHoldToTalk();
    _updateTrayMenu();
  };
  clearHookListeners(h);
  hookListeners = { keydown: onKeyDown, keyup: null };
  h.on('keydown', onKeyDown);
  safeStartHook(h);
}

export function toggleHoldToTalk(): void {
  config.holdToTalk = !config.holdToTalk;
  saveConfig(config);
  registerHotkey();
  _updateTrayMenu();
}
