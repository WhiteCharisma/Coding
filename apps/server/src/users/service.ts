import { and, asc, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type {
  BootstrapDTO,
  UpdateProfileInput,
  UserProfile,
  UserSummary,
  updatePreferencesSchema,
} from '@creator-network/shared';
import { publicConfig } from '../auth/routes';
import type { AuthState } from '../auth/sessions';
import { computeUserChannelPermissions, getCommunityAccess } from '../communities/access';
import { buildCommunityDTO } from '../communities/service';
import type { AppContext } from '../context';
import { communities, communityMembers, uploads, userBlocks, users } from '../db/schema';
import { listDms, dmBlockReason } from '../dms/service';
import { badRequest, notFound } from '../lib/errors';
import { computeUnreads } from '../messages/service';
import { unreadNotificationCount } from '../notifications/service';
import { fileUrl, summaryColumns, toSelfUser, toUserSummary, type UserRow } from './dto';

export function getProfile(ctx: AppContext, viewer: UserRow, username: string): UserProfile {
  const u = ctx.db.select().from(users).where(eq(users.username, username.toLowerCase())).get();
  const staff = viewer.platformRole !== 'member';
  if (!u || u.status === 'deleted' || (u.status === 'suspended' && !staff)) throw notFound('User not found.');
  const mutual = ctx.db
    .select({ id: communities.id, name: communities.name, iconId: communities.iconId })
    .from(communityMembers)
    .innerJoin(communities, eq(communities.id, communityMembers.communityId))
    .where(
      and(
        eq(communityMembers.userId, u.id),
        sql`exists (select 1 from community_members v where v.community_id = ${communityMembers.communityId} and v.user_id = ${viewer.id})`,
      ),
    )
    .limit(12)
    .all();
  const blocked = !!ctx.db
    .select({ b: userBlocks.blockedId })
    .from(userBlocks)
    .where(and(eq(userBlocks.blockerId, viewer.id), eq(userBlocks.blockedId, u.id)))
    .get();
  return {
    ...toUserSummary(u),
    bio: u.bio,
    disciplines: u.disciplines,
    location: u.location,
    timezone: u.timezone,
    links: u.links,
    currentProjects: u.currentProjects,
    bannerHue: u.bannerHue,
    createdAt: u.createdAt,
    platformRole: u.platformRole,
    mutualCommunities: mutual.map((c) => ({ id: c.id, name: c.name, iconUrl: fileUrl(c.iconId) })),
    isBlocked: blocked,
    canMessage: u.id !== viewer.id && dmBlockReason(ctx.db, viewer, u) === null,
  };
}

export function updateProfile(ctx: AppContext, user: UserRow, input: UpdateProfileInput): UserRow {
  const patch = { ...input, updatedAt: Date.now() };
  ctx.db.update(users).set(patch).where(eq(users.id, user.id)).run();
  const updated = ctx.db.select().from(users).where(eq(users.id, user.id)).get() as UserRow;
  ctx.realtime.toUser(user.id, 'user:update', { userId: user.id });
  return updated;
}

export function updatePreferences(
  ctx: AppContext,
  user: UserRow,
  input: z.output<typeof updatePreferencesSchema>,
): UserRow {
  const patch: Partial<UserRow> = { updatedAt: Date.now() };
  if (input.presence) patch.presence = input.presence;
  if (input.dmPolicy) patch.dmPolicy = input.dmPolicy;
  if (input.notificationPrefs) patch.notificationPrefs = { ...user.notificationPrefs, ...input.notificationPrefs };
  if (input.mutedCommunityIds) patch.mutedCommunityIds = [...new Set(input.mutedCommunityIds)];
  ctx.db.update(users).set(patch).where(eq(users.id, user.id)).run();
  const updated = ctx.db.select().from(users).where(eq(users.id, user.id)).get() as UserRow;
  if (input.presence) ctx.realtime.refreshPresence(user.id);
  ctx.realtime.toUser(user.id, 'user:update', { userId: user.id });
  return updated;
}

export function completeOnboarding(ctx: AppContext, user: UserRow): UserRow {
  const now = Date.now();
  ctx.db
    .update(users)
    .set({ onboardingCompletedAt: user.onboardingCompletedAt ?? now, updatedAt: now })
    .where(eq(users.id, user.id))
    .run();
  return ctx.db.select().from(users).where(eq(users.id, user.id)).get() as UserRow;
}

export function setAvatar(ctx: AppContext, user: UserRow, uploadId: string | null): UserRow {
  ctx.db.transaction((tx) => {
    if (user.avatarId) tx.update(uploads).set({ status: 'deleted' }).where(eq(uploads.id, user.avatarId)).run();
    if (uploadId) tx.update(uploads).set({ status: 'attached' }).where(eq(uploads.id, uploadId)).run();
    tx.update(users).set({ avatarId: uploadId, updatedAt: Date.now() }).where(eq(users.id, user.id)).run();
  });
  ctx.realtime.toUser(user.id, 'user:update', { userId: user.id });
  return ctx.db.select().from(users).where(eq(users.id, user.id)).get() as UserRow;
}

export function setBlocked(ctx: AppContext, user: UserRow, targetId: string, blocked: boolean): void {
  if (targetId === user.id) throw badRequest('You cannot block yourself.');
  const target = ctx.db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).get();
  if (!target) throw notFound('User not found.');
  if (blocked) {
    ctx.db
      .insert(userBlocks)
      .values({ blockerId: user.id, blockedId: targetId, createdAt: Date.now() })
      .onConflictDoNothing()
      .run();
  } else {
    ctx.db
      .delete(userBlocks)
      .where(and(eq(userBlocks.blockerId, user.id), eq(userBlocks.blockedId, targetId)))
      .run();
  }
  // DM permissions (read-only when blocked) changed for both sides.
  ctx.realtime.toUser(user.id, 'user:update', { userId: targetId });
  ctx.realtime.toUser(targetId, 'user:update', { userId: user.id });
}

