import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type DB = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  sqlite: Database.Database;
  db: DB;
  close: () => void;
}

/** Locates the SQL migrations both when running from source and from the bundled dist/. */
export function findMigrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(here, 'drizzle'), path.join(here, '..', 'drizzle'), path.join(here, '..', '..', 'drizzle')];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'meta', '_journal.json'))) return candidate;
  }
  throw new Error(`Could not find database migrations (looked in: ${candidates.join(', ')})`);
}

export function configureConnection(sqlite: Database.Database): void {
  // WAL lets readers proceed while a write is in progress and survives crashes safely.
  sqlite.pragma('journal_mode = WAL');
  // NORMAL is durable against application crashes; a power loss may lose the
  // last few transactions but never corrupts the database (recommended for WAL).
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('temp_store = MEMORY');
  sqlite.pragma('cache_size = -16000'); // ~16 MB page cache
}

export function openDatabase(dbPath: string, options: { migrate?: boolean } = {}): DatabaseHandle {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  configureConnection(sqlite);
  const db = drizzle(sqlite, { schema });
  if (options.migrate !== false) {
    migrate(db, { migrationsFolder: findMigrationsFolder() });
  }
  return {
    sqlite,
    db,
    close: () => {
      try {
        sqlite.pragma('optimize');
        // Fold the WAL back into the main file so a stopped server leaves a single file.
        sqlite.pragma('wal_checkpoint(TRUNCATE)');
      } finally {
        sqlite.close();
      }
    },
  };
}

/** Name of the most recently applied migration (shown in health checks and backups). */
export function currentMigration(sqlite: Database.Database): { id: number; createdAt: number } | null {
  try {
    const row = sqlite
      .prepare('select id, created_at as createdAt from __drizzle_migrations order by created_at desc limit 1')
      .get() as { id: number; createdAt: number } | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

/** A transaction handle inside `db.transaction((tx) => …)`. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
/** Either the database or an open transaction (services accept both). */
export type DbOrTx = DB | Tx;
