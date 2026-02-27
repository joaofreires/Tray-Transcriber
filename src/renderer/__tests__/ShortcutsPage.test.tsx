import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShortcutsPage from '../shortcuts/ShortcutsPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ShortcutsPage', () => {
  it('renders active switch toggle and adds a shortcut via main add button', async () => {
    const getConfig = vi.fn().mockResolvedValue({
      shortcutsVersion: 2,
      shortcutDefaults: {
        assistantInputMode: 'prompt_plus_selection',
        textOutputMode: 'paste_then_clipboard',
        ocrProviderId: ''
      },
      ocr: {
        mode: 'llm_vision'
      },
      shortcuts: [
        {
          id: 'one',
          label: 'One',
          enabled: true,
          shortcut: 'Control+Shift+O',
          steps: [{ stepType: 'record_toggle' }]
        }
      ]
    });

    const updateConfig = vi.fn().mockResolvedValue({ ok: true });

    (window as any).trayTranscriber = {
      getConfig,
      updateConfig
    };

    render(<ShortcutsPage />);

    await waitFor(() => expect(screen.getByText(/Active OCR mode from LLM Assistant/i)).toBeDefined());

    const toggle = screen.getByRole('switch', { name: /toggle shortcut one/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: /add new shortcut/i }));
    fireEvent.click(screen.getByRole('button', { name: /save shortcuts/i }));

    await waitFor(() => expect(updateConfig).toHaveBeenCalledTimes(1));
    const payload = updateConfig.mock.calls[0][0];
    expect(Array.isArray(payload.shortcuts)).toBe(true);
    expect(payload.shortcuts.length).toBe(2);
  });

  it('renders save warnings returned by config save', async () => {
    const getConfig = vi.fn().mockResolvedValue({
      shortcutsVersion: 2,
      shortcutDefaults: {
        assistantInputMode: 'prompt_plus_selection',
        textOutputMode: 'paste_then_clipboard',
        ocrProviderId: ''
      },
      ocr: {
        mode: 'llm_vision'
      },
      shortcuts: [
        {
          id: 'one',
          label: 'One',
          enabled: true,
          shortcut: 'PrintScreen',
          steps: [
            { stepType: 'assistant_prompt', prompt: 'rewrite' },
            { stepType: 'output_text' }
          ]
        }
      ]
    });

    const updateConfig = vi.fn().mockResolvedValue({
      ok: true,
      warnings: [
        {
          code: 'SHORTCUT_RESERVED_OR_UNAVAILABLE',
          message: 'Shortcut "One" could not register. PrintScreen is likely reserved by the OS.'
        }
      ]
    });

    (window as any).trayTranscriber = {
      getConfig,
      updateConfig
    };

    render(<ShortcutsPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /save shortcuts/i })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /save shortcuts/i }));
    await waitFor(() => expect(updateConfig).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/saved with warnings/i)).toBeDefined();
    expect(screen.getByText(/printscreen is likely reserved by the os/i)).toBeDefined();
  });
});