export function listBlocked(ctx: AppContext, user: UserRow): UserSummary[] {
  return ctx.db
    .select(summaryColumns)
    .from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, user.id))
    .all()
    .map(toUserSummary);
}

export function blockedIdsOf(ctx: AppContext, userId: string): string[] {
  return ctx.db
    .select({ id: userBlocks.blockedId })
    .from(userBlocks)
    .where(eq(userBlocks.blockerId, userId))
    .all()
    .map((r) => r.id);
}

export function searchUsers(ctx: AppContext, viewer: UserRow, q: string, communityId?: string): UserSummary[] {
  const term = q.trim().toLowerCase().replace(/^@/, '');
  if (term.length < 1) return [];
  const escaped = term.replace(/[%_\\]/g, (c) => `\\${c}`);
  const conditions = [
    eq(users.status, 'active'),
    or(like(users.username, `${escaped}%`), sql`lower(${users.displayName}) like ${`%${escaped}%`} escape '\\'`),
  ];
  if (communityId) {
    conditions.push(
      inArray(
        users.id,
        ctx.db
          .select({ id: communityMembers.userId })
          .from(communityMembers)
          .where(eq(communityMembers.communityId, communityId)),
      ),
    );
  }
  return ctx.db
    .select(summaryColumns)
    .from(users)
    .where(and(...conditions))
    .orderBy(asc(sql`length(${users.username})`), asc(users.username))
    .limit(20)
    .all()
    .filter((u) => u.id !== viewer.id || term === viewer.username)
    .map(toUserSummary);
}

/** Everything the client needs right after sign-in, in one request. */
export function bootstrap(ctx: AppContext, auth: AuthState): BootstrapDTO {
  const user = auth.user;
  const perms = computeUserChannelPermissions(ctx.db, user.id);
  const communityDTOs = [...perms.communities.keys()]
    .map((communityId) => {
      const access = getCommunityAccess(ctx.db, communityId, user.id);
      return access ? buildCommunityDTO(ctx.db, access) : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const dms = listDms(ctx, user);
  const dmIds = new Set(dms.map((d) => d.id));
  const unreads = computeUnreads(ctx.db, user.id, [...perms.channels.keys()], dmIds);
  return {
    user: toSelfUser(user),
    config: publicConfig(ctx),
    communities: communityDTOs,
    dms,
    unreads,
    unreadNotifications: unreadNotificationCount(ctx.db, user.id),
  };
}
