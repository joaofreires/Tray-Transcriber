import http from 'node:http';
import type { RuntimeOrchestrator } from './orchestrator.js';

export type VerificationTarget = 'runtime_api' | 'llm' | 'ocr';

export type VerificationResult = {
  ok: boolean;
  target: VerificationTarget;
  message: string;
  details?: string;
  error?: string;
  issueUrl?: string;
};

export type RuntimeApiInfo = {
  enabled: boolean;
  transport: 'tcp' | 'socket';
  host: string;
  port: number;
  socketPath: string;
  authRequired: boolean;
  token: string;
};

type RuntimeApiResponse = {
  statusCode: number;
  body: string;
};

const OCR_PROBE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAdUlEQVR42u3YsQ3AIAxE0SPKAExDxRgeg2WYhCWomIYNoE2Viigi+Ve6sPUkF5bdGEM759DmAQAAAAAAAAAA+DPgXNirlJJzllRrjTFKCiG01q6VlJKZLRzqnjinvfe99/sKKwQAAIBvABxfCQAAAAAAAODFTLQzHjeVhCfxAAAAAElFTkSuQmCC';

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function buildRuntimeApiRequestOptions(info: RuntimeApiInfo): http.RequestOptions {
  const headers: Record<string, string> = {};
  if (info.authRequired) {
    headers.Authorization = `Bearer ${info.token}`;
  }
  if (info.transport === 'socket') {
    return {
      socketPath: info.socketPath,
      method: 'GET',
      path: '/v1/providers',
      headers
    };
  }
  return {
    host: info.host || '127.0.0.1',
    port: Number(info.port || 0),
    method: 'GET',
    path: '/v1/providers',
    headers
  };
}

async function requestRuntimeApiProviders(info: RuntimeApiInfo): Promise<RuntimeApiResponse> {
  return await new Promise((resolve, reject) => {
    const request = http.request(buildRuntimeApiRequestOptions(info), (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += String(chunk || '');
      });
      response.on('end', () => {
        resolve({
          statusCode: Number(response.statusCode || 0),
          body
        });
      });
    });
    request.on('error', reject);
    request.setTimeout(5000, () => {
      request.destroy(new Error('Runtime API request timed out after 5000ms'));
    });
    request.end();
  });
}

type RuntimeApiVerifyOptions = {
  requester?: (info: RuntimeApiInfo) => Promise<RuntimeApiResponse>;
};

export async function verifyRuntimeApiAlive(info: RuntimeApiInfo, options: RuntimeApiVerifyOptions = {}): Promise<VerificationResult> {
  if (!info.enabled) {
    return {
      ok: false,
      target: 'runtime_api',
      message: 'Runtime API is disabled.',
      error: 'runtimeApi.enabled is false'
    };
  }
  if (info.authRequired && !String(info.token || '').trim()) {
    return {
      ok: false,
      target: 'runtime_api',
      message: 'Runtime API auth is enabled but no session token is available.',
      error: 'missing runtime API auth token'
    };
  }
  if (info.transport === 'tcp' && (!info.host || !Number(info.port))) {
    return {
      ok: false,
      target: 'runtime_api',
      message: 'Runtime API TCP binding is incomplete.',
      error: 'host/port is missing'
    };
  }
  if (info.transport === 'socket' && !String(info.socketPath || '').trim()) {
    return {
      ok: false,
      target: 'runtime_api',
      message: 'Runtime API socket path is missing.',
      error: 'socketPath is empty'
    };
  }

  const requester = options.requester || requestRuntimeApiProviders;
  try {
    const response = await requester(info);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return {
        ok: false,
        target: 'runtime_api',
        message: `Runtime API responded with HTTP ${response.statusCode}.`,
        error: response.body || 'non-2xx runtime API response'
      };
    }
    let providerCount = 0;
    try {
      const parsed = JSON.parse(String(response.body || '{}'));
      providerCount = Array.isArray(parsed?.providers) ? parsed.providers.length : 0;
    } catch {
      providerCount = 0;
    }
    return {
      ok: true,
      target: 'runtime_api',
      message: 'Runtime API is reachable.',
      details: `${providerCount} provider(s) returned by /v1/providers`
    };
  } catch (err: any) {
    return {
      ok: false,
      target: 'runtime_api',
      message: 'Runtime API check failed.',
      error: err?.message || String(err)
    };
  }
}

