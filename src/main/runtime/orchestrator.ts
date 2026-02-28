import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  LlmRespondRequest,
  OcrExtractRequest,
  ProviderCapability,
  ProviderDescriptor,
  ProviderProfile,
  ProviderStatus,
  RuntimeConfig,
  SttTranscribeRequest
} from './types.js';
import { ProviderRegistry } from './provider-registry.js';
import { getActiveProviderConfig } from './runtime-config.js';
import type { SecretsService } from './secrets-service.js';
import type { InstallerService } from './installer-service.js';

export class RuntimeOrchestrator {
  constructor(
    private registry: ProviderRegistry,
    private secretsService: SecretsService,
    private installerService: InstallerService
  ) {}

  private runtimeConfig: RuntimeConfig | null = null;

  configure(config: RuntimeConfig): void {
    this.runtimeConfig = config;
  }

  listProviders(): Array<ProviderDescriptor & { active: boolean }> {
    const config = this.requireConfig();
    const descriptors = this.registry.list();
    return descriptors.map((descriptor) => ({
      ...descriptor,
      active: config.providers[descriptor.capability].activeProviderId === descriptor.id
    }));
  }

  async providerStatus(providerId: string): Promise<ProviderStatus> {
    const provider = this.registry.get(providerId);
    if (!provider) {
      return {
        providerId,
        capability: 'stt',
        installed: false,
        health: 'unavailable',
        message: `Unknown provider: ${providerId}`
      };
    }
    const base = await provider.getStatus();
    const installState = this.installerService.getInstallState(providerId);
    return {
      ...base,
      installed: base.installed || installState.installed,
      version: installState.version || base.version,
      details: {
        ...(base.details || {}),
        installState
      }
    };
  }

  async listProviderStatuses(): Promise<ProviderStatus[]> {
    const descriptors = this.registry.list();
    const results: ProviderStatus[] = [];
    for (const descriptor of descriptors) {
      results.push(await this.providerStatus(descriptor.id));
    }
    return results;
  }

  getActiveProviderProfile(capability: ProviderCapability): { providerId: string; profile: ProviderProfile | null } {
    const config = this.requireConfig();
    return getActiveProviderConfig(config, capability);
  }

  setActiveProvider(capability: ProviderCapability, providerId: string, profileId?: string): void {
    const config = this.requireConfig();
    const capabilityConfig = config.providers[capability];
    capabilityConfig.activeProviderId = providerId;
    if (profileId) {
      capabilityConfig.activeProfileId = profileId;
    } else {
      const firstProfile = capabilityConfig.profiles.find((profile) => profile.providerId === providerId);
      capabilityConfig.activeProfileId = firstProfile?.id;
    }
  }

  upsertProfile(capability: ProviderCapability, profile: ProviderProfile): void {
    const config = this.requireConfig();
    const capabilityConfig = config.providers[capability];
    const idx = capabilityConfig.profiles.findIndex((entry) => entry.id === profile.id);
    if (idx >= 0) capabilityConfig.profiles[idx] = profile;
    else capabilityConfig.profiles.push(profile);
  }

  async transcribe(request: SttTranscribeRequest): Promise<string> {
    const active = this.getActiveProviderProfile('stt');
    const provider = this.registry.getSttProvider(active.providerId);
    if (!provider) throw new Error(`Active STT provider unavailable: ${active.providerId}`);
    const response = await provider.transcribe({
      ...request,
      profile: request.profile || active.profile || undefined
    });
    return String(response.text || '').trim();
  }

  async transcribeFromFile(audioPath: string, extension = path.extname(audioPath) || '.webm'): Promise<string> {
    return this.transcribe({ audioPath, extension });
  }

  async transcribeFromBuffer(audioBuffer: Buffer, extension = '.webm'): Promise<string> {
    const tmpPath = path.join(os.tmpdir(), `tray-runtime-${Date.now()}-${randomUUID()}${extension}`);
    fs.writeFileSync(tmpPath, audioBuffer);
    try {
      return await this.transcribe({ audioPath: tmpPath, extension });
    } finally {
      fs.unlink(tmpPath, () => {});
    }
  }

  async respondLlm(request: LlmRespondRequest): Promise<string> {
    const active = this.getActiveProviderProfile('llm');
    const provider = this.registry.getLlmProvider(active.providerId);
    if (!provider) throw new Error(`Active LLM provider unavailable: ${active.providerId}`);
    const response = await provider.respond({
      ...request,
      profile: request.profile || active.profile || undefined
    });
    return String(response.text || '').trim();
  }

  async extractOcr(request: OcrExtractRequest): Promise<string> {
    const active = this.getActiveProviderProfile('ocr');
    const provider = this.registry.getOcrProvider(active.providerId);
    if (!provider) throw new Error(`Active OCR provider unavailable: ${active.providerId}`);
    const response = await provider.extractText({
      ...request,
      profile: request.profile || active.profile || undefined
    });
    return String(response.text || '').trim();
  }

  private requireConfig(): RuntimeConfig {
    if (!this.runtimeConfig) throw new Error('Runtime orchestrator not configured');
    return this.runtimeConfig;
  }

  get registryInstance(): ProviderRegistry {
    return this.registry;
  }

  get secrets(): SecretsService {
    return this.secretsService;
  }
}
