import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type {
  OcrExtractRequest,
  OcrExtractResponse,
  OcrProvider,
  ProviderStatus
} from '../types.js';
import { checkLocalPathExists, profileOptionNumber, profileOptionString } from './common.js';

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  reason?: string;
};

function splitArgs(input: string): string[] {
  const text = String(input || '').trim();
  if (!text) return [];
  const matches = text.match(/(?:[^\s"]+|"[^"]*")+/g);
  if (!matches) return [];
  return matches.map((part) => part.replace(/^"(.*)"$/, '$1')).filter(Boolean);
}

function runCommandWithTimeout(cmd: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => { stdout += String(chunk || ''); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk || ''); });

    child.on('error', (err: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ok: false, stdout: stdout.trim(), stderr: stderr.trim(), reason: err?.message || String(err) });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const out = stdout.trim();
      const err = stderr.trim();
      if (timedOut) {
        resolve({ ok: false, stdout: out, stderr: err, reason: `Timed out after ${timeoutMs}ms` });
        return;
      }
      if (code === 0) {
        resolve({ ok: true, stdout: out, stderr: err });
        return;
      }
      resolve({ ok: false, stdout: out, stderr: err, reason: err || `exit ${code ?? 'null'}` });
    });
  });
}

export function createLocalTesseractRuntimeProvider(): OcrProvider {
  return {
    descriptor: {
      id: 'ocr.local_tesseract',
      capability: 'ocr',
      displayName: 'Local Tesseract OCR',
      kind: 'local',
      requiresInstall: true,
      supportsLocalPath: true
    },

    async getStatus(): Promise<ProviderStatus> {
      return {
        providerId: 'ocr.local_tesseract',
        capability: 'ocr',
        installed: true,
        health: 'healthy',
        message: 'Tesseract provider available'
      };
    },

    async extractText(request: OcrExtractRequest): Promise<OcrExtractResponse> {
      const profile = request.profile;
      const binaryPath = String(profile?.localPath || profileOptionString(profile, 'binaryPath', 'tesseract') || 'tesseract').trim();
      const defaultLanguage = profileOptionString(profile, 'language', 'eng');
      const language = String(request.languageHint || defaultLanguage).trim() || 'eng';
      const extraArgs = splitArgs(profileOptionString(profile, 'extraArgs', ''));
      const timeoutMs = Math.max(1000, Math.min(300000, Math.round(profileOptionNumber(profile, 'timeoutMs', 15000))));

      const tmpPath = path.join(os.tmpdir(), `tray-ocr-runtime-${Date.now()}-${randomUUID()}.png`);
      try {
        await fs.writeFile(tmpPath, request.image);
        const args = [tmpPath, 'stdout'];
        if (language) args.push('-l', language);
        args.push(...extraArgs);

        const result = await runCommandWithTimeout(binaryPath, args, timeoutMs);
        if (!result.ok) {
          throw new Error(result.reason || result.stderr || 'tesseract execution failed');
        }
        return { text: String(result.stdout || '').trim() };
      } finally {
        await fs.unlink(tmpPath).catch(() => {});
      }
    }
  };
}
