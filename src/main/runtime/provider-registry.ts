import type {
  AnyProvider,
  LlmProvider,
  OcrProvider,
  ProviderCapability,
  ProviderDescriptor,
  SttProvider
} from './types.js';

export class ProviderRegistry {
  private providers = new Map<string, AnyProvider>();

  register(provider: AnyProvider): void {
    this.providers.set(provider.descriptor.id, provider);
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  get(providerId: string): AnyProvider | null {
    return this.providers.get(providerId) || null;
  }

  getSttProvider(providerId: string): SttProvider | null {
    const provider = this.providers.get(providerId);
    if (!provider || provider.descriptor.capability !== 'stt') return null;
    return provider as SttProvider;
  }

  getLlmProvider(providerId: string): LlmProvider | null {
    const provider = this.providers.get(providerId);
    if (!provider || provider.descriptor.capability !== 'llm') return null;
    return provider as LlmProvider;
  }

  getOcrProvider(providerId: string): OcrProvider | null {
    const provider = this.providers.get(providerId);
    if (!provider || provider.descriptor.capability !== 'ocr') return null;
    return provider as OcrProvider;
  }

  list(capability?: ProviderCapability): ProviderDescriptor[] {
    const descriptors: ProviderDescriptor[] = [];
    for (const provider of this.providers.values()) {
      if (capability && provider.descriptor.capability !== capability) continue;
      descriptors.push(provider.descriptor);
    }
    return descriptors.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
}
