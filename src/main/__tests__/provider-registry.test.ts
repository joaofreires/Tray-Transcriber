import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from '../runtime/provider-registry.js';

describe('ProviderRegistry', () => {
  it('registers and lists providers by capability', () => {
    const registry = new ProviderRegistry();
    registry.register({
      descriptor: {
        id: 'stt.local.test',
        capability: 'stt',
        displayName: 'Test STT',
        kind: 'local',
        requiresInstall: false,
        supportsLocalPath: false
      },
      getStatus: async () => ({ providerId: 'stt.local.test', capability: 'stt', installed: true, health: 'healthy' }),
      transcribe: async () => ({ text: 'ok' })
    } as any);
    registry.register({
      descriptor: {
        id: 'llm.remote.test',
        capability: 'llm',
        displayName: 'Test LLM',
        kind: 'remote',
        requiresInstall: false,
        supportsLocalPath: false
      },
      getStatus: async () => ({ providerId: 'llm.remote.test', capability: 'llm', installed: true, health: 'healthy' }),
      respond: async () => ({ text: 'ok' })
    } as any);

    expect(registry.list().length).toBe(2);
    expect(registry.list('stt').map((entry) => entry.id)).toEqual(['stt.local.test']);
    expect(registry.getSttProvider('stt.local.test')?.descriptor.id).toBe('stt.local.test');
    expect(registry.getLlmProvider('llm.remote.test')?.descriptor.id).toBe('llm.remote.test');
  });
});