export async function verifyLlmProvider(runtime: RuntimeOrchestrator): Promise<VerificationResult> {
  const active = runtime.getActiveProviderProfile('llm');
  const providerId = String(active.providerId || '').trim();
  if (!providerId) {
    return {
      ok: false,
      target: 'llm',
      message: 'No active LLM provider selected.',
      error: 'providers.llm.activeProviderId is empty'
    };
  }
  try {
    const text = await withTimeout(
      runtime.respondLlm({ prompt: 'Reply with OK.' }),
      15000,
      'LLM verification timed out after 15000ms'
    );
    const preview = String(text || '').trim().slice(0, 120);
    return {
      ok: true,
      target: 'llm',
      message: `LLM verification succeeded for ${providerId}.`,
      details: preview ? `Response preview: ${preview}` : 'No response text returned.'
    };
  } catch (err: any) {
    return {
      ok: false,
      target: 'llm',
      message: `LLM verification failed for ${providerId}.`,
      error: err?.message || String(err)
    };
  }
}

export async function verifyOcrProvider(runtime: RuntimeOrchestrator): Promise<VerificationResult> {
  const active = runtime.getActiveProviderProfile('ocr');
  const providerId = String(active.providerId || '').trim();
  if (!providerId) {
    return {
      ok: false,
      target: 'ocr',
      message: 'No active OCR provider selected.',
      error: 'providers.ocr.activeProviderId is empty'
    };
  }
  try {
    const imageBuffer = Buffer.from(OCR_PROBE_PNG_BASE64, 'base64');
    const text = await withTimeout(
      runtime.extractOcr({ image: imageBuffer }),
      15000,
      'OCR verification timed out after 15000ms'
    );
    const length = String(text || '').trim().length;
    return {
      ok: true,
      target: 'ocr',
      message: `OCR verification succeeded for ${providerId}.`,
      details: length > 0 ? `Extracted ${length} character(s).` : 'OCR ran successfully (empty text output).'
    };
  } catch (err: any) {
    return {
      ok: false,
      target: 'ocr',
      message: `OCR verification failed for ${providerId}.`,
      error: err?.message || String(err)
    };
  }
}

export function parseGitHubRemoteToRepoBase(remoteUrl: string): string | null {
  const value = String(remoteUrl || '').trim();
  if (!value) return null;

  const stripGitSuffix = (input: string): string => input.replace(/\.git$/i, '').replace(/\/+$/, '');

  if (value.startsWith('git@github.com:')) {
    const path = stripGitSuffix(value.slice('git@github.com:'.length));
    return path ? `https://github.com/${path}` : null;
  }
  if (value.startsWith('ssh://git@github.com/')) {
    const path = stripGitSuffix(value.slice('ssh://git@github.com/'.length));
    return path ? `https://github.com/${path}` : null;
  }
  if (value.startsWith('https://github.com/')) {
    return stripGitSuffix(value);
  }
  if (value.startsWith('http://github.com/')) {
    return `https://${stripGitSuffix(value.slice('http://'.length))}`;
  }
  return null;
}

export function buildGithubIssueUrl(repoBaseUrl: string | null, title: string, body: string): string {
  const params = new URLSearchParams({
    title: String(title || 'Verification failure'),
    body: String(body || '')
  });
  if (!repoBaseUrl) {
    return `https://github.com/issues/new?${params.toString()}`;
  }
  return `${repoBaseUrl}/issues/new?${params.toString()}`;
}
