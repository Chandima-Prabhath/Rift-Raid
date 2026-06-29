/**
 * Rift & Raid — Persistence (SQLite)
 *
 * Saves/loads the entire world state to a single SQLite file.
 *
 * Uses Bun's built-in `bun:sqlite` (zero-dependency, native, fast).
 * The API is similar to better-sqlite3 but with bun:sqlite semantics.
 *
 * Strategy:
 *   - One row in `world` table holding the latest serialized state as JSON.
 *   - WAL mode for crash safety.
 *   - Auto-vacuum to keep file small.
 *
 * Phase 0 implementation: single-row, full-state JSON. Phase 5+ may
 * normalize into per-entity tables if performance requires.
 */

import { Database } from 'bun:sqlite';
import type { PersistedWorldState } from '@rift-and-raid/shared';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface PersistenceOptions {
  /** Path to SQLite file. Created if missing. */
  dbPath: string;
}

export class Persistence {
  private db: Database;

  constructor(opts: PersistenceOptions) {
    const dir = dirname(opts.dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // bun:sqlite Database constructor opens (or creates) the file.
    this.db = new Database(opts.dbPath, { create: true });
    // Apply pragmas for crash safety and performance.
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec('PRAGMA auto_vacuum = INCREMENTAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS world (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        state_json TEXT NOT NULL,
        saved_at INTEGER NOT NULL
      );

      INSERT OR IGNORE INTO schema_migrations (version, applied_at)
        VALUES (1, datetime('now'));
    `);
  }

  /** Save full world state. Synchronous. */
  save(state: PersistedWorldState): void {
    const json = JSON.stringify(state);
    const now = Date.now();
    // bun:sqlite uses ? for parameters (same as better-sqlite3).
    const stmt = this.db.prepare(
      `INSERT INTO world (id, state_json, saved_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, saved_at = excluded.saved_at`
    );
    stmt.run(json, now);
  }

  /** Load saved world state, or null if never saved. */
  load(): PersistedWorldState | null {
    const stmt = this.db.prepare(
      `SELECT state_json, saved_at FROM world WHERE id = 1`
    );
    const row = stmt.get() as { state_json: string; saved_at: number } | null;
    if (!row) return null;
    try {
      return JSON.parse(row.state_json) as PersistedWorldState;
    } catch (err) {
      console.error('[Persistence] failed to parse saved state:', err);
      return null;
    }
  }

  /** Get the last saved timestamp (Date.now() when save ran). */
  lastSavedAt(): number | null {
    const stmt = this.db.prepare(
      `SELECT saved_at FROM world WHERE id = 1`
    );
    const row = stmt.get() as { saved_at: number } | null;
    return row?.saved_at ?? null;
  }

  /** Close the database handle. Safe to call multiple times. */
  close(): void {
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      this.db.close();
    } catch (err) {
      console.warn('[Persistence] close error:', err);
    }
  }
}
