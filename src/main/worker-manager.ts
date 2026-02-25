import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { config, logger, APP_ROOT } from './ctx.js';
import { resolvePythonCommand, resolveWorkerScriptPath, buildWorkerEnv } from './resolve.js';
import { buildInitialPrompt } from './transcript.js';

// ── Worker process state ──────────────────────────────────────────────────────
let workerProc: any = null;
let workerPromise: Promise<boolean> | null = null;
let workerReady = false;
let workerWarmupKey: string | null = null;
let workerReadyResolve: ((v: boolean) => void) | null = null;
let workerPending: Map<number, { resolve: (v: any) => void; reject: (e: any) => void }> = new Map();
let workerBuffer = '';
let workerMsgId = 0;
let workerStdioReadyPromise: Promise<boolean> | null = null;

// ── Transport helpers ─────────────────────────────────────────────────────────
function getWorkerTransport(): 'stdio' | 'http' {
  const v = config?.workerTransport ? String(config.workerTransport).toLowerCase() : 'http';
  return v === 'stdio' ? 'stdio' : 'http';
}

// ── STDIO protocol ────────────────────────────────────────────────────────────
function resetWorkerStdioState(): void {
  workerPending = new Map();
  workerBuffer = '';
  workerReadyResolve = null;
}

function handleWorkerMessage(msg: any): void {
  if (!msg) return;
  if (msg.type === 'ready') {
    workerReady = true;
    if (workerReadyResolve) workerReadyResolve(true);
    return;
  }
  if (msg.id !== undefined) {
    const pending = workerPending.get(msg.id);
    if (!pending) return;
    workerPending.delete(msg.id);
    msg.ok ? pending.resolve(msg.result || {}) : pending.reject(new Error(msg.error || 'worker error'));
  }
}

function setupWorkerStdio(proc: any): Promise<boolean> {
  resetWorkerStdioState();
  workerReady = false;
  workerPromise = null;
  const readyPromise = new Promise<boolean>((resolve) => { workerReadyResolve = resolve; });
  proc.stdout.on('data', (chunk: Buffer) => {
    workerBuffer += chunk.toString('utf8');
    let idx: number;
    while ((idx = workerBuffer.indexOf('\n')) >= 0) {
      const line = workerBuffer.slice(0, idx).trim();
      workerBuffer = workerBuffer.slice(idx + 1);
      if (!line) continue;
      try { handleWorkerMessage(JSON.parse(line)); } catch (_) { logger?.error('[worker] invalid json', line); }
    }
  });
  return readyPromise;
}

export function sendWorkerMessage(type: string, payload: any, timeoutMs?: number): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!workerProc?.stdin?.writable) { reject(new Error('worker stdin not writable')); return; }
    const id = ++workerMsgId;
    workerPending.set(id, { resolve, reject });
    workerProc.stdin.write(JSON.stringify({ id, type, payload }) + '\n');
    if (timeoutMs) {
      setTimeout(() => {
        if (workerPending.has(id)) { workerPending.delete(id); reject(new Error(`worker timeout after ${timeoutMs}ms`)); }
      }, timeoutMs);
    }
  });
}

// ── Worker lifecycle ──────────────────────────────────────────────────────────
function startWorker(): void {
  if (workerProc) return;
  let scriptPath = resolveWorkerScriptPath();
  if (!scriptPath && process.env.NODE_ENV === 'development') {
    // Search parent directories for worker.py.
    const searchUp = (start: string, depth = 6): string | null => {
      let cur = path.resolve(start);
      for (let i = 0; i < depth; i++) {
        const c = path.join(cur, 'python', 'worker.py');
        if (fs.existsSync(c)) return c;
        const p = path.dirname(cur);
        if (!p || p === cur) break;
        cur = p;
      }
      return null;
    };
    scriptPath = searchUp(process.cwd()) || searchUp(APP_ROOT) || null;
    if (scriptPath) console.debug('[worker] parent-search fallback:', scriptPath);
  }
  if (!scriptPath) {
    console.error('[WORKER-ERROR] worker.py not found. APP_ROOT=%s cwd=%s', APP_ROOT, process.cwd());
    return;
  }
  const env = buildWorkerEnv();
  const pythonCmd = resolvePythonCommand();
  const transport = getWorkerTransport();
  console.debug('[worker] spawning pythonCmd=%s scriptPath=%s transport=%s', pythonCmd, scriptPath, transport);
  try {
    workerProc = spawn(
      pythonCmd,
      ['-u', scriptPath, '--host', config.workerHost, '--port', String(config.workerPort), '--mode', transport],
      { stdio: ['pipe', 'pipe', 'pipe'], env }
    );
  } catch (err) {
    console.error('[worker] spawn failed', err);
    workerProc = null;
    return;
  }
  if (transport === 'stdio') {
    workerStdioReadyPromise = setupWorkerStdio(workerProc);
  } else {
    workerProc.stdout.on('data', (chunk: Buffer) => logger?.info('[worker]', chunk.toString().trimEnd()));
  }
  workerProc.stderr.on('data', (chunk: Buffer) => logger?.error('[worker]', chunk.toString().trimEnd()));
  workerProc.on('exit', () => {
    workerProc = null; workerReady = false; workerPromise = null; workerStdioReadyPromise = null;
  });
}

