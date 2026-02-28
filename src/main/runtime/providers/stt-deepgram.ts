import fs from 'node:fs/promises';
import { fetchFn } from '../../ctx.js';
import type { SecretsService } from '../secrets-service.js';
import type {
  ProviderStatus,
  SttProvider,
  SttTranscribeRequest,
  SttTranscribeResponse
} from '../types.js';
import { normalizeBaseEndpoint } from './common.js';
import { resolveSecretValue } from '../secret-refs.js';

function extractDeepgramText(payload: any): string {
  return String(payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim();
}

export function createDeepgramSttProvider(secrets: SecretsService): SttProvider {
  return {
    descriptor: {
      id: 'stt.remote.deepgram',
      capability: 'stt',
      displayName: 'Deepgram STT',
      kind: 'remote',
      requiresInstall: false,
      supportsLocalPath: false
    },

    async getStatus(): Promise<ProviderStatus> {
      return {
        providerId: 'stt.remote.deepgram',
        capability: 'stt',
        installed: true,
        health: 'healthy',
        message: 'Remote provider available'
      };
    },

    async transcribe(request: SttTranscribeRequest): Promise<SttTranscribeResponse> {
      if (!request.audioPath) throw new Error('audioPath is required');
      const profile = request.profile;
      const endpoint = normalizeBaseEndpoint(String(profile?.endpoint || ''), 'https://api.deepgram.com');
      const model = String(profile?.model || 'nova-2');
      const language = String(profile?.language || '');
      const token = await resolveSecretValue(secrets, {
        providerId: 'stt.remote.deepgram',
        secretRef: String(profile?.secretRef || ''),
        envVarNames: ['DEEPGRAM_API_KEY']
      });
      if (!token) throw new Error('Missing API key secret for Deepgram provider');

      const params = new URLSearchParams();
      params.set('model', model);
      if (language) params.set('language', language);
      const url = `${endpoint}/v1/listen?${params.toString()}`;

      const audio = await fs.readFile(request.audioPath);
      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': 'audio/webm'
        },
        body: audio
      } as any);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Deepgram STT failed ${response.status}: ${body || 'empty response'}`);
      }

      const data = await response.json();
      return { text: extractDeepgramText(data) };
    }
  };
}
