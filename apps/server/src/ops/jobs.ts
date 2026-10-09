import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { purgeExpiredSessions } from '../auth/sessions';
import type { AppContext } from '../context';
import { emailTokens, uploads } from '../db/schema';
import { deleteStoredFile } from '../uploads/service';
import { createBackup, listBackups } from './backup';

const HOUR = 3600_000;

/** Removes expired sessions/tokens and files that are no longer referenced. */
export async function runCleanup(ctx: AppContext): Promise<{ sessions: number; files: number; tokens: number }> {
  const now = Date.now();
  const sessions = purgeExpiredSessions(ctx);
  const tokens = ctx.db
    .delete(emailTokens)
    .where(
      or(
        lt(emailTokens.expiresAt, now - 7 * 24 * HOUR),
        and(isNotNull(emailTokens.usedAt), lt(emailTokens.usedAt, now - 7 * 24 * HOUR)),
      ),
    )
    .run().changes;

  let files = 0;
  for (;;) {
    const batch = ctx.db
      .select({ id: uploads.id, storageKey: uploads.storageKey })
      .from(uploads)
      .where(
        or(
          eq(uploads.status, 'deleted'),
          and(eq(uploads.status, 'pending'), lt(uploads.createdAt, now - HOUR)),
          and(
            eq(uploads.purpose, 'attachment'),
            eq(uploads.status, 'attached'),
            isNull(uploads.messageId),
            lt(uploads.createdAt, now - HOUR),
          ),
        ),
      )
      .limit(200)
      .all();
    if (batch.length === 0) break;
    for (const row of batch) {
      await deleteStoredFile(ctx, row.storageKey);
      try {
        ctx.db.delete(uploads).where(eq(uploads.id, row.id)).run();
      } catch {
        // Still referenced (e.g. an avatar row) — keep the row, mark it so it is not retried forever.
        ctx.db.update(uploads).set({ status: 'attached' }).where(eq(uploads.id, row.id)).run();
      }
      files++;
    }
  }

  const tmpDir = path.join(ctx.config.uploadsDir, 'tmp');
  try {
    for (const name of await fs.readdir(tmpDir)) {
      const full = path.join(tmpDir, name);
      const stat = await fs.stat(full);
      if (now - stat.mtimeMs > HOUR) await fs.rm(full, { force: true });
    }
  } catch {
    /* tmp dir may not exist yet */
  }
  if (sessions || files || tokens) ctx.log.info({ sessions, files, tokens }, 'cleanup finished');
  return { sessions, files, tokens };
}

export async function runScheduledBackup(ctx: AppContext): Promise<boolean> {
  if (ctx.config.backupIntervalHours <= 0) return false;
  const latest = listBackups(ctx.config.backupDir)[0];
  if (latest && Date.now() - latest.createdAt < ctx.config.backupIntervalHours * HOUR) return false;
  await createBackup(ctx, { reason: 'scheduled' });
  return true;
}

/** In-process periodic jobs (no separate worker needed). Returns a stop function. */
export function startJobs(ctx: AppContext): () => void {
  const safe = (name: string, fn: () => Promise<unknown>) => () => {
    fn().catch((err: unknown) => ctx.log.error({ err }, `${name} job failed`));
  };
  const cleanup = safe('cleanup', () => runCleanup(ctx));
  const backup = safe('backup', () => runScheduledBackup(ctx));
  const timers = [
    setTimeout(cleanup, 30_000),
    setInterval(cleanup, 10 * 60_000),
    setTimeout(backup, 60_000),
    setInterval(backup, 30 * 60_000),
  ];
  for (const t of timers) t.unref();
  return () => {
    for (const t of timers) clearTimeout(t);
  };
}
