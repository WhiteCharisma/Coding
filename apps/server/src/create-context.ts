import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from './config';
import type { AppContext } from './context';
import { openDatabase } from './db/client';
import { createMailer } from './lib/mailer';
import { configurePasswordHashing } from './lib/password';
import { NoopRealtime } from './realtime/types';
import { SettingsStore } from './settings';

/** Opens the database (running pending migrations) and wires the shared services. */
export function createContext(config: AppConfig, log: FastifyBaseLogger): { ctx: AppContext; close: () => void } {
  configurePasswordHashing(config.argon2);
  const { db, sqlite, close } = openDatabase(config.dbPath);
  const ctx: AppContext = {
    config,
    db,
    sqlite,
    mailer: createMailer(config, log),
    settings: new SettingsStore(db, config),
    realtime: new NoopRealtime(),
    log,
    startedAt: Date.now(),
  };
  return { ctx, close };
}
