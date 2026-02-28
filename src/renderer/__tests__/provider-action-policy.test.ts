import { describe, expect, it } from 'vitest';
import { resolveProviderActions } from '../settings/providers/action-policy';

describe('resolveProviderActions', () => {
  it('returns Use + Configure for API providers that do not require install', () => {
    const actions = resolveProviderActions({
      id: 'llm.openai_compatible',
      capability: 'llm',
      displayName: 'OpenAI-compatible',
      kind: 'remote',
      requiresInstall: false,
      supportsLocalPath: false
    });

    expect(actions).toEqual(['use', 'configure']);
  });

  it('returns install lifecycle actions for installable providers', () => {
    const actions = resolveProviderActions({
      id: 'llm.lmstudio',
      capability: 'llm',
      displayName: 'LM Studio',
      kind: 'local',
      requiresInstall: true,
      supportsLocalPath: true
    });

    expect(actions).toEqual(['use', 'configure', 'install', 'update', 'remove', 'use_existing']);
  });
});
