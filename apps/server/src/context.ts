import type Database from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from './config';
import type { DB } from './db/client';
import type { Mailer } from './lib/mailer';
import type { Realtime } from './realtime/types';
import type { SettingsStore } from './settings';

/** Dependencies shared by all services. Created once in main.ts / tests. */
export interface AppContext {
  config: AppConfig;
  db: DB;
  sqlite: Database.Database;
  mailer: Mailer;
  settings: SettingsStore;
  realtime: Realtime;
  log: FastifyBaseLogger;
  startedAt: number;
}
