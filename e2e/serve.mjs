#!/usr/bin/env node
// Starts the production build (apps/server/dist + apps/web/dist) on 127.0.0.1:E2E_PORT
// with a fresh, throw-away data directory and an E2E administrator. Used by playwright.config.ts.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_ADMIN, e2eDataRoot, e2ePort } from './env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['apps/server/dist/main.js', 'apps/server/dist/cli.js', 'apps/web/dist/index.html']) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`Missing ${file}. Run "npm run build" first (or unset E2E_SKIP_BUILD).`);
    process.exit(1);
  }
}

const dataRoot = e2eDataRoot();
fs.rmSync(dataRoot, { recursive: true, force: true });
fs.mkdirSync(dataRoot, { recursive: true });

const port = e2ePort();
const env = {
  ...process.env,
  // "test" keeps production code paths but allows relaxed rate limits (many sign-ups from one IP).
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: String(port),
  APP_ORIGIN: `http://127.0.0.1:${port}`,
  ADDITIONAL_ORIGINS: `http://localhost:${port}`,
  DATA_DIR: path.join(dataRoot, 'data'),
  BACKUP_DIR: path.join(dataRoot, 'backups'),
  BACKUP_INTERVAL_HOURS: '0',
  RATE_LIMIT_MODE: 'relaxed',
  MAIL_TRANSPORT: 'outbox',
  LOG_LEVEL: 'warn',
};

const admin = spawnSync(
  process.execPath,
  [
    'apps/server/dist/cli.js',
    'create-admin',
    '--username',
    E2E_ADMIN.username,
    '--email',
    E2E_ADMIN.email,
    '--display-name',
    E2E_ADMIN.displayName,
  ],
  { cwd: root, env, input: `${E2E_ADMIN.password}\n${E2E_ADMIN.password}\n`, encoding: 'utf8' },
);
if (admin.status !== 0) {
  console.error(admin.stdout, admin.stderr);
  process.exit(admin.status ?? 1);
}

const server = spawn(process.execPath, ['apps/server/dist/main.js'], { cwd: root, env, stdio: 'inherit' });
const stop = () => server.kill('SIGTERM');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => {
  fs.rmSync(dataRoot, { recursive: true, force: true });
  process.exit(code ?? 0);
});
