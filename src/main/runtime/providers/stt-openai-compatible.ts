import fs from 'node:fs/promises';
import type {
  ProviderStatus,
  SttProvider,
  SttTranscribeRequest,
  SttTranscribeResponse
} from '../types.js';
import type { SecretsService } from '../secrets-service.js';
import { fetchFn } from '../../ctx.js';
import { appendPath, normalizeBaseEndpoint } from './common.js';
import { resolveSecretValue } from '../secret-refs.js';

function parseTranscribeText(payload: any): string {
  if (typeof payload?.text === 'string') return payload.text;
  if (typeof payload?.output_text === 'string') return payload.output_text;
  if (typeof payload?.transcript === 'string') return payload.transcript;
  return '';
}

export function createOpenAiCompatibleSttProvider(secrets: SecretsService): SttProvider {
  return {
    descriptor: {
      id: 'stt.remote.openai_compatible',
      capability: 'stt',
      displayName: 'OpenAI-compatible STT',
      kind: 'remote',
      requiresInstall: false,
      supportsLocalPath: false
    },

    async getStatus(): Promise<ProviderStatus> {
      return {
        providerId: 'stt.remote.openai_compatible',
        capability: 'stt',
        installed: true,
        health: 'healthy',
        message: 'Remote provider available'
      };
    },

    async transcribe(request: SttTranscribeRequest): Promise<SttTranscribeResponse> {
      if (!request.audioPath) throw new Error('audioPath is required');
      const profile = request.profile;
      const endpoint = normalizeBaseEndpoint(String(profile?.endpoint || ''), 'https://api.openai.com');
      const url = appendPath(endpoint, '/v1/audio/transcriptions');
      const model = String(profile?.model || 'gpt-4o-mini-transcribe');
      const token = await resolveSecretValue(secrets, {
        providerId: 'stt.remote.openai_compatible',
        secretRef: String(profile?.secretRef || ''),
        envVarNames: ['OPENAI_API_KEY']
      });
      if (!token) throw new Error('Missing API key secret for OpenAI-compatible STT provider');

      const buffer = await fs.readFile(request.audioPath);
      const form = new FormData();
      const fileName = `audio${request.extension || '.webm'}`;
      form.append('file', new Blob([buffer]), fileName);
      form.append('model', model);
      if (profile?.language) form.append('language', profile.language);

      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: form
      } as any);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`OpenAI-compatible STT failed ${response.status}: ${body || 'empty response'}`);
      }

      const data = await response.json();
      return { text: parseTranscribeText(data).trim() };
    }
  };
}
