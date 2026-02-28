import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useConfigSync } from '../hooks/useConfigSync';

type TestConfig = {
  value: string;
  note?: string;
};

function normalizeConfig(raw: any): { value: string } {
  return { value: String(raw?.value ?? '') };
}

let configChangedListener: ((payload: any) => void) | null = null;

function emitConfigChanged(config: TestConfig): void {
  configChangedListener?.({
    changedKeys: ['value'],
    config,
    sourceWindowType: 'config'
  });
}

function Harness() {
  const [baseConfig, setBaseConfig] = useState<TestConfig>({ value: 'initial', note: 'one' });
  const [draft, setDraft] = useState<{ value: string }>(normalizeConfig(baseConfig));
  const { hasExternalUpdate, reloadFromLatest } = useConfigSync({
    baseConfig,
    draft,
    setBaseConfig,
    setDraft,
    normalizeDraft: normalizeConfig
  });

  return (
    <div>
      <div data-testid="draft-value">{draft.value}</div>
      <div data-testid="external-update">{hasExternalUpdate ? 'yes' : 'no'}</div>
      <button onClick={() => setDraft({ value: 'local-edit' })}>edit</button>
      <button onClick={reloadFromLatest}>reload</button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  configChangedListener = null;
  (window as any).trayTranscriber = undefined;
});

describe('useConfigSync', () => {
  it('auto-refreshes when form is clean', () => {
    (window as any).trayTranscriber = {
      onConfigChanged: (cb: (payload: any) => void) => {
        configChangedListener = cb;
        return () => {
          if (configChangedListener === cb) configChangedListener = null;
        };
      }
    };

    render(<Harness />);
    expect(screen.getByTestId('draft-value').textContent).toBe('initial');

    act(() => {
      emitConfigChanged({ value: 'remote-clean' });
    });

    expect(screen.getByTestId('draft-value').textContent).toBe('remote-clean');
    expect(screen.getByTestId('external-update').textContent).toBe('no');
  });

  it('keeps dirty edits and marks external update notice', () => {
    (window as any).trayTranscriber = {
      onConfigChanged: (cb: (payload: any) => void) => {
        configChangedListener = cb;
        return () => {
          if (configChangedListener === cb) configChangedListener = null;
        };
      }
    };

    render(<Harness />);
    fireEvent.click(screen.getByText('edit'));
    expect(screen.getByTestId('draft-value').textContent).toBe('local-edit');

    act(() => {
      emitConfigChanged({ value: 'remote-dirty' });
    });

    expect(screen.getByTestId('draft-value').textContent).toBe('local-edit');
    expect(screen.getByTestId('external-update').textContent).toBe('yes');
  });

  it('reloads latest external config on demand', () => {
    (window as any).trayTranscriber = {
      onConfigChanged: (cb: (payload: any) => void) => {
        configChangedListener = cb;
        return () => {
          if (configChangedListener === cb) configChangedListener = null;
        };
      }
    };

    render(<Harness />);
    fireEvent.click(screen.getByText('edit'));

    act(() => {
      emitConfigChanged({ value: 'remote-new' });
    });
    expect(screen.getByTestId('external-update').textContent).toBe('yes');

    fireEvent.click(screen.getByText('reload'));
    expect(screen.getByTestId('draft-value').textContent).toBe('remote-new');
    expect(screen.getByTestId('external-update').textContent).toBe('no');
  });
});
