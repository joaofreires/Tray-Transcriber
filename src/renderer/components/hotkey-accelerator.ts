export type KeyboardEventLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

export type HotkeyCaptureResult =
  | { kind: 'set'; accelerator: string; display: string }
  | { kind: 'clear' }
  | { kind: 'cancel' }
  | { kind: 'error'; message: string };

const MODIFIER_ONLY_KEYS = new Set([
  'alt',
  'altgraph',
  'command',
  'cmd',
  'control',
  'ctrl',
  'meta',
  'os',
  'shift',
  'super'
]);

function isMacPlatform(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.platform === 'string') {
    return /mac/i.test(navigator.platform);
  }
  return false;
}

function isModifierOnlyKey(key: string): boolean {
  return MODIFIER_ONLY_KEYS.has(key.toLowerCase());
}

const MAIN_KEY_BY_SYMBOL: Record<string, string> = {
  ';': 'Semicolon',
  '=': 'Equal',
  ',': 'Comma',
  '-': 'Minus',
  '.': 'Period',
  '/': 'Slash',
  '`': 'Backquote',
  '[': 'BracketLeft',
  '\\': 'Backslash',
  ']': 'BracketRight',
  "'": 'Quote'
};

const DISPLAY_MAIN_KEY_BY_NAME: Record<string, string> = {
  Semicolon: ';',
  Equal: '=',
  Comma: ',',
  Minus: '-',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  BracketLeft: '[',
  Backslash: '\\',
  BracketRight: ']',
  Quote: "'",
  PrintScreen: 'PrintScreen'
};

const MAIN_KEY_BY_NAME: Record<string, string> = {
  space: 'Space',
  spacebar: 'Space',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  escape: 'Escape',
  esc: 'Escape',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  ins: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  printscreen: 'PrintScreen',
  prtsc: 'PrintScreen',
  sysrq: 'PrintScreen',
  arrowleft: 'ArrowLeft',
  left: 'ArrowLeft',
  arrowup: 'ArrowUp',
  up: 'ArrowUp',
  arrowright: 'ArrowRight',
  right: 'ArrowRight',
  arrowdown: 'ArrowDown',
  down: 'ArrowDown',
  semicolon: 'Semicolon',
  equal: 'Equal',
  comma: 'Comma',
  minus: 'Minus',
  period: 'Period',
  slash: 'Slash',
  backquote: 'Backquote',
  backtick: 'Backquote',
  bracketleft: 'BracketLeft',
  backslash: 'Backslash',
  bracketright: 'BracketRight',
  quote: 'Quote',
  apostrophe: 'Quote'
};

const MAIN_KEY_BY_CODE: Record<string, string> = {
  Backspace: 'Backspace',
  Tab: 'Tab',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Escape: 'Escape',
  Space: 'Space',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  End: 'End',
  Home: 'Home',
  ArrowLeft: 'ArrowLeft',
  ArrowUp: 'ArrowUp',
  ArrowRight: 'ArrowRight',
  ArrowDown: 'ArrowDown',
  Insert: 'Insert',
  Delete: 'Delete',
  PrintScreen: 'PrintScreen',
  SysRq: 'PrintScreen',
  Semicolon: 'Semicolon',
  Equal: 'Equal',
  Comma: 'Comma',
  Minus: 'Minus',
  Period: 'Period',
  Slash: 'Slash',
  Backquote: 'Backquote',
  BracketLeft: 'BracketLeft',
  Backslash: 'Backslash',
  BracketRight: 'BracketRight',
  Quote: 'Quote'
};

for (let digit = 0; digit <= 9; digit += 1) {
  MAIN_KEY_BY_CODE[`Digit${digit}`] = String(digit);
  MAIN_KEY_BY_CODE[`Numpad${digit}`] = String(digit);
}
for (let fn = 1; fn <= 24; fn += 1) {
  MAIN_KEY_BY_CODE[`F${fn}`] = `F${fn}`;
}

