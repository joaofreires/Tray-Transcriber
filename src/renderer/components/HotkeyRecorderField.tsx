import React, { useMemo, useState } from 'react';
import { captureHotkeyFromEvent, formatAcceleratorForDisplay } from './hotkey-accelerator';

export type HotkeyRecorderFieldProps = {
  value: string;
  onChange: (next: string) => void;
  className: string;
  placeholder?: string;
  ariaLabel?: string;
};

export default function HotkeyRecorderField({
  value,
  onChange,
  className,
  placeholder = 'Click and press a shortcut',
  ariaLabel = 'Shortcut recorder'
}: HotkeyRecorderFieldProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayValue = useMemo(() => {
    if (isRecording) return 'Press keys...';
    if (value?.trim()) return formatAcceleratorForDisplay(value);
    return placeholder;
  }, [isRecording, placeholder, value]);

  const isPlaceholder = !isRecording && !value?.trim();

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={`${className} text-left ${isRecording ? 'border-sky-400 ring-1 ring-sky-400/40' : ''} ${
          isPlaceholder ? 'text-white/40' : 'text-white'
        }`}
        onFocus={() => {
          setIsRecording(true);
          setError(null);
        }}
        onClick={() => {
          setIsRecording(true);
          setError(null);
        }}
        onBlur={() => {
          setIsRecording(false);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.repeat) {
            event.preventDefault();
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          const result = captureHotkeyFromEvent(event.nativeEvent);

          if (result.kind === 'cancel') {
            setIsRecording(false);
            setError(null);
            return;
          }

          if (result.kind === 'clear') {
            onChange('');
            setIsRecording(false);
            setError(null);
            return;
          }

          if (result.kind === 'error') {
            setIsRecording(true);
            setError(result.message);
            return;
          }

          onChange(result.accelerator);
          setIsRecording(false);
          setError(null);
        }}
        aria-label={ariaLabel}
      >
        {displayValue}
      </button>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {!error && isRecording && (
        <p className="text-xs text-white/60">Press a key combo. Esc cancels. Backspace/Delete clears.</p>
      )}
    </div>
  );
}
