import fs from 'node:fs';
import { and, count, desc, eq, gt, isNull, like, lt, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { AuditEventDTO, PlatformRole, platformInviteSchema } from '@creator-network/shared';
import { audit } from '../audit';
import { anonymiseUser, createPasswordResetLink } from '../auth/service';
import { revokeUserSessions } from '../auth/sessions';
import { removeCommunity, toAuditDTOs, toCommunitySummary } from '../communities/service';
import type { AppContext } from '../context';
import {
  auditEvents,
  communities,
  messages,
  registrationInvites,
  reports,
  sessions,
  uploads,
  users,
} from '../db/schema';
import { randomCode } from '../lib/crypto';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { notify } from '../notifications/service';
import { readiness } from '../ops/health';
import { listBackups, publicBackupInfo } from '../ops/backup';
import { summaryColumns, toUserSummary, type UserRow } from '../users/dto';

export interface AdminUserDTO {
  id: string;
  username: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  platformRole: PlatformRole;
  status: 'active' | 'suspended' | 'deleted';
  suspendedUntil: number | null;
  suspensionReason: string | null;
  isDemo: boolean;
  createdAt: number;
}

function toAdminUser(u: UserRow): AdminUserDTO {
  const summary = toUserSummary(u);
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
    avatarUrl: summary.avatarUrl,
    platformRole: u.platformRole,
    status: u.status,
    suspendedUntil: u.suspendedUntil,
    suspensionReason: u.suspensionReason,
    isDemo: u.isDemo,
    createdAt: u.createdAt,
  };
}

function requireUser(ctx: AppContext, userId: string): UserRow {
  const u = ctx.db.select().from(users).where(eq(users.id, userId)).get();
  if (!u) throw notFound('User not found.');
  return u;
}

/** Moderators may act on members only; admins on anyone except themselves. */
function assertCanModerate(actor: UserRow, target: UserRow): void {
  if (actor.id === target.id) throw badRequest('You cannot do that to your own account.');
  if (actor.platformRole === 'moderator' && target.platformRole !== 'member') {
    throw forbidden('Moderators can only act on regular members.');
  }
}

export function overview(ctx: AppContext) {
  const dayAgo = Date.now() - 24 * 3600_000;
  const n = (q: { n: number } | undefined) => q?.n ?? 0;
  let dbBytes = 0;
  for (const suffix of ['', '-wal']) {
    try {
      dbBytes += fs.statSync(ctx.config.dbPath + suffix).size;
    } catch {
      /* file may not exist */
    }
  }
  const mem = process.memoryUsage();
  const latestBackup = listBackups(ctx.config.backupDir)[0];
  return {
    health: readiness(ctx),
    counts: {
      users: n(ctx.db.select({ n: count() }).from(users).where(eq(users.status, 'active')).get()),
      suspendedUsers: n(ctx.db.select({ n: count() }).from(users).where(eq(users.status, 'suspended')).get()),
      communities: n(ctx.db.select({ n: count() }).from(communities).get()),
      messages: n(ctx.db.select({ n: count() }).from(messages).where(isNull(messages.deletedAt)).get()),
      messages24h: n(ctx.db.select({ n: count() }).from(messages).where(gt(messages.createdAt, dayAgo)).get()),
      activeSessions: n(ctx.db.select({ n: count() }).from(sessions).where(gt(sessions.lastSeenAt, dayAgo)).get()),
      openReports: n(ctx.db.select({ n: count() }).from(reports).where(eq(reports.status, 'open')).get()),
      uploadsBytes:
        ctx.db
          .select({ n: sql<number>`coalesce(sum(${uploads.size}), 0)` })
          .from(uploads)
          .where(eq(uploads.status, 'attached'))
          .get()?.n ?? 0,
    },
    runtime: {
      connectedSockets: ctx.realtime.connectedSocketCount(),
      voicePeers: ctx.realtime.voicePeerCount(),
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      nodeVersion: process.version,
      databaseBytes: dbBytes,
    },
    email: { transport: ctx.mailer.transport, enabled: ctx.mailer.enabled },
    backups: {
      latest: latestBackup ? publicBackupInfo(latestBackup) : null,
      intervalHours: ctx.config.backupIntervalHours,
    },
  };
}

