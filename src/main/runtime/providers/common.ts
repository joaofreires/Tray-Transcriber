import fs from 'node:fs';
import { URL } from 'node:url';
import type { ProviderProfile } from '../types.js';

export function profileOptionString(profile: ProviderProfile | undefined, key: string, fallback = ''): string {
  return String(profile?.options?.[key] ?? fallback).trim();
}

export function profileOptionNumber(profile: ProviderProfile | undefined, key: string, fallback: number): number {
  const parsed = Number(profile?.options?.[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export function profileOptionBoolean(profile: ProviderProfile | undefined, key: string, fallback: boolean): boolean {
  const value = profile?.options?.[key];
  if (typeof value === 'boolean') return value;
  return fallback;
}

export function normalizeBaseEndpoint(endpoint: string, fallback: string): string {
  const raw = String(endpoint || '').trim() || fallback;
  if (!raw) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  if (/^(localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?$/i.test(raw)) return `http://${raw}`;
  return `https://${raw}`;
}

export function appendPath(baseEndpoint: string, pathname: string): string {
  const base = normalizeBaseEndpoint(baseEndpoint, '');
  if (!base) return pathname;
  try {
    const parsed = new URL(base);
    parsed.pathname = pathname;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return `${base.replace(/\/+$/, '')}${pathname}`;
  }
}

export function checkLocalPathExists(localPath: string): boolean {
  if (!localPath) return false;
  try {
    return fs.existsSync(localPath);
  } catch {
    return false;
  }
}

export function streamSseResponse(fullChunk: string, onChunk?: (chunk: string) => void): string {
  let fullText = '';
  const lines = fullChunk.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'data: [DONE]') continue;
    if (!trimmed.startsWith('data:')) continue;
    try {
      const payload = JSON.parse(trimmed.replace(/^data:\s*/, ''));
      const delta =
        String(payload?.delta || '') ||
        String(payload?.output_text?.delta || '') ||
        String(payload?.choices?.[0]?.delta?.content || '') ||
        String(payload?.choices?.[0]?.text || '');
      if (delta) {
        fullText += delta;
        onChunk?.(delta);
      }
    } catch {
      // ignore invalid SSE event payloads
    }
  }
  return fullText;
}
