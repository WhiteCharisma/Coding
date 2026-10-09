import { and, eq, lt, ne } from 'drizzle-orm';
import type { AppContext } from '../context';
import { newId } from '../db/ids';
import { sessions, users } from '../db/schema';
import { randomToken, sha256 } from '../lib/crypto';
import type { UserRow } from '../users/dto';

export type SessionRow = typeof sessions.$inferSelect;

export interface AuthState {
  user: UserRow;
  session: SessionRow;
  /** True when the expiry was extended and the cookie should be re-issued. */
  renewed: boolean;
}

const LAST_SEEN_RESOLUTION_MS = 5 * 60 * 1000;
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export function createSession(
  ctx: AppContext,
  userId: string,
  meta: { userAgent?: string; ip?: string },
): { token: string; session: SessionRow } {
  const token = randomToken(32);
  const now = Date.now();
  const session: SessionRow = {
    id: newId(now),
    userId,
    tokenHash: sha256(token),
    userAgent: (meta.userAgent ?? '').slice(0, 200),
    ip: (meta.ip ?? '').slice(0, 64),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + ctx.config.sessionTtlMs,
  };
  ctx.db.insert(sessions).values(session).run();
  return { token, session };
}

/**
 * Resolves a session cookie value to the signed-in user. Expired sessions and
 * sessions of non-active accounts are rejected. Expiry slides forward with use.
 */
export function validateSessionToken(ctx: AppContext, token: string | undefined | null): AuthState | null {
  if (!token || token.length < 20 || token.length > 100) return null;
  const tokenHash = sha256(token);
  const row = ctx.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash))
    .get();
  if (!row) return null;
  const now = Date.now();
  if (row.session.expiresAt <= now) {
    ctx.db.delete(sessions).where(eq(sessions.id, row.session.id)).run();
    return null;
  }
  if (row.user.status !== 'active') return null;

  let renewed = false;
  const patch: Partial<SessionRow> = {};
  if (now - row.session.lastSeenAt > LAST_SEEN_RESOLUTION_MS) patch.lastSeenAt = now;
  if (row.session.expiresAt - now < ctx.config.sessionTtlMs - RENEW_AFTER_MS) {
    patch.expiresAt = now + ctx.config.sessionTtlMs;
    renewed = true;
  }
  if (Object.keys(patch).length > 0) {
    ctx.db.update(sessions).set(patch).where(eq(sessions.id, row.session.id)).run();
    Object.assign(row.session, patch);
  }
  return { user: row.user, session: row.session, renewed };
}

export function revokeSession(ctx: AppContext, sessionId: string): void {
  ctx.db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  ctx.realtime.disconnectSession(sessionId);
}

/** Revokes every session of a user, optionally keeping the current one. */
export function revokeUserSessions(ctx: AppContext, userId: string, exceptSessionId?: string): number {
  const where = exceptSessionId
    ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
    : eq(sessions.userId, userId);
  const victims = ctx.db.select({ id: sessions.id }).from(sessions).where(where).all();
  ctx.db.delete(sessions).where(where).run();
  for (const v of victims) ctx.realtime.disconnectSession(v.id);
  return victims.length;
}

export function purgeExpiredSessions(ctx: AppContext): number {
  return ctx.db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run().changes;
}
