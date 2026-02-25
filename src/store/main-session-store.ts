import { createStore } from 'zustand/vanilla';

type MainSessionState = {
  lastHotkeyAt: number;
  hotkeyGuard: boolean;
  hook: any | null;
  learningHotkey: boolean;
  holdKeyActive: boolean;
  toggleKeyActive: boolean;
  hookListeners: { keydown: any | null; keyup: any | null };
  hookKeyMap: any | null;
  holdHotkeySpec: any | null;
  modifierKeycodes: Set<number>;
  transcribeQueue: any[];
  transcribeRunning: boolean;
  accessibilityWarningShown: boolean;
  llmHistory: Array<{ role: string; content: string }>;
};

const store = createStore<MainSessionState>(() => ({
  lastHotkeyAt: 0,
  hotkeyGuard: false,
  hook: null,
  learningHotkey: false,
  holdKeyActive: false,
  toggleKeyActive: false,
  hookListeners: { keydown: null, keyup: null },
  hookKeyMap: null,
  holdHotkeySpec: null,
  modifierKeycodes: new Set<number>(),
  transcribeQueue: [],
  transcribeRunning: false,
  accessibilityWarningShown: false,
  llmHistory: []
}));

export function getSessionState() {
  return store.getState();
}

export function setSessionState(partial: Partial<MainSessionState>) {
  store.setState(partial);
}
