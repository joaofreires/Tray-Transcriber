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

function extractGoogleText(payload: any): string {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const chunks: string[] = [];
  for (const result of results) {
    const transcript = result?.alternatives?.[0]?.transcript;
    if (typeof transcript === 'string' && transcript.trim()) {
      chunks.push(transcript.trim());
    }
  }
  return chunks.join(' ').trim();
}

export function createGoogleSttProvider(secrets: SecretsService): SttProvider {
  return {
    descriptor: {
      id: 'stt.remote.google',
      capability: 'stt',
      displayName: 'Google STT',
      kind: 'remote',
      requiresInstall: false,
      supportsLocalPath: false
    },

    async getStatus(): Promise<ProviderStatus> {
      return {
        providerId: 'stt.remote.google',
        capability: 'stt',
        installed: true,
        health: 'healthy',
        message: 'Remote provider available'
      };
    },

    async transcribe(request: SttTranscribeRequest): Promise<SttTranscribeResponse> {
      if (!request.audioPath) throw new Error('audioPath is required');
      const profile = request.profile;
      const endpoint = normalizeBaseEndpoint(String(profile?.endpoint || ''), 'https://speech.googleapis.com');
      const model = String(profile?.model || 'latest_long');
      const languageCode = String(profile?.language || 'en-US');
      const apiKey = await resolveSecretValue(secrets, {
        providerId: 'stt.remote.google',
        secretRef: String(profile?.secretRef || ''),
        envVarNames: ['GOOGLE_API_KEY']
      });
      if (!apiKey) throw new Error('Missing API key secret for Google STT provider');

      const audio = await fs.readFile(request.audioPath);
      const audioBase64 = audio.toString('base64');
      const url = `${endpoint}/v1/speech:recognize?key=${encodeURIComponent(apiKey)}`;
      const body = {
        config: {
          encoding: 'WEBM_OPUS',
          languageCode,
          model
        },
        audio: {
          content: audioBase64
        }
      };

      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      } as any);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Google STT failed ${response.status}: ${text || 'empty response'}`);
      }

      const data = await response.json();
      return { text: extractGoogleText(data) };
    }
  };
}