function normalizeMainKey(key: string, code?: string): string | null {
  const value = String(key || '').trim();
  if (!value) return null;

  if (/^[a-z]$/i.test(value)) {
    return value.toUpperCase();
  }

  if (/^[0-9]$/.test(value)) {
    return value;
  }

  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(value)) {
    return value.toUpperCase();
  }

  if (MAIN_KEY_BY_SYMBOL[value]) {
    return MAIN_KEY_BY_SYMBOL[value];
  }

  const lower = value.toLowerCase();
  if (MAIN_KEY_BY_NAME[lower]) {
    return MAIN_KEY_BY_NAME[lower];
  }

  const normalizedCode = String(code || '').trim();
  if (normalizedCode && MAIN_KEY_BY_CODE[normalizedCode]) {
    return MAIN_KEY_BY_CODE[normalizedCode];
  }

  return null;
}

function canonicalizeModifierToken(token: string): string {
  const lower = token.toLowerCase();
  if (lower === 'cmd' || lower === 'command') return 'Command';
  if (lower === 'ctrl' || lower === 'control') return 'Control';
  if (lower === 'option' || lower === 'alt') return 'Alt';
  if (lower === 'commandorcontrol') return 'CommandOrControl';
  if (lower === 'shift') return 'Shift';
  return token;
}

function canonicalizeMainKeyToken(token: string): string {
  const value = String(token || '').trim();
  if (!value) return value;
  const canonical = normalizeMainKey(value, value) || value;
  return DISPLAY_MAIN_KEY_BY_NAME[canonical] || canonical;
}

function buildModifierTokens(
  flags: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean },
  isMac: boolean
): string[] {
  const tokens: string[] = [];
  if (isMac) {
    if (flags.metaKey) tokens.push('Command');
    if (flags.ctrlKey) tokens.push('Control');
    if (flags.altKey) tokens.push('Alt');
    if (flags.shiftKey) tokens.push('Shift');
    return tokens;
  }

  if (flags.ctrlKey) tokens.push('Control');
  if (flags.altKey) tokens.push('Alt');
  if (flags.shiftKey) tokens.push('Shift');
  if (flags.metaKey) tokens.push('Command');
  return tokens;
}

export function formatAcceleratorForDisplay(accelerator: string): string {
  if (!accelerator) return '';
  const parts = accelerator
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return '';

  const displayParts = parts.map((part, index) => {
    if (index === parts.length - 1) {
      return canonicalizeMainKeyToken(part);
    }
    return canonicalizeModifierToken(part);
  });

  return displayParts.join(' + ');
}

export function captureHotkeyFromEvent(event: KeyboardEventLike, options?: { isMac?: boolean }): HotkeyCaptureResult {
  const key = String(event?.key ?? '');
  const lower = key.toLowerCase();

  const hasModifier = !!(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey);

  if (!hasModifier) {
    if (lower === 'escape' || lower === 'esc') {
      return { kind: 'cancel' };
    }
    if (lower === 'backspace' || lower === 'delete') {
      return { kind: 'clear' };
    }
  }

  if (isModifierOnlyKey(key)) {
    return { kind: 'error', message: 'Shortcut must include a non-modifier key.' };
  }

  const mainKey = normalizeMainKey(key, event?.code);
  if (!mainKey) {
    return {
      kind: 'error',
      message:
        'Unsupported key. Use letters, digits, F1-F24, PrintScreen, navigation keys, or named punctuation keys like Semicolon/Equal/Comma/Minus/Period/Slash.'
    };
  }

  if (!hasModifier && mainKey !== 'PrintScreen') {
    return { kind: 'error', message: 'Include at least one modifier key (Ctrl/Cmd, Alt, or Shift).' };
  }

  const isMac = typeof options?.isMac === 'boolean' ? options.isMac : isMacPlatform();
  const tokens = buildModifierTokens(
    {
      ctrlKey: !!event.ctrlKey,
      metaKey: !!event.metaKey,
      altKey: !!event.altKey,
      shiftKey: !!event.shiftKey
    },
    isMac
  );

  const accelerator = [...tokens, mainKey].join('+');
  return {
    kind: 'set',
    accelerator,
    display: formatAcceleratorForDisplay(accelerator)
  };
}
