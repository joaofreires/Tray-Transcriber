import fs from 'node:fs';
import { runWhisperX } from '../../worker-manager.js';
import { resolvePythonCommand, resolveWorkerScriptPath } from '../../resolve.js';
import { config } from '../../ctx.js';
import type {
  ProviderDescriptor,
  ProviderProfile,
  ProviderStatus,
  SttProvider,
  SttTranscribeRequest,
  SttTranscribeResponse
} from '../types.js';
import { profileOptionBoolean, profileOptionNumber, profileOptionString } from './common.js';

function descriptorFor(engine: 'whisperx' | 'whisper' | 'faster-whisper'): ProviderDescriptor & { capability: 'stt' } {
  return {
    id: engine === 'faster-whisper' ? 'stt.local.faster_whisper' : `stt.local.${engine}`,
    capability: 'stt',
    displayName: engine === 'faster-whisper' ? 'Local faster-whisper' : `Local ${engine}`,
    kind: 'local',
    requiresInstall: true,
    supportsLocalPath: true
  };
}

function toOverrides(engine: 'whisperx' | 'whisper' | 'faster-whisper', profile?: ProviderProfile): Record<string, any> {
  const defaults = config?.providers?.stt?.profiles?.find((entry: any) => entry?.providerId === descriptorFor(engine).id);
  const merged = {
    ...(defaults?.options || {}),
    ...(profile?.options || {})
  };

  return {
    asrEngine: engine,
    model: String(profile?.model || defaults?.model || 'small'),
    language: String(profile?.language || defaults?.language || 'en'),
    device: profileOptionString({ ...profile, options: merged }, 'device', 'default'),
    computeType: profileOptionString({ ...profile, options: merged }, 'computeType', 'int8'),
    batchSize: profileOptionNumber({ ...profile, options: merged }, 'batchSize', 4),
    noAlign: profileOptionBoolean({ ...profile, options: merged }, 'noAlign', true),
    useWorker: profileOptionBoolean({ ...profile, options: merged }, 'useWorker', true),
    workerWarmup: profileOptionBoolean({ ...profile, options: merged }, 'workerWarmup', true),
    workerTransport: profileOptionString({ ...profile, options: merged }, 'workerTransport', 'stdio') || 'stdio',
    workerHost: profileOptionString({ ...profile, options: merged }, 'workerHost', '127.0.0.1'),
    workerPort: profileOptionNumber({ ...profile, options: merged }, 'workerPort', 8765),
    workerRequestTimeoutMs: profileOptionNumber({ ...profile, options: merged }, 'workerRequestTimeoutMs', 600000),
    workerStatusPollMs: profileOptionNumber({ ...profile, options: merged }, 'workerStatusPollMs', 30000),
    workerStartupTimeoutMs: profileOptionNumber({ ...profile, options: merged }, 'workerStartupTimeoutMs', 15000)
  };
}

export function createLocalSttProvider(engine: 'whisperx' | 'whisper' | 'faster-whisper'): SttProvider {
  const descriptor = descriptorFor(engine);

  return {
    descriptor,
    async getStatus(): Promise<ProviderStatus> {
      const python = resolvePythonCommand();
      const script = resolveWorkerScriptPath();
      const scriptExists = !!script && fs.existsSync(script);
      return {
        providerId: descriptor.id,
        capability: descriptor.capability,
        installed: scriptExists,
        health: scriptExists ? 'healthy' : 'unavailable',
        message: scriptExists ? `Ready via ${python}` : 'worker.py not found',
        details: {
          python,
          workerScript: script || ''
        }
      };
    },

    async transcribe(request: SttTranscribeRequest): Promise<SttTranscribeResponse> {
      const audioPath = request.audioPath;
      if (!audioPath) throw new Error('audioPath is required for local STT provider');
      const overrides = toOverrides(engine, request.profile);
      const previousValues: Record<string, any> = {};
      for (const key of Object.keys(overrides)) {
        previousValues[key] = config?.[key];
      }
      Object.assign(config, overrides);
      try {
        const text = await runWhisperX(audioPath);
        return { text: String(text || '') };
      } finally {
        for (const key of Object.keys(overrides)) {
          const previous = previousValues[key];
          if (previous === undefined) delete config[key];
          else config[key] = previous;
        }
      }
    }
  };
}
