import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { app, logger } from '../ctx.js';
import type { SecretsRef } from './types.js';

type KeytarLike = {
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  getPassword: (service: string, account: string) => Promise<string | null>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
};

const SECRET_SERVICE = 'tray-transcriber-runtime';

function getFallbackPath(): string {
  const root = app?.getPath?.('userData') || process.cwd();
  return path.join(root, 'secrets-fallback.json');
}

function readFallbackMap(): Record<string, string> {
  const file = getFallbackPath();
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeFallbackMap(map: Record<string, string>): void {
  const file = getFallbackPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(map, null, 2));
}

let keytarPromise: Promise<KeytarLike | null> | null = null;
const require = createRequire(import.meta.url);

async function resolveKeytar(): Promise<KeytarLike | null> {
  if (keytarPromise) return keytarPromise;
  keytarPromise = (async () => {
    try {
      const imported: any = require('keytar');
      const keytar = imported?.default || imported;
      if (keytar && typeof keytar.getPassword === 'function') return keytar as KeytarLike;
      return null;
    } catch {
      return null;
    }
  })();
  return keytarPromise;
}

export class SecretsService {
  async setSecret(ref: string, value: string): Promise<SecretsRef> {
    const normalizedRef = String(ref || '').trim();
    if (!normalizedRef) throw new Error('Secret ref is required');
    const keytar = await resolveKeytar();
    if (keytar) {
      await keytar.setPassword(SECRET_SERVICE, normalizedRef, String(value || ''));
      return { ref: normalizedRef, backend: 'keychain' };
    }

    const fallback = readFallbackMap();
    fallback[normalizedRef] = String(value || '');
    writeFallbackMap(fallback);
    logger?.warn?.('[secrets] keychain unavailable, stored in plaintext fallback', { ref: normalizedRef });
    return { ref: normalizedRef, backend: 'plaintext' };
  }

  async getSecret(ref: string): Promise<string> {
    const normalizedRef = String(ref || '').trim();
    if (!normalizedRef) return '';
    const keytar = await resolveKeytar();
    if (keytar) {
      const value = await keytar.getPassword(SECRET_SERVICE, normalizedRef);
      if (typeof value === 'string' && value) return value;
    }
    const fallback = readFallbackMap();
    return String(fallback[normalizedRef] || '');
  }

  async deleteSecret(ref: string): Promise<boolean> {
    const normalizedRef = String(ref || '').trim();
    if (!normalizedRef) return false;
    const keytar = await resolveKeytar();
    if (keytar) {
      await keytar.deletePassword(SECRET_SERVICE, normalizedRef);
    }
    const fallback = readFallbackMap();
    const exists = normalizedRef in fallback;
    if (exists) {
      delete fallback[normalizedRef];
      writeFallbackMap(fallback);
    }
    return exists;
  }

  async getBackendForRef(ref: string): Promise<'keychain' | 'plaintext'> {
    const keytar = await resolveKeytar();
    if (keytar) {
      const value = await keytar.getPassword(SECRET_SERVICE, String(ref || '').trim());
      if (value) return 'keychain';
    }
    return 'plaintext';
  }

  async isUsingFallbackStorage(): Promise<boolean> {
    const keytar = await resolveKeytar();
    return !keytar;
  }
}
