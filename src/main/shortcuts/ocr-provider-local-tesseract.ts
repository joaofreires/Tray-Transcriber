import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { config } from '../ctx.js';
import {
  OcrProviderExecutionError,
  type OcrExtractOptions,
  type OcrProvider
} from './ocr-provider-types.js';

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
      resolve({
        ok: false,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        reason: err?.message || String(err)
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const out = stdout.trim();
      const err = stderr.trim();
      if (timedOut) {
        resolve({
          ok: false,
          stdout: out,
          stderr: err,
          reason: `Timed out after ${timeoutMs}ms`
        });
        return;
      }
      if (code === 0) {
        resolve({ ok: true, stdout: out, stderr: err });
        return;
      }
      resolve({
        ok: false,
        stdout: out,
        stderr: err,
        reason: err || `exit ${code ?? 'null'}`
      });
    });
  });
}

function resolveTimeoutMs(): number {
  const raw = Number(config?.ocr?.localTesseract?.timeoutMs);
  if (!Number.isFinite(raw)) return 15000;
  return Math.max(1000, Math.min(300000, Math.round(raw)));
}

export function createLocalTesseractOcrProvider(): OcrProvider {
  return {
    id: 'local_tesseract',
    async extractText(image: Buffer, options: OcrExtractOptions) {
      const binaryPath = String(config?.ocr?.localTesseract?.binaryPath || '').trim() || 'tesseract';
      const defaultLanguage = String(config?.ocr?.localTesseract?.language || '').trim() || 'eng';
      const language = String(options?.languageHint || '').trim() || defaultLanguage;
      const extraArgs = splitArgs(String(config?.ocr?.localTesseract?.extraArgs || ''));
      const timeoutMs = resolveTimeoutMs();

      const tmpPath = path.join(os.tmpdir(), `tray-ocr-${Date.now()}-${randomUUID()}.png`);
      try {
        await fs.writeFile(tmpPath, image);
        const args = [tmpPath, 'stdout'];
        if (language) {
          args.push('-l', language);
        }
        args.push(...extraArgs);

        const result = await runCommandWithTimeout(binaryPath, args, timeoutMs);
        if (!result.ok) {
          const combinedReason = `${result.reason || 'unknown error'}${result.stderr ? ` (${result.stderr})` : ''}`;
          if ((combinedReason || '').toLowerCase().includes('enoent') || (combinedReason || '').toLowerCase().includes('not found')) {
            throw new OcrProviderExecutionError(
              'OCR_CLI_UNAVAILABLE',
              `OCR CLI not available at "${binaryPath}": ${combinedReason}`
            );
          }
          throw new OcrProviderExecutionError(
            'OCR_CLI_EXEC_FAILED',
            `OCR CLI command failed: ${combinedReason}`
          );
        }

        return String(result.stdout || '').trim();
      } catch (err: any) {
        if (err instanceof OcrProviderExecutionError) {
          throw err;
        }
        const reason = err?.message || String(err);
        if (String(reason).toLowerCase().includes('enoent') || String(reason).toLowerCase().includes('not found')) {
          throw new OcrProviderExecutionError(
            'OCR_CLI_UNAVAILABLE',
            `OCR CLI not available at "${binaryPath}": ${reason}`
          );
        }
        throw new OcrProviderExecutionError('OCR_CLI_EXEC_FAILED', `OCR CLI execution failed: ${reason}`);
      } finally {
        await fs.unlink(tmpPath).catch(() => {});
      }
    }
  };
}
