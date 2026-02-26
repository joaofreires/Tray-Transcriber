import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeHistoryStore,
  exportHistoryEntry,
  exportHistorySnapshot,
  getHistoryEntry,
  getHistorySummaries,
  initHistoryStore,
  recordAssistantExchange,
  recordTranscriptEntry
} from '../history-store.js';

const TEST_DB_PATH = path.join(os.tmpdir(), 'tray-history-test.db');
const EXPORT_ALL_PATH = path.join(os.tmpdir(), 'tray-history-export.json');
const EXPORT_ENTRY_PATH = path.join(os.tmpdir(), 'tray-history-entry.json');

afterEach(async () => {
  await closeHistoryStore();
  delete process.env.TRAY_HISTORY_DB_PATH;
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

beforeEach(async () => {
  delete process.env.TRAY_HISTORY_DB_PATH;
  process.env.TRAY_HISTORY_DB_PATH = TEST_DB_PATH;
  if (fs.existsSync(EXPORT_ALL_PATH)) fs.unlinkSync(EXPORT_ALL_PATH);
  if (fs.existsSync(EXPORT_ENTRY_PATH)) fs.unlinkSync(EXPORT_ENTRY_PATH);
  await initHistoryStore();
});

describe('history store', () => {
  it('creates transcripts and assistant records', async () => {
    const transcript = await recordTranscriptEntry({
      sessionId: 'session-test',
      transcript: 'Hello world',
      metadata: { foo: 'bar' }
    });

    const assistant = await recordAssistantExchange({
      sessionId: transcript.sessionId,
      prompt: 'Hello',
      response: 'Hi there'
    });

    const summaries = await getHistorySummaries({ limit: 10 });
    expect(summaries.length).toBe(2);
    expect(summaries[0].entryType).toBe('assistant');

    const fetched = await getHistoryEntry(transcript.id);
    expect(fetched?.content).toBe('Hello world');

    const snapshotResult = await exportHistorySnapshot(EXPORT_ALL_PATH);
    expect(snapshotResult.path).toBe(EXPORT_ALL_PATH);
    expect(fs.existsSync(EXPORT_ALL_PATH)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(EXPORT_ALL_PATH, 'utf8')) as unknown[];
    expect(parsed.length).toBe(2);

    const entryExport = await exportHistoryEntry(transcript.id, EXPORT_ENTRY_PATH);
    expect(entryExport.path).toBe(EXPORT_ENTRY_PATH);
    expect(fs.existsSync(EXPORT_ENTRY_PATH)).toBe(true);
    expect(entryExport.entry?.id).toBe(transcript.id);
  });
});
