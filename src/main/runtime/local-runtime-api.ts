import http from 'node:http';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { RuntimeConfig } from './types.js';
import type { RuntimeOrchestrator } from './orchestrator.js';
import type { InstallerService } from './installer-service.js';

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += String(chunk || ''); });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${err}`));
      }
    });
    req.on('error', reject);
  });
}

function writeJson(res: http.ServerResponse, status: number, payload: any): void {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

export class LocalRuntimeApiServer {
  private server: http.Server | null = null;
  private authToken = randomUUID();
  private runtimeConfig: RuntimeConfig | null = null;

  constructor(private orchestrator: RuntimeOrchestrator, private installer: InstallerService) {}

  configure(config: RuntimeConfig): void {
    this.runtimeConfig = config;
  }

  getToken(): string {
    return this.authToken;
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async start(): Promise<void> {
    const config = this.runtimeConfig;
    if (!config?.runtimeApi?.enabled) return;
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err: any) => {
        writeJson(res, 500, { error: err?.message || String(err) });
      });
    });

    await new Promise<void>((resolve, reject) => {
      if (config.runtimeApi.transport === 'socket') {
        try { fs.unlinkSync(config.runtimeApi.socketPath); } catch {}
        this.server?.listen(config.runtimeApi.socketPath, () => resolve());
      } else {
        this.server?.listen(config.runtimeApi.port, config.runtimeApi.host, () => resolve());
      }
      this.server?.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const activeServer = this.server;
    this.server = null;
    await new Promise<void>((resolve) => activeServer.close(() => resolve()));
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const config = this.runtimeConfig;
    if (!config) {
      writeJson(res, 503, { error: 'Runtime API not configured' });
      return;
    }

    if (config.runtimeApi.authRequired) {
      const auth = String(req.headers.authorization || '');
      const expected = `Bearer ${this.authToken}`;
      if (auth !== expected) {
        writeJson(res, 401, { error: 'Unauthorized' });
        return;
      }
    }

    const method = String(req.method || 'GET').toUpperCase();
    const path = String(req.url || '').split('?')[0] || '/';

    if (method === 'GET' && path === '/v1/providers') {
      const providers = this.orchestrator.listProviders();
      writeJson(res, 200, { providers });
      return;
    }

    if (method === 'GET' && path.startsWith('/v1/providers/')) {
      const providerId = decodeURIComponent(path.replace('/v1/providers/', '').replace(/\/status$/, ''));
      const status = await this.orchestrator.providerStatus(providerId);
      writeJson(res, 200, status);
      return;
    }

    if (method === 'POST' && path === '/v1/stt/transcribe') {
      const body = await readJsonBody(req);
      const audioBase64 = String(body.audio_base64 || '');
      if (!audioBase64) {
        writeJson(res, 400, { error: 'audio_base64 is required' });
        return;
      }
      const buffer = Buffer.from(audioBase64, 'base64');
      const text = await this.orchestrator.transcribeFromBuffer(buffer, String(body.extension || '.webm'));
      writeJson(res, 200, { text });
      return;
    }

    if (method === 'POST' && path === '/v1/llm/respond') {
      const body = await readJsonBody(req);
      const text = await this.orchestrator.respondLlm({
        prompt: body.prompt,
        messages: body.messages,
        stream: false
      });
      writeJson(res, 200, { text });
      return;
    }

    if (method === 'POST' && path === '/v1/ocr/extract') {
      const body = await readJsonBody(req);
      const imageBase64 = String(body.image_base64 || '');
      if (!imageBase64) {
        writeJson(res, 400, { error: 'image_base64 is required' });
        return;
      }
      const text = await this.orchestrator.extractOcr({
        image: Buffer.from(imageBase64, 'base64'),
        languageHint: body.languageHint
      });
      writeJson(res, 200, { text });
      return;
    }

    if (method === 'POST' && path === '/v1/install/jobs') {
      const body = await readJsonBody(req);
      const job = this.installer.startJob({
        providerId: String(body.providerId || ''),
        action: String(body.action || 'install') as any,
        localPath: typeof body.localPath === 'string' ? body.localPath : undefined
      });
      writeJson(res, 202, { job });
      return;
    }

    if (method === 'GET' && path.startsWith('/v1/install/jobs/')) {
      const jobId = decodeURIComponent(path.replace('/v1/install/jobs/', ''));
      const job = this.installer.listJobs().find((entry) => entry.id === jobId);
      if (!job) {
        writeJson(res, 404, { error: 'job not found' });
        return;
      }
      writeJson(res, 200, { job });
      return;
    }

    writeJson(res, 404, { error: 'not found' });
  }
}
