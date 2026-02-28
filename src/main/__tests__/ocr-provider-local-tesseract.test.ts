import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock, configRef } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  configRef: {
    ocr: {
      localTesseract: {
        binaryPath: 'tesseract',
        language: 'eng',
        extraArgs: '',
        timeoutMs: 5000
      }
    }
  } as any
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock
}));

vi.mock('../ctx.js', () => ({
  config: configRef
}));

import { createLocalTesseractOcrProvider } from '../shortcuts/ocr-provider-local-tesseract.js';

function spawnProcess(code: number, stdout = '', stderr = '', error?: Error) {
  const processEmitter = new EventEmitter() as any;
  processEmitter.stdout = new EventEmitter();
  processEmitter.stderr = new EventEmitter();
  process.nextTick(() => {
    if (error) {
      processEmitter.emit('error', error);
      return;
    }
    if (stdout) processEmitter.stdout.emit('data', stdout);
    if (stderr) processEmitter.stderr.emit('data', stderr);
    processEmitter.emit('close', code);
  });
  return processEmitter;
}

describe('local tesseract OCR provider', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    configRef.ocr = {
      localTesseract: {
        binaryPath: 'tesseract',
        language: 'eng',
        extraArgs: '',
        timeoutMs: 5000
      }
    };
  });

  it('returns OCR text on successful CLI execution', async () => {
    spawnMock.mockImplementation(() => spawnProcess(0, 'hello world\n'));
    const provider = createLocalTesseractOcrProvider();
    const text = await provider.extractText(Buffer.from('img'), { languageHint: 'eng' }, {} as any);
    expect(text).toBe('hello world');
  });

  it('throws OCR_CLI_UNAVAILABLE when binary is missing', async () => {
    spawnMock.mockImplementation(() => spawnProcess(1, '', '', new Error('spawn tesseract ENOENT')));
    const provider = createLocalTesseractOcrProvider();
    await expect(provider.extractText(Buffer.from('img'), {}, {} as any)).rejects.toMatchObject({
      code: 'OCR_CLI_UNAVAILABLE'
    });
  });

  it('throws OCR_CLI_EXEC_FAILED on non-zero exit', async () => {
    spawnMock.mockImplementation(() => spawnProcess(1, '', 'bad input'));
    const provider = createLocalTesseractOcrProvider();
    await expect(provider.extractText(Buffer.from('img'), {}, {} as any)).rejects.toMatchObject({
      code: 'OCR_CLI_EXEC_FAILED'
    });
  });
});
