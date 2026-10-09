import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { currentMigration } from '../db/client';

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  checks: Record<string, { ok: boolean; detail?: string }>;
}

export function readiness(ctx: AppContext): ReadinessReport {
  const checks: ReadinessReport['checks'] = {};
  try {
    ctx.sqlite.prepare('select 1').get();
    const migration = currentMigration(ctx.sqlite);
    checks.database = { ok: true, detail: migration ? `migration ${migration.createdAt}` : 'no migrations' };
  } catch (err) {
    checks.database = { ok: false, detail: err instanceof Error ? err.message : 'unknown error' };
  }
  try {
    fs.accessSync(ctx.config.uploadsDir, fs.constants.W_OK);
    checks.uploads = { ok: true };
  } catch {
    checks.uploads = { ok: false, detail: 'uploads directory is not writable' };
  }
  try {
    const stat = fs.statfsSync(ctx.config.dataDir);
    const freeMb = Math.round((stat.bavail * stat.bsize) / 1024 / 1024);
    checks.disk = { ok: freeMb > 200, detail: `${freeMb} MB free` };
  } catch {
    checks.disk = { ok: false, detail: 'could not read disk usage' };
  }
  return {
    status: Object.values(checks).every((c) => c.ok) ? 'ok' : 'degraded',
    version: ctx.config.version,
    uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
    checks,
  };
}

export function registerHealthRoutes(app: FastifyInstance, ctx: AppContext): void {
  fs.mkdirSync(ctx.config.uploadsDir, { recursive: true });
  // Liveness: the process is up and serving requests.
  app.get('/api/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    version: ctx.config.version,
    uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
  }));
  // Readiness: dependencies (database, disk) are usable. Used by Docker's healthcheck.
  app.get('/api/health/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    const report = readiness(ctx);
    reply.status(report.status === 'ok' ? 200 : 503);
    return report;
  });
}
