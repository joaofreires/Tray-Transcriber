import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProvidersPanel from '../settings/providers/ProvidersPanel';
import { emptyConfig, type ProviderDescriptor } from '../settings/types';

const baseProvider: ProviderDescriptor = {
  id: 'llm.openai_compatible',
  capability: 'llm',
  displayName: 'OpenAI-compatible',
  kind: 'remote',
  requiresInstall: false,
  supportsLocalPath: false
};

function renderPanel(installableProviders: ProviderDescriptor[], jobs: any[] = []) {
  cleanup();
  const draft = emptyConfig();
  render(
    <ProvidersPanel
      draft={draft}
      providers={[baseProvider]}
      statuses={{}}
      jobs={jobs as any}
      installableProviders={installableProviders}
      onUseProvider={vi.fn().mockResolvedValue(undefined)}
      onRunInstallAction={vi.fn().mockResolvedValue(undefined)}
      onUpsertProfile={vi.fn()}
      onSaveProfileSecret={vi.fn().mockResolvedValue(undefined)}
      onCheckUpdates={vi.fn().mockResolvedValue(undefined)}
    />
  );
}

describe('ProvidersPanel tabs', () => {
  it('hides Install Jobs tab when no jobs and no installable providers', () => {
    renderPanel([], []);
    expect(screen.getByRole('button', { name: 'Catalog' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Profiles' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install Jobs' })).toBeNull();
  });

  it('shows Install Jobs tab when installable providers exist', () => {
    renderPanel([
      {
        id: 'llm.lmstudio',
        capability: 'llm',
        displayName: 'LM Studio',
        kind: 'local',
        requiresInstall: true,
        supportsLocalPath: true
      }
    ]);

    expect(screen.getByRole('button', { name: 'Install Jobs' })).toBeTruthy();
  });

  it('switches between Catalog and Profiles subtabs', async () => {
    renderPanel([], []);

    expect(screen.getByText('OpenAI-compatible')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Profiles' }));
    expect(screen.getByText(/Speech-to-Text Profiles/i)).toBeTruthy();
  });
});