export function listUsers(
  ctx: AppContext,
  opts: { q?: string; status?: string; role?: string; before?: number },
): AdminUserDTO[] {
  const conditions = [];
  if (opts.q) {
    const term = `%${opts.q.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conditions.push(
      or(
        like(users.username, term),
        like(users.email, term),
        sql`lower(${users.displayName}) like ${term} escape '\\'`,
      ),
    );
  }
  if (opts.status === 'active' || opts.status === 'suspended' || opts.status === 'deleted')
    conditions.push(eq(users.status, opts.status));
  if (opts.role === 'member' || opts.role === 'moderator' || opts.role === 'admin')
    conditions.push(eq(users.platformRole, opts.role));
  if (opts.before) conditions.push(lt(users.createdAt, opts.before));
  return ctx.db
    .select()
    .from(users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(100)
    .all()
    .map(toAdminUser);
}

export function suspendUser(
  ctx: AppContext,
  actor: UserRow,
  userId: string,
  reason: string,
  days: number | null,
): AdminUserDTO {
  const target = requireUser(ctx, userId);
  assertCanModerate(actor, target);
  if (target.status === 'deleted') throw badRequest('This account was deleted.');
  const until = days === null ? null : Date.now() + days * 24 * 3600_000;
  ctx.db
    .update(users)
    .set({ status: 'suspended', suspendedUntil: until, suspensionReason: reason, updatedAt: Date.now() })
    .where(eq(users.id, userId))
    .run();
  revokeUserSessions(ctx, userId);
  ctx.realtime.disconnectUser(userId, 'suspended');
  audit(ctx.db, {
    scope: 'platform',
    actorId: actor.id,
    action: 'user.suspended',
    targetType: 'user',
    targetId: userId,
    targetLabel: target.username,
    reason,
    metadata: { until },
  });
  return toAdminUser(requireUser(ctx, userId));
}

export function restoreUser(ctx: AppContext, actor: UserRow, userId: string): AdminUserDTO {
  const target = requireUser(ctx, userId);
  assertCanModerate(actor, target);
  if (target.status !== 'suspended') throw badRequest('This account is not suspended.');
  ctx.db
    .update(users)
    .set({ status: 'active', suspendedUntil: null, suspensionReason: null, updatedAt: Date.now() })
    .where(eq(users.id, userId))
    .run();
  audit(ctx.db, {
    scope: 'platform',
    actorId: actor.id,
    action: 'user.restored',
    targetType: 'user',
    targetId: userId,
    targetLabel: target.username,
  });
  notify(ctx, { userId, type: 'moderation', data: { event: 'restored' } });
  return toAdminUser(requireUser(ctx, userId));
}

export function setPlatformRole(ctx: AppContext, actor: UserRow, userId: string, role: PlatformRole): AdminUserDTO {
  if (actor.platformRole !== 'admin') throw forbidden();
  const target = requireUser(ctx, userId);
  if (target.id === actor.id) throw badRequest('You cannot change your own platform role.');
  if (target.status !== 'active') throw badRequest('Only active accounts can be given a platform role.');
  if (target.platformRole === 'admin' && role !== 'admin') {
    const admins =
      ctx.db
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.platformRole, 'admin'), eq(users.status, 'active')))
        .get()?.n ?? 0;
    if (admins <= 1) throw conflict('There must always be at least one administrator.');
  }
  ctx.db.update(users).set({ platformRole: role, updatedAt: Date.now() }).where(eq(users.id, userId)).run();
  audit(ctx.db, {
    scope: 'platform',
    actorId: actor.id,
    action: 'user.platform_role_changed',
    targetType: 'user',
    targetId: userId,
    targetLabel: target.username,
    metadata: { from: target.platformRole, to: role },
  });
  ctx.realtime.toUser(userId, 'user:update', { userId });
  return toAdminUser(requireUser(ctx, userId));
}

export async function adminDeleteUser(
  ctx: AppContext,
  actor: UserRow,
  userId: string,
  deleteMessages: boolean,
): Promise<void> {
  if (actor.platformRole !== 'admin') throw forbidden();
  const target = requireUser(ctx, userId);
  assertCanModerate(actor, target);
  const owned = ctx.db
    .select({ id: communities.id, name: communities.name })
    .from(communities)
    .where(eq(communities.ownerId, userId))
    .all();
  if (owned.length) {
    throw new AppError(
      409,
      'owns_communities',
      'This user owns communities. Delete them or ask the user to transfer ownership first.',
      { communities: owned },
    );
  }
  await anonymiseUser(ctx, userId, { deleteMessages, actorId: actor.id, action: 'user.deleted_by_admin' });
}

export function adminResetLink(ctx: AppContext, actor: UserRow, userId: string): string {
  if (actor.platformRole !== 'admin') throw forbidden();
  const target = requireUser(ctx, userId);
  const link = createPasswordResetLink(ctx, userId);
  audit(ctx.db, {
    scope: 'platform',
    actorId: actor.id,
    action: 'user.reset_link_created',
    targetType: 'user',
    targetId: userId,
    targetLabel: target.username,
  });
  return link;
}

export function listAllCommunities(ctx: AppContext, q?: string) {
  const rows = ctx.db
    .select({ community: communities, owner: summaryColumns })
    .from(communities)
    .innerJoin(users, eq(users.id, communities.ownerId))
    .where(q ? like(communities.name, `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`) : undefined)
    .orderBy(desc(communities.createdAt))
    .limit(200)
    .all();
  return rows.map((r) => ({ ...toCommunitySummary(r.community), owner: toUserSummary(r.owner) }));
}

export function adminDeleteCommunity(ctx: AppContext, actor: UserRow, communityId: string, reason: string): void {
  if (actor.platformRole !== 'admin') throw forbidden();
  const community = ctx.db
    .select({ ownerId: communities.ownerId, name: communities.name })
    .from(communities)
    .where(eq(communities.id, communityId))
    .get();
  if (!community) throw notFound();
  removeCommunity(ctx, communityId, actor.id, 'community.removed_by_admin', 'platform', reason);
  notify(ctx, {
    userId: community.ownerId,
    type: 'moderation',
    data: { event: 'community_removed', communityName: community.name, reason },
  });
}

export function platformAudit(ctx: AppContext, before?: number): AuditEventDTO[] {
  const rows = ctx.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.scope, 'platform'), before ? lt(auditEvents.createdAt, before) : undefined))
    .orderBy(desc(auditEvents.createdAt))
    .limit(100)
    .all();
  return toAuditDTOs(ctx.db, rows);
}

/* ------------------------------------------------- Registration invites */

export function listRegistrationInvites(ctx: AppContext) {
  return ctx.db
    .select()
    .from(registrationInvites)
    .where(isNull(registrationInvites.revokedAt))
    .orderBy(desc(registrationInvites.createdAt))
    .limit(200)
    .all();
}

export function createRegistrationInvite(
  ctx: AppContext,
  actor: UserRow,
  input: z.output<typeof platformInviteSchema>,
) {
  const now = Date.now();
  const row = {
    code: randomCode(12),
    createdBy: actor.id,
    note: input.note,
    maxUses: input.maxUses,
    uses: 0,
    expiresAt: input.expiresInHours === null ? null : now + input.expiresInHours * 3600_000,
    revokedAt: null,
    createdAt: now,
  };
  ctx.db.insert(registrationInvites).values(row).run();
  audit(ctx.db, {
    scope: 'platform',
    actorId: actor.id,
    action: 'registration_invite.created',
    targetType: 'registration_invite',
    targetId: row.code,
    metadata: { maxUses: row.maxUses, note: row.note },
  });
  return row;
}

export function revokeRegistrationInvite(ctx: AppContext, actor: UserRow, code: string): void {
  const res = ctx.db
    .update(registrationInvites)
    .set({ revokedAt: Date.now() })
    .where(eq(registrationInvites.code, code))
    .run();
  if (res.changes === 0) throw notFound();
  audit(ctx.db, {
    scope: 'platform',
    actorId: actor.id,
    action: 'registration_invite.revoked',
    targetType: 'registration_invite',
    targetId: code,
  });
}

export function demoUserIds(ctx: AppContext): string[] {
  return ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isDemo, true))
    .all()
    .map((u) => u.id);
}