export function ensureWorker(): Promise<boolean> {
  if (!config?.useWorker) return Promise.resolve(false);
  if (workerReady) return Promise.resolve(true);
  if (workerPromise) return workerPromise;
  const transport = getWorkerTransport();
  workerPromise = new Promise((resolve) => {
    startWorker();
    if (!workerProc) { resolve(false); return; }
    if (transport === 'stdio') {
      const timeout = setTimeout(() => { workerReady = false; resolve(false); }, config.workerStartupTimeoutMs || 15000);
      workerStdioReadyPromise?.then(() => { clearTimeout(timeout); resolve(true); });
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - start > (config.workerStartupTimeoutMs || 15000)) { clearInterval(timer); resolve(false); return; }
      const req = http.get({ host: config.workerHost, port: config.workerPort, path: '/health', timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) { clearInterval(timer); workerReady = true; resolve(true); }
      });
      req.on('error', () => {}); req.on('timeout', () => req.destroy());
    }, 300);
  });
  return workerPromise;
}

export async function transcribeViaWorker(audioPath: string): Promise<string | null> {
  const ok = await ensureWorker();
  if (!ok) return null;
  const payload = {
    engine: config.asrEngine || 'whisperx',
    audio_base64: fs.readFileSync(audioPath).toString('base64'),
    extension: path.extname(audioPath),
    model: config.model, language: config.language,
    compute_type: config.computeType, batch_size: config.batchSize,
    no_align: config.noAlign, initial_prompt: buildInitialPrompt() || undefined,
    device: config.device || 'default'
  };
  if (getWorkerTransport() === 'stdio') {
    const result: any = await sendWorkerMessage('transcribe', payload, config.workerRequestTimeoutMs || 30000);
    return result?.text || '';
  }
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    let statusTimer: any = null;
    const pollMs = config.workerStatusPollMs || 0;
    if (pollMs > 0) statusTimer = setInterval(() => fetchWorkerStatus('transcribe_wait'), pollMs);
    const req = http.request(
      { host: config.workerHost, port: config.workerPort, path: '/transcribe', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: config.workerRequestTimeoutMs || 30000 },
      (res) => {
        let data = '';
        res.on('data', (c: any) => { data += c.toString('utf8'); });
        res.on('end', () => {
          if (statusTimer) clearInterval(statusTimer);
          if (res.statusCode !== 200) { reject(new Error(`worker error ${res.statusCode}: ${data}`)); return; }
          try { resolve(JSON.parse(data).text || ''); } catch (e) { reject(e); }
        });
      }
    );
    req.on('timeout', () => { if (statusTimer) clearInterval(statusTimer); req.destroy(new Error('worker request timeout')); });
    req.on('error', (e) => { if (statusTimer) clearInterval(statusTimer); reject(e); });
    req.write(body); req.end();
  });
}

