import { logger } from '../ctx.js';
import { ProviderRegistry } from './provider-registry.js';
import { RuntimeOrchestrator } from './orchestrator.js';
import { SecretsService } from './secrets-service.js';
import { InstallerService } from './installer-service.js';
import { LocalRuntimeApiServer } from './local-runtime-api.js';
import { normalizeRuntimeConfig } from './runtime-config.js';
import type { RuntimeConfig } from './types.js';
import { createLocalSttProvider } from './providers/stt-local-worker.js';
import { createOpenAiCompatibleSttProvider } from './providers/stt-openai-compatible.js';
import { createDeepgramSttProvider } from './providers/stt-deepgram.js';
import { createGoogleSttProvider } from './providers/stt-google.js';
import { createOpenAiCompatibleLlmProvider } from './providers/llm-openai-compatible.js';
import { createOllamaLlmProvider } from './providers/llm-ollama.js';
import { createLlmVisionRuntimeProvider } from './providers/ocr-llm-vision.js';
import { createLocalTesseractRuntimeProvider } from './providers/ocr-local-tesseract.js';

let registry: ProviderRegistry | null = null;
let secretsService: SecretsService | null = null;
let installerService: InstallerService | null = null;
let runtimeOrchestrator: RuntimeOrchestrator | null = null;
let runtimeApiServer: LocalRuntimeApiServer | null = null;

function ensureInitialized(): void {
  if (runtimeOrchestrator && runtimeApiServer && registry && secretsService && installerService) return;

  registry = new ProviderRegistry();
  secretsService = new SecretsService();
  installerService = new InstallerService();
  runtimeOrchestrator = new RuntimeOrchestrator(registry, secretsService, installerService);
  runtimeApiServer = new LocalRuntimeApiServer(runtimeOrchestrator, installerService);

  registry.register(createLocalSttProvider('whisperx'));
  registry.register(createLocalSttProvider('whisper'));
  registry.register(createLocalSttProvider('faster-whisper'));
  registry.register(createOpenAiCompatibleSttProvider(secretsService));
  registry.register(createDeepgramSttProvider(secretsService));
  registry.register(createGoogleSttProvider(secretsService));

  const openAiFactory = createOpenAiCompatibleLlmProvider('llm.openai_compatible', 'OpenAI-compatible LLM', 'https://api.openai.com');
  const lmStudioFactory = createOpenAiCompatibleLlmProvider('llm.lmstudio', 'LM Studio', 'http://127.0.0.1:1234');
  registry.register(openAiFactory(secretsService));
  registry.register(lmStudioFactory(secretsService));
  registry.register(createOllamaLlmProvider());

  registry.register(createLlmVisionRuntimeProvider(secretsService));
  registry.register(createLocalTesseractRuntimeProvider());
}

export function normalizeConfigForRuntime(rawConfig: any): RuntimeConfig {
  return normalizeRuntimeConfig(rawConfig);
}

export async function configureRuntimeServices(rawConfig: any): Promise<RuntimeConfig> {
  ensureInitialized();
  const normalized = normalizeRuntimeConfig(rawConfig);

  installerService!.configure(normalized);
  runtimeOrchestrator!.configure(normalized);
  runtimeApiServer!.configure(normalized);

  if (normalized.runtimeApi.enabled) {
    try {
      await runtimeApiServer!.restart();
    } catch (err: any) {
      logger?.error?.('[runtime-api] failed to start', err?.message || String(err));
    }
  } else {
    await runtimeApiServer!.stop();
  }

  return normalized;
}

export function getRuntimeOrchestrator(): RuntimeOrchestrator {
  ensureInitialized();
  return runtimeOrchestrator!;
}

export function getInstallerService(): InstallerService {
  ensureInitialized();
  return installerService!;
}

export function getSecretsService(): SecretsService {
  ensureInitialized();
  return secretsService!;
}

export function getRuntimeApiServer(): LocalRuntimeApiServer {
  ensureInitialized();
  return runtimeApiServer!;
}

export async function shutdownRuntimeServices(): Promise<void> {
  if (runtimeApiServer) {
    await runtimeApiServer.stop();
  }
}
