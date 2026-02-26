import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import duckdb from 'duckdb';
import { app } from './ctx.js';

export type HistoryEntry = {
  id: number;
  sessionId: string;
  entryType: string;
  timestamp: number;
  title: string;
  preview: string;
  content: string;
  metadata: Record<string, unknown>;
};

export type HistorySummary = Omit<HistoryEntry, 'content'>;

let db: duckdb.Database | null = null;
let connection: duckdb.Connection | null = null;
let updateHook: (() => void) | null = null;

function resolveDbPath(): string {
  const override = process.env.TRAY_HISTORY_DB_PATH;
  if (override) return override;
  const userData = app?.getPath?.('userData');
  if (userData) return path.join(userData, 'history.db');
  return path.join(process.cwd(), 'history.db');
}

function ensureConnection(): duckdb.Connection {
  if (!connection) throw new Error('history store is not initialized');
  return connection;
}

export function setHistoryUpdateHook(hook: (() => void) | null): void {
  updateHook = hook;
}

function triggerUpdateHook(): void {
  if (typeof updateHook === 'function') {
    try {
      updateHook();
    } catch (err) {
      console.error('[history-store] update hook failed', err);
    }
  }
}

function run(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const cb = (err: any) => err ? reject(err) : resolve();
    if (params.length) {
      ensureConnection().run(sql, ...params, cb);
    } else {
      ensureConnection().run(sql, cb);
    }
  });
}

function all(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const cb = (err: any, rows: any[]) => err ? reject(err) : resolve(rows ?? []);
    if (params.length) {
      ensureConnection().all(sql, ...params, cb);
    } else {
      ensureConnection().all(sql, cb);
    }
  });
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (_) { return {}; }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function metadataToString(metadata?: Record<string, unknown>): string {
  if (!metadata) return '{}';
  try { return JSON.stringify(metadata); } catch (_) { return '{}'; }
}

function mapRow(row: any): HistoryEntry {
  return {
    id: Number(row.id),
    sessionId: String(row.session_id ?? ''),
    entryType: String(row.entry_type ?? ''),
    timestamp: Number(row.timestamp ?? 0),
    title: String(row.title ?? ''),
    preview: String(row.preview ?? ''),
    content: String(row.content ?? ''),
    metadata: parseMetadata(row.metadata)
  };
}

type HistoryQueryOpts = {
  limit?: number;
  offset?: number;
  search?: string;
  entryType?: string;
  sessionId?: string;
};

