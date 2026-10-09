#!/usr/bin/env node
// Starts the API server (tsx watch, :3000) and the Vite dev server (:5173) together.
// Open http://localhost:5173 — Vite proxies /api and /socket.io to the server.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  // The browser talks to Vite; the server must accept that origin for CSRF/WebSocket checks.
  APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:5173',
  ADDITIONAL_ORIGINS: process.env.ADDITIONAL_ORIGINS ?? 'http://127.0.0.1:5173',
  // Same locations as `npm start`, `npm run cli` and `npm run seed:demo` (repository root).
  DATA_DIR: process.env.DATA_DIR ?? path.join(root, 'data'),
  BACKUP_DIR: process.env.BACKUP_DIR ?? path.join(root, 'backups'),
};

const procs = [
  { name: 'server', color: '\x1b[36m', args: ['exec', '--', 'tsx', 'watch', '--clear-screen=false', 'apps/server/src/main.ts'] },
  { name: 'web   ', color: '\x1b[35m', args: ['run', 'dev', '-w', '@creator-network/web'] },
].map(({ name, color, args }) => {
  const child = spawn(npm, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `${color}${name}\x1b[0m │ `;
  const pipe = (stream, out) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      process.stderr.write(`${prefix}exited with code ${code}; stopping\n`);
      shutdown(code ?? 1);
    }
  });
  return child;
});

let shuttingDown = false;
function shutdown(code = 0) {
  shuttingDown = true;
  for (const p of procs) if (p.exitCode === null) p.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
