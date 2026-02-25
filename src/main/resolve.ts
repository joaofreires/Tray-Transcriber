import path from 'node:path';
import fs from 'node:fs';
import { APP_ROOT, mainDirname, app, config, logger } from './ctx.js';

export function resolveBundledPath(relPath: string): string | null {
  const candidates: string[] = [];
  if (app && app.isPackaged) {
    const resourcesPath = (process as any).resourcesPath;
    if (resourcesPath) {
      candidates.push(path.join(resourcesPath, relPath));
      candidates.push(path.join(resourcesPath, 'app.asar.unpacked', relPath));
    }
  }
  if (APP_ROOT) candidates.push(path.join(APP_ROOT, relPath));
  candidates.push(path.join(process.cwd(), relPath));
  if (mainDirname) candidates.push(path.join(mainDirname, relPath));

  try {
    const existMap = candidates.map((c) => ({ path: c, exists: fs.existsSync(c) }));
  } catch (_) {}

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolvePythonCommand(): string {
  if (config?.pythonPath) {
    const custom = config.pythonPath.trim();
    if (custom) return custom;
  }
  const pyPath = resolveBundledPath(path.join('python', 'bin', 'python'));
  if (pyPath) {
    try {
      if (fs.statSync(pyPath).isFile()) return pyPath;
    } catch (_) {}
  }
  return config?.whisperxCommand || 'python';
}

export function resolveFfmpegDir(): string | null {
  const p = resolveBundledPath(path.join('ffmpeg', 'ffmpeg'));
  return p ? path.dirname(p) : null;
}

export function resolveWorkerScriptPath(): string | null {
  const candidatesTried: string[] = [];

  const bundled = resolveBundledPath(path.join('worker', 'worker.py'));
  if (bundled) { console.debug('[resolveWorkerScriptPath] bundled:', bundled); return bundled; }
  candidatesTried.push(path.join('worker', 'worker.py'));

  const unpacked = resolveBundledPath(path.join('python', 'worker.py'));
  if (unpacked) { console.debug('[resolveWorkerScriptPath] unpacked:', unpacked); return unpacked; }
  candidatesTried.push(path.join('python', 'worker.py'));

  if (mainDirname) {
    const dev = path.join(mainDirname, 'python', 'worker.py');
    if (fs.existsSync(dev)) { console.debug('[resolveWorkerScriptPath] dev:', dev); return dev; }
    candidatesTried.push(dev);
  }

  try {
    const info = { appRoot: APP_ROOT, cwd: process.cwd(), mainDirname, tried: candidatesTried };
    console.error('[resolveWorkerScriptPath] worker.py not found', JSON.stringify(info));
    logger?.error('[worker] worker.py not found; tried: ' + JSON.stringify(candidatesTried));
  } catch (_) {}
  return null;
}

export function buildWorkerEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const ffmpegDir = resolveFfmpegDir();
  if (ffmpegDir) env.PATH = `${ffmpegDir}${path.delimiter}${env.PATH || ''}`;
  if ((config.disableCuda && config.device !== 'gpu') || config.device === 'cpu') {
    env.CUDA_VISIBLE_DEVICES = '';
    env.NVIDIA_VISIBLE_DEVICES = 'none';
  }
  if (config.forceNoWeightsOnlyLoad) env.TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD = '1';
  if (logger?.filePath) env.TRANSCRIBER_LOG_PATH = logger.filePath;
  if (logger?.levelName) env.TRANSCRIBER_LOG_LEVEL = logger.levelName;
  return env;
}
