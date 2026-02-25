import path from 'node:path';
import fs from 'node:fs';
import util from 'node:util';
import { config, app, setLogger } from './ctx.js';

export type Logger = {
  levelName: string;
  filePath: string;
  error: (...args: any[]) => void;
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
};

let consolePatched = false;

export function createLogger(): Logger {
  const levels: Record<string, number> = { silent: 0, error: 1, info: 2, debug: 3 };
  const configured = (config && config.logLevel) || 'auto';
  const levelName =
    configured === 'auto' ? (app && app.isPackaged ? 'error' : 'debug') : configured;
  const level = levels[levelName] ?? levels.error;
  const logDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const filePath = path.join(logDir, 'app.log');

  const writeLine = (msg: string) => {
    try { fs.appendFileSync(filePath, msg + '\n'); } catch (_) {}
  };

  const formatArg = (arg: any): string => {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.stack || arg.message || String(arg);
    try { return util.inspect(arg, { depth: 4, breakLength: 120, compact: true }); } catch (_) { return String(arg); }
  };

  const fmt = (lvl: string, args: any[]) =>
    `[${new Date().toISOString()}] [${lvl}] ${args.map(formatArg).join(' ')}`;

  return {
    levelName,
    filePath,
    error: (...args) => {
      if (level >= levels.error) {
        const line = fmt('ERROR', args);
        writeLine(line);
        if (!app.isPackaged) process.stderr.write(line + '\n');
      }
    },
    info: (...args) => {
      if (level >= levels.info) {
        const line = fmt('INFO', args);
        writeLine(line);
        if (!app.isPackaged) process.stdout.write(line + '\n');
      }
    },
    debug: (...args) => {
      if (level >= levels.debug) {
        const line = fmt('DEBUG', args);
        writeLine(line);
        if (!app.isPackaged) process.stdout.write(line + '\n');
      }
    }
  };
}

/**
 * Patches console.log/warn/error to route through the logger and registers it
 * in ctx so all modules get the same logger instance via the live binding.
 */
export function installConsoleLogger(loggerInstance: Logger): void {
  if (consolePatched || !loggerInstance) return;
  consolePatched = true;
  setLogger(loggerInstance);
  console.log = (...args) => loggerInstance.info(...args);
  console.warn = (...args) => loggerInstance.error(...args);
  console.error = (...args) => loggerInstance.error(...args);
  loggerInstance.debug('[log] console patched', { file: loggerInstance.filePath, level: loggerInstance.levelName });
}
