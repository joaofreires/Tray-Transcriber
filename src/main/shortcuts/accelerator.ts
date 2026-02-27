const ELECTRON_MODIFIER_ALIASES: Record<string, string> = {
  command: 'Command',
  cmd: 'Command',
  control: 'Control',
  ctrl: 'Control',
  option: 'Alt',
  alt: 'Alt',
  shift: 'Shift',
  commandorcontrol: 'CommandOrControl'
};

const ELECTRON_MAIN_KEY_ALIASES: Record<string, string> = {
  return: 'Return',
  enter: 'Return',
  esc: 'Escape',
  arrowleft: 'Left',
  left: 'Left',
  arrowup: 'Up',
  up: 'Up',
  arrowright: 'Right',
  right: 'Right',
  arrowdown: 'Down',
  down: 'Down',
  printscreen: 'PrintScreen',
  prtsc: 'PrintScreen',
  sysrq: 'PrintScreen',
  semicolon: ';',
  equal: '=',
  comma: ',',
  minus: '-',
  period: '.',
  slash: '/',
  backquote: '`',
  backtick: '`',
  bracketleft: '[',
  backslash: '\\',
  bracketright: ']',
  quote: "'",
  apostrophe: "'"
};

function normalizeModifierToken(token: string): string {
  const value = String(token || '').trim();
  if (!value) return value;
  const alias = ELECTRON_MODIFIER_ALIASES[value.toLowerCase()];
  return alias || value;
}

function normalizeMainKeyToken(token: string): string {
  const value = String(token || '').trim();
  if (!value) return value;
  const alias = ELECTRON_MAIN_KEY_ALIASES[value.toLowerCase()];
  return alias || value;
}

export function toElectronAccelerator(accelerator: string): string {
  const parts = String(accelerator || '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return '';
  if (parts.length === 1) return normalizeMainKeyToken(parts[0]);

  const main = normalizeMainKeyToken(parts[parts.length - 1]);
  const modifiers = parts.slice(0, -1).map((part) => normalizeModifierToken(part));
  return [...modifiers, main].join('+');
}
