import { describe, expect, it, vi } from 'vitest';
import {
  buildGithubIssueUrl,
  parseGitHubRemoteToRepoBase,
  verifyLlmProvider,
  verifyOcrProvider,
  verifyRuntimeApiAlive
} from '../runtime/verification.js';

describe('runtime verification helpers', () => {
  it('parses git ssh GitHub remote into repository base URL', () => {
    expect(parseGitHubRemoteToRepoBase('git@github.com:joaofreires/tray-transcriber.git')).toBe(
      'https://github.com/joaofreires/tray-transcriber'
    );
  });

  it('builds GitHub issue URL with encoded title/body', () => {
    const url = buildGithubIssueUrl('https://github.com/joaofreires/tray-transcriber', 'LLM failed', 'line 1\nline 2');
    expect(url.startsWith('https://github.com/joaofreires/tray-transcriber/issues/new?')).toBe(true);
    expect(url).toContain('title=LLM+failed');
    expect(url).toContain('body=line+1%0Aline+2');
  });

  it('fails runtime-api verification when runtime api is disabled', async () => {
    const result = await verifyRuntimeApiAlive({
      enabled: false,
      transport: 'tcp',
      host: '127.0.0.1',
      port: 48765,
      socketPath: '',
      authRequired: true,
      token: 'token'
    });

    expect(result.ok).toBe(false);
    expect(result.target).toBe('runtime_api');
  });

  it('passes runtime-api verification when /v1/providers returns 200', async () => {
    const requester = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ providers: [{ id: 'llm.openai_compatible' }] })
    });
    const result = await verifyRuntimeApiAlive(
      {
        enabled: true,
        transport: 'tcp',
        host: '127.0.0.1',
        port: 48765,
        socketPath: '',
        authRequired: false,
        token: ''
      },
      { requester }
    );

    expect(result.ok).toBe(true);
    expect(result.details).toContain('1 provider');
  });

  it('verifies llm provider through orchestrator response', async () => {
    const runtime = {
      getActiveProviderProfile: vi.fn().mockReturnValue({ providerId: 'llm.openai_compatible' }),
      respondLlm: vi.fn().mockResolvedValue('OK')
    } as any;

    const result = await verifyLlmProvider(runtime);

    expect(result.ok).toBe(true);
    expect(runtime.respondLlm).toHaveBeenCalled();
  });

  it('returns ocr verification failure when extract throws', async () => {
    const runtime = {
      getActiveProviderProfile: vi.fn().mockReturnValue({ providerId: 'ocr.local_tesseract' }),
      extractOcr: vi.fn().mockRejectedValue(new Error('tesseract not found'))
    } as any;

    const result = await verifyOcrProvider(runtime);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('tesseract not found');
  });
});
