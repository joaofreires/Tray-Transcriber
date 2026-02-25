import React from 'react';
import type { ThemeMode } from '../theme/useThemeMode';

type ThemeToggleProps = {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
};

const THEME_OPTIONS: Array<{ label: string; value: ThemeMode }> = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' }
];

export default function ThemeToggle({ value, onChange }: ThemeToggleProps) {
  return (
    <div className="inline-flex border border-gray-200 dark:border-gray-700 dark:border-gray-600 bg-gray-100 dark:bg-slate-700 rounded-full p-1 gap-1" role="group" aria-label="Select theme mode">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`bg-transparent text-gray-500 dark:text-gray-400 text-xs font-semibold rounded-full px-2 py-1 cursor-pointer ${
            value === option.value ? 'text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-800 shadow' : ''
          }`}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
