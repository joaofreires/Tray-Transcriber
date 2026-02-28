import { isDeepStrictEqual } from 'node:util';

export type WindowLike = {
  isDestroyed: () => boolean;
  webContents: {
    send: (channel: string, payload: unknown) => void;
  };
} | null | undefined;

export type ConfigChangedPayload = {
  changedKeys: string[];
  config: Record<string, unknown>;
  sourceWindowType?: 'main' | 'config' | 'unknown';
};

const HOT_RELOAD_SAFE_PATH_PREFIXES = ['shortcutsVersion', 'shortcutDefaults', 'shortcuts', 'ocr'];

const WORKER_RESTART_PATH_PREFIXES = [
  'providers.stt',
  'asrEngine',
  'model',
  'language',
  'device',
  'computeType',
  'batchSize',
  'noAlign',
  'useWorker',
  'workerWarmup',
  'workerTransport',
  'workerHost',
  'workerPort',
  'workerRequestTimeoutMs',
  'pythonPath',
  'disableCuda',
  'forceNoWeightsOnlyLoad'
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`);
}

function collectChangedPaths(prev: unknown, next: unknown, basePath: string, out: Set<string>): void {
  if (isDeepStrictEqual(prev, next)) return;

  if (isPlainObject(prev) && isPlainObject(next)) {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of keys) {
      const path = basePath ? `${basePath}.${key}` : key;
      collectChangedPaths(prev[key], next[key], path, out);
    }
    return;
  }

  if (Array.isArray(prev) && Array.isArray(next)) {
    if (basePath) out.add(basePath);
    return;
  }

  if (basePath) out.add(basePath);
}

export function getChangedConfigPaths(
  prevConfig: Record<string, unknown>,
  nextConfig: Record<string, unknown>
): string[] {
  const changed = new Set<string>();
  collectChangedPaths(prevConfig || {}, nextConfig || {}, '', changed);
  return [...changed].sort();
}

export function isShortcutOnlyUpdate(changedPaths: string[]): boolean {
  return (
    changedPaths.length > 0 &&
    changedPaths.every((path) => HOT_RELOAD_SAFE_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix)))
  );
}

export function shouldRestartWorkerForConfigChanges(changedPaths: string[]): boolean {
  return changedPaths.some((path) => WORKER_RESTART_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix)));
}

export function broadcastConfigChanged(targets: WindowLike[], payload: ConfigChangedPayload): void {
  for (const target of targets) {
    if (!target || target.isDestroyed()) continue;
    target.webContents.send('config-changed', payload);
  }
}
