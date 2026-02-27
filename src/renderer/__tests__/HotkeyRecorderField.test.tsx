import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import HotkeyRecorderField from '../components/HotkeyRecorderField';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <HotkeyRecorderField className="w-full" value={value} onChange={setValue} />;
}

afterEach(() => {
  cleanup();
});

describe('HotkeyRecorderField', () => {
  it('enters recording mode on focus', () => {
    render(<Harness />);
    const field = screen.getByRole('button', { name: /shortcut recorder/i });

    fireEvent.focus(field);

    expect(field.textContent).toContain('Press keys...');
  });

  it('captures a valid combo and calls onChange once', () => {
    const onChange = vi.fn();
    render(<HotkeyRecorderField className="w-full" value="" onChange={onChange} />);
    const field = screen.getByRole('button', { name: /shortcut recorder/i });

    fireEvent.focus(field);
    fireEvent.keyDown(field, { key: 'p', ctrlKey: true, shiftKey: true });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Control+Shift+P');
    expect(field.textContent).not.toContain('Press keys...');
  });

  it('cancels recording with Escape and keeps value unchanged', () => {
    render(<Harness initial="Control+Shift+P" />);
    const field = screen.getByRole('button', { name: /shortcut recorder/i });

    fireEvent.focus(field);
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(field.textContent).toContain('Control + Shift + P');
  });

  it('clears shortcut with Backspace', () => {
    render(<Harness initial="Control+Shift+P" />);
    const field = screen.getByRole('button', { name: /shortcut recorder/i });

    fireEvent.focus(field);
    fireEvent.keyDown(field, { key: 'Backspace' });

    expect(field.textContent).toContain('Click and press a shortcut');
  });

  it('stays capture-only and does not mutate from plain typing', () => {
    const onChange = vi.fn();
    render(<HotkeyRecorderField className="w-full" value="Control+Shift+P" onChange={onChange} />);
    const field = screen.getByRole('button', { name: /shortcut recorder/i });

    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.focus(field);
    fireEvent.keyDown(field, { key: 'p' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/at least one modifier key/i)).toBeDefined();

    fireEvent.keyDown(field, { key: 'Escape' });
    expect(field.textContent).toContain('Control + Shift + P');
  });
});
