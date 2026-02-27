import React from 'react';

type ToggleSwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
  disabled?: boolean;
};

export default function ToggleSwitch({ checked, onChange, ariaLabel = 'Toggle', disabled = false }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        onChange(!checked);
      }}
      className={`relative inline-flex h-7 w-12 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'border-emerald-300/60 bg-emerald-400/30' : 'border-white/20 bg-slate-900/70'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}