export async function runWhisperX(audioPath: string): Promise<string> {
  if (config.asrEngine && config.asrEngine !== 'whisperx') {
    if (!config.useWorker) throw new Error(`${config.asrEngine} engine requires useWorker=true`);
    return (await transcribeViaWorker(audioPath)) ?? '';
  }
  if (config.useWorker) {
    try {
      const text = await transcribeViaWorker(audioPath);
      if (typeof text === 'string') return text;
    } catch (err: any) {
      console.warn('[worker] failed, falling back to CLI:', err?.message ?? err);
    }
  }
  // CLI fallback via whisperx command.
  const { spawn: spawnChild } = await import('node:child_process');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tray-transcriber-'));
  const outputDir = path.join(tmpDir, 'out');
  fs.mkdirSync(outputDir, { recursive: true });
  const prompt = buildInitialPrompt();
  const args = [
    ...config.whisperxArgs, audioPath,
    '--output_dir', outputDir, '--output_format', 'txt',
    '--language', config.language, '--model', config.model
  ];
  if (config.device === 'cpu') args.push('--device', 'cpu');
  else if (config.device === 'gpu') args.push('--device', 'cuda');
  if (prompt) args.push('--initial_prompt', prompt);
  if (config.computeType) args.push('--compute_type', config.computeType);
  if (config.batchSize) args.push('--batch_size', String(config.batchSize));
  if (config.noAlign) args.push('--no_align');
  await new Promise<void>((resolve, reject) => {
    const proc = spawnChild(resolvePythonCommand(), args, { stdio: 'inherit', env: buildWorkerEnv() });
    proc.on('error', reject);
    proc.on('close', (code: number) => code === 0 ? resolve() : reject(new Error(`whisperx exited ${code}`)));
  });
  const txtFiles = fs.readdirSync(outputDir).filter((f) => f.endsWith('.txt'));
  if (!txtFiles.length) return '';
  return fs.readFileSync(path.join(outputDir, txtFiles[0]), 'utf8').trim();
}

export async function warmupWorker(): Promise<void> {
  const key = `${config.model}|${config.language}|${config.computeType}|${config.batchSize}`;
  if (workerWarmupKey === key) return;
  const ok = await ensureWorker();
  if (!ok) return;
  const payload = { engine: config.asrEngine || 'whisperx', model: config.model, language: config.language, compute_type: config.computeType, device: config.device || 'default' };
  if (getWorkerTransport() === 'stdio') {
    try { await sendWorkerMessage('warmup', payload, config.workerStartupTimeoutMs || 15000); workerWarmupKey = key; }
    catch (err: any) { logger?.error('[worker] warmup failed', err?.message ?? err); }
    return;
  }
  const body = JSON.stringify(payload);
  await new Promise<void>((resolve) => {
    const req = http.request(
      { host: config.workerHost, port: config.workerPort, path: '/warmup', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { res.resume(); if (res.statusCode === 200) workerWarmupKey = key; resolve(); }
    );
    req.on('error', () => resolve()); req.write(body); req.end();
  });
}

export function restartWorker(): void {
  if (workerProc) { workerProc.kill(); workerProc = null; }
  workerReady = false; workerPromise = null; workerWarmupKey = null;
  if (config?.useWorker) {
    ensureWorker();
    if (config.workerWarmup) warmupWorker();
  }
}

export function fetchWorkerStatus(context = ''): void {
  if (!config?.useWorker) { logger?.info('[worker] status: disabled'); return; }
  if (getWorkerTransport() === 'stdio') {
    sendWorkerMessage('status', {}, 2000)
      .then((r) => logger?.info('[worker] status', context, JSON.stringify(r)))
      .catch((e: any) => logger?.error('[worker] status failed', context, e?.message ?? e));
    return;
  }
  const req = http.get({ host: config.workerHost, port: config.workerPort, path: '/status', timeout: 2000 }, (res) => {
    let data = '';
    res.on('data', (c: any) => { data += c.toString('utf8'); });
    res.on('end', () => {
      if (res.statusCode !== 200) { console.log('[worker] status error', context, res.statusCode, data); return; }
      try { logger?.info('[worker] status', context, JSON.stringify(JSON.parse(data))); }
      catch (e: any) { logger?.error('[worker] status parse error', context, e?.message ?? e); }
    });
  });
  req.on('error', (e: any) => logger?.error('[worker] status request failed', context, e.message));
  req.on('timeout', () => req.destroy(new Error('status timeout')));
}

export function killWorker(): void {
  if (workerProc) workerProc.kill();
}
