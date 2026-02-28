import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProviderCatalogTab from '../settings/providers/ProviderCatalogTab';
import { emptyConfig, type ProviderDescriptor, type ProviderStatus } from '../settings/types';

function renderCatalog(provider: ProviderDescriptor, status?: ProviderStatus) {
  cleanup();
  const draft = emptyConfig();
  draft.providers[provider.capability].activeProviderId = provider.id;

  render(
    <ProviderCatalogTab
      draft={draft}
      providers={[provider]}
      statuses={status ? { [provider.id]: status } : {}}
      onUseProvider={vi.fn().mockResolvedValue(undefined)}
      onRunInstallAction={vi.fn().mockResolvedValue(undefined)}
      onConfigureProvider={vi.fn()}
    />
  );
}

describe('ProviderCatalogTab', () => {
  it('renders only Use + Configure actions for non-installable API providers', () => {
    renderCatalog(
      {
        id: 'llm.openai_compatible',
        capability: 'llm',
        displayName: 'OpenAI-compatible',
        kind: 'remote',
        requiresInstall: false,
        supportsLocalPath: false
      },
      {
        providerId: 'llm.openai_compatible',
        installed: true,
        health: 'healthy',
        message: 'Connected'
      }
    );

    expect(screen.getByRole('button', { name: 'Use' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Configure' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.getByText(/Connection:/)).toBeTruthy();
  });

  it('renders install lifecycle actions for installable providers', () => {
    renderCatalog(
      {
        id: 'llm.lmstudio',
        capability: 'llm',
        displayName: 'LM Studio',
        kind: 'local',
        requiresInstall: true,
        supportsLocalPath: true
      },
      {
        providerId: 'llm.lmstudio',
        installed: false,
        health: 'unavailable',
        message: 'Not installed'
      }
    );

    expect(screen.getByRole('button', { name: 'Use' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Configure' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use existing' })).toBeTruthy();
    expect(screen.getByText(/Install:/)).toBeTruthy();
  });
});