function buildQueryConditions(opts: HistoryQueryOpts) {
  const clauses: string[] = [];
  const params: any[] = [];
  if (opts.entryType) {
    clauses.push('entry_type = ?');
    params.push(opts.entryType);
  }
  if (opts.sessionId) {
    clauses.push('session_id = ?');
    params.push(opts.sessionId);
  }
  if (opts.search) {
    clauses.push('(lower(title) LIKE ? OR lower(content) LIKE ? OR lower(metadata) LIKE ?)');
    const term = `%${opts.search.toLowerCase()}%`;
    params.push(term, term, term);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

async function queryHistory(opts: HistoryQueryOpts = {}, select: string = '*'): Promise<any[]> {
  const { where, params } = buildQueryConditions(opts);
  const limit = typeof opts.limit === 'number' ? opts.limit : 50;
  const offset = typeof opts.offset === 'number' ? opts.offset : 0;
  return all(`
    SELECT ${select} FROM history_entries
    ${where}
    ORDER BY timestamp DESC
    LIMIT ${limit} OFFSET ${offset}
  `, params);
}

async function getNextId(): Promise<number> {
  const rows = await all('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM history_entries');
  return Number(rows[0]?.next_id ?? 1);
}

export async function initHistoryStore(): Promise<void> {
  if (db) return;
  const filePath = resolveDbPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  db = new duckdb.Database(filePath);
  connection = db.connect();
  await run(`
    CREATE TABLE IF NOT EXISTS history_entries (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      timestamp BIGINT NOT NULL,
      title TEXT,
      preview TEXT,
      content TEXT,
      metadata JSON
    )
  `);
}

export async function recordTranscriptEntry(opts: {
  sessionId: string;
  transcript: string;
  title?: string;
  preview?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}): Promise<HistoryEntry> {
  const normalized = opts.transcript.trim();
  const preview = opts.preview ?? normalized.substring(0, 240);
  const timestamp = opts.timestamp ?? Date.now();
  const payload = {
    ...opts.metadata,
    transcript: normalized
  } as Record<string, unknown>;
  const id = await getNextId();
  await run(
    `INSERT INTO history_entries (id, session_id, entry_type, timestamp, title, preview, content, metadata)
     VALUES (?, ?, 'transcript', ?, ?, ?, ?, ?)`,
    [id, opts.sessionId, timestamp, opts.title ?? 'Transcript', preview, normalized, metadataToString(payload)]
  );
  const rows = await all('SELECT * FROM history_entries WHERE id = ?', [id]);
  const entry = mapRow(rows[0] ?? {});
  triggerUpdateHook();
  return entry;
}

export async function recordAssistantExchange(opts: {
  sessionId?: string;
  prompt: string;
  response: string;
  title?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}): Promise<HistoryEntry> {
  const sessionId = opts.sessionId || randomUUID();
  const normalizedPrompt = opts.prompt.trim();
  const normalizedResponse = opts.response.trim();
  const timestamp = opts.timestamp ?? Date.now();
  const payload: Record<string, unknown> = {
    ...opts.metadata,
    prompt: normalizedPrompt,
    assistantResponse: normalizedResponse
  };
  const content = normalizedResponse;
  const preview = normalizedResponse || normalizedPrompt;
  const id = await getNextId();
  await run(
    `INSERT INTO history_entries (id, session_id, entry_type, timestamp, title, preview, content, metadata)
     VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)`,
    [id, sessionId, timestamp, opts.title ?? 'Assistant', preview.substring(0, 240), content, metadataToString(payload)]
  );
  const rows = await all('SELECT * FROM history_entries WHERE id = ?', [id]);
  const entry = mapRow(rows[0] ?? {});
  triggerUpdateHook();
  return entry;
}

export async function getHistorySummaries(opts: HistoryQueryOpts = {}): Promise<HistorySummary[]> {
  const rows = await queryHistory(opts);
  return rows.map((row) => {
    const { content, ...summary } = mapRow(row);
    return summary;
  });
}

export async function getHistoryEntries(opts: HistoryQueryOpts = {}): Promise<HistoryEntry[]> {
  const rows = await queryHistory(opts);
  return rows.map(mapRow);
}

export async function getHistoryEntry(id: number): Promise<HistoryEntry | null> {
  const rows = await all('SELECT * FROM history_entries WHERE id = ?', [id]);
  if (!rows.length) return null;
  return mapRow(rows[0]);
}

export async function exportHistorySnapshot(targetPath?: string): Promise<{ path: string; entries: HistoryEntry[] }> {
  const entries = await getHistoryEntries({ limit: Number.MAX_SAFE_INTEGER });
  const finalPath = targetPath || path.join(app?.getPath?.('desktop') || process.cwd(), 'tray-history.json');
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(finalPath, JSON.stringify(entries, null, 2), 'utf8');
  return { path: finalPath, entries };
}

export async function exportHistoryEntry(id: number, targetPath?: string): Promise<{ path: string; entry: HistoryEntry | null }> {
  const entry = await getHistoryEntry(id);
  if (!entry) {
    throw new Error('history entry not found');
  }
  const fallbackName = `tray-history-${entry.entryType}-${entry.id}.json`;
  const finalPath = targetPath || path.join(app?.getPath?.('desktop') || process.cwd(), fallbackName);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(finalPath, JSON.stringify(entry, null, 2), 'utf8');
  return { path: finalPath, entry };
}

export async function closeHistoryStore(): Promise<void> {
  if (connection) {
    await new Promise<void>((resolve) => connection?.close(() => resolve()));
    connection = null;
  }
  if (db) {
    await new Promise<void>((resolve) => db?.close(() => resolve()));
    db = null;
  }
  updateHook = null;
}
