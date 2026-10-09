import { and, asc, desc, eq, gt, inArray, isNull, like, lt, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
  CHANNEL_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
  DEFAULT_MODERATOR_PERMISSIONS,
  LIMITS,
  Permission,
  computeChannelPermissions,
  isPrivateChannel,
  type AuditEventDTO,
  type CategoryDTO,
  type ChannelDTO,
  type CommunityDTO,
  type CommunitySummary,
  type CommunityTag,
  type InviteDTO,
  type InvitePreviewDTO,
  type MemberDTO,
  type RoleDTO,
  type channelOverwriteSchema,
  type createChannelSchema,
  type createCommunitySchema,
  type createInviteSchema,
  type createRoleSchema,
  type updateCategorySchema,
  type updateChannelSchema,
  type updateCommunitySchema,
  type updateRoleSchema,
} from '@creator-network/shared';
import { audit } from '../audit';
import type { AppContext } from '../context';
import type { DbOrTx } from '../db/client';
import { newId } from '../db/ids';
import {
  auditEvents,
  channelCategories,
  channelOverwrites,
  channels,
  communities,
  communityBans,
  communityMembers,
  invites,
  memberRoles,
  readStates,
  roles,
  uploads,
  users,
} from '../db/schema';
import { randomCode } from '../lib/crypto';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { verifyPassword } from '../lib/password';
import { notify } from '../notifications/service';
import { fileUrl, summaryColumns, toUserSummary, type UserRow } from '../users/dto';
import {
  type CommunityAccess,
  type CommunityRow,
  type RoleRow,
  getCommunityAccess,
  hasPerm,
  loadOverwrites,
  requireCommunityAccess,
  requireCommunityPermission,
} from './access';
import { COMMUNITY_TEMPLATE_LAYOUTS } from './templates';

const MAX_OWNED_COMMUNITIES = 20;

/* ------------------------------------------------------------------ DTOs */

export function toCommunitySummary(c: CommunityRow): CommunitySummary {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    iconUrl: fileUrl(c.iconId),
    visibility: c.visibility,
    tags: c.tags as CommunityTag[],
    memberCount: c.memberCount,
    isDemo: c.isDemo,
    createdAt: c.createdAt,
  };
}

export function toRoleDTO(r: RoleRow, memberCount?: number): RoleDTO {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    position: r.position,
    permissions: r.permissions,
    isDefault: r.isDefault,
    hoist: r.hoist,
    ...(memberCount !== undefined ? { memberCount } : {}),
  };
}

/** Full community view for one member: only the channels they can see, with their permissions. */
export function buildCommunityDTO(db: DbOrTx, access: CommunityAccess): CommunityDTO {
  const { community, ctx } = access;
  const roleRows = db.select().from(roles).where(eq(roles.communityId, community.id)).orderBy(desc(roles.position)).all();
  const categoryRows = db
    .select()
    .from(channelCategories)
    .where(eq(channelCategories.communityId, community.id))
    .orderBy(asc(channelCategories.position), asc(channelCategories.id))
    .all();
  const channelRows = db
    .select()
    .from(channels)
    .where(eq(channels.communityId, community.id))
    .orderBy(asc(channels.position), asc(channels.id))
    .all();
  const channelIds = channelRows.map((c) => c.id);
  const overwrites = channelIds.length
    ? db.select().from(channelOverwrites).where(inArray(channelOverwrites.channelId, channelIds)).all()
    : [];
  const byChannel = new Map<string, typeof overwrites>();
  for (const o of overwrites) {
    const list = byChannel.get(o.channelId) ?? [];
    list.push(o);
    byChannel.set(o.channelId, list);
  }
  const visible: ChannelDTO[] = [];
  for (const ch of channelRows) {
    const ow = byChannel.get(ch.id) ?? [];
    const perms = computeChannelPermissions(ctx, ow);
    if (!hasPerm(perms, Permission.VIEW_CHANNEL)) continue;
    visible.push({
      id: ch.id,
      kind: 'text',
      communityId: community.id,
      categoryId: ch.categoryId,
      name: ch.name,
      topic: ch.topic,
      position: ch.position,
      isPrivate: isPrivateChannel(ctx.everyoneRole.id, ow),
      lastMessageId: ch.lastMessageId,
      lastMessageAt: ch.lastMessageAt,
      myPermissions: perms,
    });
  }
  const categories: CategoryDTO[] = categoryRows.map((c) => ({ id: c.id, name: c.name, position: c.position }));
  return {
    ...toCommunitySummary(community),
    ownerId: community.ownerId,
    categories,
    channels: visible,
    roles: roleRows.map((r) => toRoleDTO(r)),
    myRoleIds: ctx.memberRoles.map((r) => r.id),
    myPermissions: access.permissions,
    everyoneRoleId: ctx.everyoneRole.id,
  };
}

export function getCommunityForUser(ctx: AppContext, communityId: string, userId: string): CommunityDTO {
  return buildCommunityDTO(ctx.db, requireCommunityAccess(ctx.db, communityId, userId));
}

function assertCanCreateContent(ctx: AppContext, user: UserRow): void {
  const s = ctx.settings.get();
  if (s.requireEmailVerification && ctx.mailer.enabled && user.emailVerifiedAt === null) {
    throw forbidden('Confirm your email address first. Check your inbox for the verification link.', 'email_unverified');
  }
}

/* ------------------------------------------------------------- Lifecycle */

export function createCommunity(
  ctx: AppContext,
  user: UserRow,
  input: z.output<typeof createCommunitySchema>,
  opts: { isDemo?: boolean; bypassChecks?: boolean } = {},
): CommunityDTO {
  if (!opts.bypassChecks) {
    const settings = ctx.settings.get();
    if (settings.communityCreation === 'admins' && user.platformRole !== 'admin') {
      throw forbidden('Only administrators can create communities on this server.', 'community_creation_restricted');
    }
    assertCanCreateContent(ctx, user);
    const owned = ctx.db.select({ id: communities.id }).from(communities).where(eq(communities.ownerId, user.id)).all();
    if (owned.length >= MAX_OWNED_COMMUNITIES) {
      throw conflict(`You can own at most ${MAX_OWNED_COMMUNITIES} communities.`, 'too_many_communities');
    }
  }

  const now = Date.now();
  const communityId = newId(now);
  const everyoneId = newId(now);
  const moderatorId = newId(now);

  ctx.db.transaction((tx) => {
    tx.insert(communities)
      .values({
        id: communityId,
        name: input.name,
        description: input.description,
        visibility: input.visibility,
        tags: input.tags,
        ownerId: user.id,
        memberCount: 1,
        isDemo: opts.isDemo ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.insert(roles)
      .values([
        { id: everyoneId, communityId, name: '@everyone', color: null, position: 0, permissions: DEFAULT_EVERYONE_PERMISSIONS, isDefault: true, hoist: false, createdAt: now },
        { id: moderatorId, communityId, name: 'Moderator', color: '#8fb3d9', position: 1, permissions: DEFAULT_MODERATOR_PERMISSIONS, isDefault: false, hoist: true, createdAt: now },
      ])
      .run();
    tx.insert(communityMembers).values({ communityId, userId: user.id, joinedAt: now }).run();

    const layout = COMMUNITY_TEMPLATE_LAYOUTS[input.template];
    let channelPosition = 0;
    layout.forEach((cat, catIndex) => {
      const categoryId = newId(now);
      tx.insert(channelCategories).values({ id: categoryId, communityId, name: cat.name, position: catIndex, createdAt: now }).run();
      for (const ch of cat.channels) {
        const channelId = newId(now);
        tx.insert(channels)
          .values({ id: channelId, kind: 'text', communityId, categoryId, name: ch.name, topic: ch.topic, position: channelPosition++, createdAt: now, updatedAt: now })
          .run();
        if (ch.announcement) {
          tx.insert(channelOverwrites)
            .values([
              { channelId, targetType: 'role', targetId: everyoneId, allow: 0, deny: Permission.SEND_MESSAGES },
              { channelId, targetType: 'role', targetId: moderatorId, allow: Permission.SEND_MESSAGES, deny: 0 },
            ])
            .run();
        }
      }
    });
    audit(tx, { scope: 'community', communityId, actorId: user.id, action: 'community.created', targetType: 'community', targetId: communityId, targetLabel: input.name, metadata: { template: input.template } });
  });

  ctx.realtime.syncUserRooms(user.id);
  return getCommunityForUser(ctx, communityId, user.id);
}

export function updateCommunity(ctx: AppContext, user: UserRow, communityId: string, input: z.output<typeof updateCommunitySchema>): CommunityDTO {
  requireCommunityPermission(ctx.db, communityId, user.id, Permission.MANAGE_COMMUNITY);
  const patch: Partial<CommunityRow> = { updatedAt: Date.now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.tags !== undefined) patch.tags = input.tags;
  ctx.db.update(communities).set(patch).where(eq(communities.id, communityId)).run();
  audit(ctx.db, { scope: 'community', communityId, actorId: user.id, action: 'community.updated', targetType: 'community', targetId: communityId, metadata: { fields: Object.keys(input) } });
  ctx.realtime.toCommunity(communityId, 'community:update', { communityId });
  return getCommunityForUser(ctx, communityId, user.id);
}

export function setCommunityIcon(ctx: AppContext, user: UserRow, communityId: string, uploadId: string | null): CommunityDTO {
  requireCommunityPermission(ctx.db, communityId, user.id, Permission.MANAGE_COMMUNITY);
  const community = ctx.db.select().from(communities).where(eq(communities.id, communityId)).get();
  if (!community) throw notFound();
  ctx.db.transaction((tx) => {
    if (community.iconId) tx.update(uploads).set({ status: 'deleted' }).where(eq(uploads.id, community.iconId)).run();
    if (uploadId) tx.update(uploads).set({ status: 'attached' }).where(eq(uploads.id, uploadId)).run();
    tx.update(communities).set({ iconId: uploadId, updatedAt: Date.now() }).where(eq(communities.id, communityId)).run();
  });
  ctx.realtime.toCommunity(communityId, 'community:update', { communityId });
  return getCommunityForUser(ctx, communityId, user.id);
}

export async function deleteCommunity(ctx: AppContext, user: UserRow, communityId: string, password: string, confirmName: string): Promise<void> {
  const access = requireCommunityAccess(ctx.db, communityId, user.id);
  if (!access.isOwner) throw forbidden('Only the owner can delete a community.');
  if (confirmName.trim() !== access.community.name) throw badRequest('Type the community name exactly to confirm.', undefined, 'confirmation_mismatch');
  if (!(await verifyPassword(user.passwordHash, password))) throw new AppError(400, 'invalid_password', 'Your password is incorrect.');
  removeCommunity(ctx, communityId, user.id, 'community.deleted', 'platform');
}

/** Deletes a community and everything in it (also used by platform admins). */
export function removeCommunity(ctx: AppContext, communityId: string, actorId: string | null, action: string, scope: 'platform' | 'community', reason?: string): void {
  const community = ctx.db.select().from(communities).where(eq(communities.id, communityId)).get();
  if (!community) throw notFound();
  const memberIds = ctx.db.select({ userId: communityMembers.userId }).from(communityMembers).where(eq(communityMembers.communityId, communityId)).all().map((m) => m.userId);
  const channelIds = ctx.db.select({ id: channels.id }).from(channels).where(eq(channels.communityId, communityId)).all().map((c) => c.id);
  ctx.realtime.toCommunity(communityId, 'community:remove', { communityId, reason: 'deleted' });
  ctx.db.transaction((tx) => {
    if (channelIds.length) tx.update(uploads).set({ status: 'deleted' }).where(inArray(uploads.channelId, channelIds)).run();
    if (community.iconId) tx.update(uploads).set({ status: 'deleted' }).where(eq(uploads.id, community.iconId)).run();
    tx.delete(communities).where(eq(communities.id, communityId)).run();
    // Platform-scope record survives the cascade.
    audit(tx, { scope: 'platform', actorId, action, targetType: 'community', targetId: communityId, targetLabel: community.name, reason: reason ?? null, metadata: { members: memberIds.length, scope } });
  });
  for (const id of memberIds) ctx.realtime.syncUserRooms(id);
}

/* ------------------------------------------------------------ Membership */

function addMember(ctx: AppContext, tx: DbOrTx, communityId: string, userId: string, now: number): void {
  tx.insert(communityMembers).values({ communityId, userId, joinedAt: now }).run();
  tx.update(communities).set({ memberCount: sql`${communities.memberCount} + 1` }).where(eq(communities.id, communityId)).run();
  // Start new members at the latest message so joining does not flood them with unread badges.
  const chans = tx.select({ id: channels.id, last: channels.lastMessageId }).from(channels).where(eq(channels.communityId, communityId)).all();
  for (const c of chans) {
    if (!c.last) continue;
    tx.insert(readStates)
      .values({ userId, channelId: c.id, lastReadId: c.last, updatedAt: now })
      .onConflictDoUpdate({ target: [readStates.userId, readStates.channelId], set: { lastReadId: c.last, updatedAt: now } })
      .run();
  }
}

/** Adds a member without an invite (demo seeding and administrative tooling only). */
export function addMemberDirect(ctx: AppContext, communityId: string, userId: string): void {
  if (isMember(ctx.db, communityId, userId)) return;
  ctx.db.transaction((tx) => addMember(ctx, tx, communityId, userId, Date.now()));
  ctx.realtime.syncUserRooms(userId);
}

function isBanned(db: DbOrTx, communityId: string, userId: string): boolean {
  return !!db.select({ u: communityBans.userId }).from(communityBans).where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, userId))).get();
}

function isMember(db: DbOrTx, communityId: string, userId: string): boolean {
  return !!db.select({ u: communityMembers.userId }).from(communityMembers).where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId))).get();
}

function afterJoin(ctx: AppContext, communityId: string, user: UserRow): void {
  ctx.realtime.syncUserRooms(user.id);
  ctx.realtime.toCommunity(communityId, 'community:update', { communityId });
  const community = ctx.db.select({ ownerId: communities.ownerId, name: communities.name }).from(communities).where(eq(communities.id, communityId)).get();
  if (community && community.ownerId !== user.id) {
    notify(ctx, { userId: community.ownerId, type: 'community', actorId: user.id, communityId, data: { event: 'member_joined' } });
  }
}

export function joinPublicCommunity(ctx: AppContext, user: UserRow, communityId: string): CommunityDTO {
  const community = ctx.db.select().from(communities).where(eq(communities.id, communityId)).get();
  if (!community || community.visibility !== 'public') throw notFound('Community not found.');
  if (isMember(ctx.db, communityId, user.id)) return getCommunityForUser(ctx, communityId, user.id);
  if (isBanned(ctx.db, communityId, user.id)) throw forbidden('You are banned from this community.', 'banned');
  ctx.db.transaction((tx) => addMember(ctx, tx, communityId, user.id, Date.now()));
  afterJoin(ctx, communityId, user);
  return getCommunityForUser(ctx, communityId, user.id);
}

export function leaveCommunity(ctx: AppContext, user: UserRow, communityId: string): void {
  const access = requireCommunityAccess(ctx.db, communityId, user.id);
  if (access.isOwner) throw badRequest('Transfer ownership before leaving your own community.', undefined, 'owner_cannot_leave');
  removeMember(ctx, communityId, user.id);
  ctx.realtime.toUser(user.id, 'community:remove', { communityId, reason: 'left' });
}

function removeMember(ctx: AppContext, communityId: string, userId: string): void {
  ctx.db.transaction((tx) => {
    const res = tx.delete(communityMembers).where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId))).run();
    if (res.changes > 0) {
      tx.update(communities).set({ memberCount: sql`max(${communities.memberCount} - 1, 0)` }).where(eq(communities.id, communityId)).run();
    }
    // Remove member-specific overwrites in this community's channels.
    const chanIds = tx.select({ id: channels.id }).from(channels).where(eq(channels.communityId, communityId)).all().map((c) => c.id);
    if (chanIds.length) {
      tx.delete(channelOverwrites)
        .where(and(inArray(channelOverwrites.channelId, chanIds), eq(channelOverwrites.targetType, 'member'), eq(channelOverwrites.targetId, userId)))
        .run();
      tx.delete(readStates).where(and(eq(readStates.userId, userId), inArray(readStates.channelId, chanIds))).run();
    }
  });
  ctx.realtime.syncUserRooms(userId);
  ctx.realtime.toCommunity(communityId, 'community:update', { communityId });
}

/** Moderation hierarchy: the actor must outrank the target (owner outranks everyone). */
function assertOutranks(ctx: AppContext, actor: CommunityAccess, targetUserId: string): CommunityAccess {
  if (targetUserId === actor.community.ownerId) throw forbidden('The owner cannot be moderated.');
  const target = getCommunityAccess(ctx.db, actor.community.id, targetUserId);
  if (!target) throw notFound('Member not found.');
  if (!actor.isOwner && target.highest >= actor.highest) {
    throw forbidden('You can only moderate members whose highest role is below yours.', 'hierarchy');
  }
  return target;
}

export function kickMember(ctx: AppContext, user: UserRow, communityId: string, targetUserId: string, reason: string): void {
  const actor = requireCommunityPermission(ctx.db, communityId, user.id, Permission.KICK_MEMBERS);
  if (targetUserId === user.id) throw badRequest('Use "Leave community" to remove yourself.');
  assertOutranks(ctx, actor, targetUserId);
  const target = ctx.db.select(summaryColumns).from(users).where(eq(users.id, targetUserId)).get();
  removeMember(ctx, communityId, targetUserId);
  audit(ctx.db, { scope: 'community', communityId, actorId: user.id, action: 'member.kicked', targetType: 'user', targetId: targetUserId, targetLabel: target?.username ?? null, reason });
  ctx.realtime.toUser(targetUserId, 'community:remove', { communityId, reason: 'kicked' });
  notify(ctx, { userId: targetUserId, type: 'moderation', communityId, data: { event: 'kicked', communityName: actor.community.name, reason } });
}

export function banMember(ctx: AppContext, user: UserRow, communityId: string, targetUserId: string, reason: string): void {
  const actor = requireCommunityPermission(ctx.db, communityId, user.id, Permission.BAN_MEMBERS);
  if (targetUserId === user.id) throw badRequest('You cannot ban yourself.');
  if (targetUserId === actor.community.ownerId) throw forbidden('The owner cannot be banned.');
  const targetUser = ctx.db.select(summaryColumns).from(users).where(eq(users.id, targetUserId)).get();
  if (!targetUser) throw notFound('User not found.');
  const member = isMember(ctx.db, communityId, targetUserId);
  if (member) assertOutranks(ctx, actor, targetUserId);
  ctx.db
    .insert(communityBans)
    .values({ communityId, userId: targetUserId, reason, bannedBy: user.id, createdAt: Date.now() })
    .onConflictDoUpdate({ target: [communityBans.communityId, communityBans.userId], set: { reason, bannedBy: user.id } })
    .run();
  // Revoke direct invitations for the banned user.
  ctx.db.update(invites).set({ revokedAt: Date.now() }).where(and(eq(invites.communityId, communityId), eq(invites.targetUserId, targetUserId))).run();
  if (member) removeMember(ctx, communityId, targetUserId);
  audit(ctx.db, { scope: 'community', communityId, actorId: user.id, action: 'member.banned', targetType: 'user', targetId: targetUserId, targetLabel: targetUser.username, reason });
  if (member) {
    ctx.realtime.toUser(targetUserId, 'community:remove', { communityId, reason: 'banned' });
    notify(ctx, { userId: targetUserId, type: 'moderation', communityId: null, data: { event: 'banned', communityName: actor.community.name, reason } });
  }
}

export function unbanMember(ctx: AppContext, user: UserRow, communityId: string, targetUserId: string): void {
  requireCommunityPermission(ctx.db, communityId, user.id, Permission.BAN_MEMBERS);
  const res = ctx.db.delete(communityBans).where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, targetUserId))).run();
  if (res.changes === 0) throw notFound('Ban not found.');
  const target = ctx.db.select({ username: users.username }).from(users).where(eq(users.id, targetUserId)).get();
  audit(ctx.db, { scope: 'community', communityId, actorId: user.id, action: 'member.unbanned', targetType: 'user', targetId: targetUserId, targetLabel: target?.username ?? null });
}

export function listBans(ctx: AppContext, user: UserRow, communityId: string) {
  requireCommunityPermission(ctx.db, communityId, user.id, Permission.BAN_MEMBERS);
  return ctx.db
    .select({ ban: communityBans, user: summaryColumns })
    .from(communityBans)
    .innerJoin(users, eq(users.id, communityBans.userId))
    .where(eq(communityBans.communityId, communityId))
    .orderBy(desc(communityBans.createdAt))
    .all()
    .map((r) => ({ user: toUserSummary(r.user), reason: r.ban.reason, createdAt: r.ban.createdAt }));
}

export async function transferOwnership(ctx: AppContext, user: UserRow, communityId: string, newOwnerId: string, password: string): Promise<CommunityDTO> {
  const access = requireCommunityAccess(ctx.db, communityId, user.id);
  if (!access.isOwner) throw forbidden('Only the owner can transfer ownership.');
  if (newOwnerId === user.id) throw badRequest('You already own this community.');
  if (!(await verifyPassword(user.passwordHash, password))) throw new AppError(400, 'invalid_password', 'Your password is incorrect.');
  const target = ctx.db.select().from(users).where(eq(users.id, newOwnerId)).get();
  if (!target || target.status !== 'active' || !isMember(ctx.db, communityId, newOwnerId)) {
    throw badRequest('The new owner must be an active member of the community.');
  }
  ctx.db.update(communities).set({ ownerId: newOwnerId, updatedAt: Date.now() }).where(eq(communities.id, communityId)).run();
  audit(ctx.db, { scope: 'community', communityId, actorId: user.id, action: 'community.ownership_transferred', targetType: 'user', targetId: newOwnerId, targetLabel: target.username });
  ctx.realtime.syncCommunity(communityId);
  ctx.realtime.toCommunity(communityId, 'community:update', { communityId });
  notify(ctx, { userId: newOwnerId, type: 'community', actorId: user.id, communityId, data: { event: 'ownership_transferred' } });
  return getCommunityForUser(ctx, communityId, user.id);
}

export function listMembers(ctx: AppContext, user: UserRow, communityId: string): MemberDTO[] {
  requireCommunityAccess(ctx.db, communityId, user.id);
  const rows = ctx.db
    .select({ member: communityMembers, user: summaryColumns })
    .from(communityMembers)
    .innerJoin(users, eq(users.id, communityMembers.userId))
    .where(eq(communityMembers.communityId, communityId))
    .orderBy(asc(users.displayName))
    .limit(2000)
    .all();
  const assignments = ctx.db.select().from(memberRoles).where(eq(memberRoles.communityId, communityId)).all();
  const rolesByUser = new Map<string, string[]>();
  for (const a of assignments) {
    const list = rolesByUser.get(a.userId) ?? [];
    list.push(a.roleId);
    rolesByUser.set(a.userId, list);
  }
  return rows.map((r) => ({
    user: toUserSummary(r.user),
    roleIds: rolesByUser.get(r.user.id) ?? [],
    joinedAt: r.member.joinedAt,
    presence: ctx.realtime.presenceOf(r.user.id),
  }));
}

/* ------------------------------------------------------------- Categories */

export function createCategory(ctx: AppContext, user: UserRow, communityId: string, name: string): CategoryDTO {
  requireCommunityPermission(ctx.db, communityId, user.id, Permission.MANAGE_CHANNELS);
  const max = ctx.db.select({ p: sql<number>`coalesce(max(${channelCategories.position}), -1)` }).from(channelCategories).where(eq(channelCategories.communityId, communityId)).get();
  const row = { id: newId(), communityId, name, position: (max?.p ?? -1) + 1, createdAt: Date.now() };
  ctx.db.insert(channelCategories).values(row).run();
  audit(ctx.db, { scope: 'community', communityId, actorId: user.id, action: 'category.created', targetType: 'category', targetId: row.id, targetLabel: name });
  ctx.realtime.toCommunity(communityId, 'community:update', { communityId });
  return { id: row.id, name: row.name, position: row.position };
}

function requireCategory(ctx: AppContext, categoryId: string) {
  const cat = ctx.db.select().from(channelCategories).where(eq(channelCategories.id, categoryId)).get();
  if (!cat) throw notFound('Category not found.');
  return cat;
}

export function updateCategory(ctx: AppContext, user: UserRow, categoryId: string, input: z.output<typeof updateCategorySchema>): void {
  const cat = requireCategory(ctx, categoryId);
  requireCommunityPermission(ctx.db, cat.communityId, user.id, Permission.MANAGE_CHANNELS);
  ctx.db.update(channelCategories).set(input).where(eq(channelCategories.id, categoryId)).run();
  audit(ctx.db, { scope: 'community', communityId: cat.communityId, actorId: user.id, action: 'category.updated', targetType: 'category', targetId: categoryId, targetLabel: input.name ?? cat.name });
  ctx.realtime.toCommunity(cat.communityId, 'community:update', { communityId: cat.communityId });
}

export function deleteCategory(ctx: AppContext, user: UserRow, categoryId: string): void {
  const cat = requireCategory(ctx, categoryId);
  requireCommunityPermission(ctx.db, cat.communityId, user.id, Permission.MANAGE_CHANNELS);
  ctx.db.delete(channelCategories).where(eq(channelCategories.id, categoryId)).run();
  audit(ctx.db, { scope: 'community', communityId: cat.communityId, actorId: user.id, action: 'category.deleted', targetType: 'category', targetId: categoryId, targetLabel: cat.name });
  ctx.realtime.toCommunity(cat.communityId, 'community:update', { communityId: cat.communityId });
}

/* --------------------------------------------------------------- Channels */

function assertCategoryInCommunity(ctx: AppContext, categoryId: string | null | undefined, communityId: string): void {
  if (!categoryId) return;
  const cat = ctx.db.select({ c: channelCategories.communityId }).from(channelCategories).where(eq(channelCategories.id, categoryId)).get();
  if (!cat || cat.c !== communityId) throw badRequest('That category does not belong to this community.');
}

export function createChannel(ctx: AppContext, user: UserRow, communityId: string, input: z.output<typeof createChannelSchema>): ChannelDTO {
  const access = requireCommunityPermission(ctx.db, communityId, user.id, Permission.MANAGE_CHANNELS);
  assertCategoryInCommunity(ctx, input.categoryId, communityId);
  const existing = ctx.db.select({ id: channels.id }).from(channels).where(eq(channels.communityId, communityId)).all();
  if (existing.length >= LIMITS.channelsPerCommunity) throw conflict('This community has reached the channel limit.');
  const allowedRoles = input.allowedRoleIds.length
    ? ctx.db.select({ id: roles.id }).from(roles).where(and(eq(roles.communityId, communityId), inArray(roles.id, input.allowedRoleIds))).all()
    : [];
  if (allowedRoles.length !== input.allowedRoleIds.length) throw badRequest('Unknown role.');
  const now = Date.now();
  const id = newId(now);
  const max = ctx.db.select({ p: sql<number>`coalesce(max(${channels.position}), -1)` }).from(channels).where(eq(channels.communityId, communityId)).get();
  ctx.db.transaction((tx) => {
    tx.insert(channels)
      .values({ id, kind: 'text', communityId, categoryId: input.categoryId, name: input.name, topic: input.topic, position: (max?.p ?? -1) + 1, createdAt: now, updatedAt: now })
      .run();
    if (input.isPrivate) {
      tx.insert(channelOverwrites).values({ channelId: id, targetType: 'role', targetId: access.ctx.everyoneRole.id, allow: 0, deny: Permission.VIEW_CHANNEL }).run();
      for (const r of allowedRoles) {
        tx.insert(channelOverwrites).values({ channelId: id, targetType: 'role', targetId: r.id, allow: Permission.VIEW_CHANNEL, deny: 0 }).run();
      }
      // The creator always keeps access to a private channel they create.
      if (!access.isOwner && !hasPerm(access.permissions, Permission.ADMINISTRATOR)) {
        tx.insert(channelOverwrites).values({ channelId: id, targetType: 'member', targetId: user.id, allow: Permission.VIEW_CHANNEL, deny: 0 }).run();
      }
    }
    audit(tx, { scope: 'community', communityId, actorId: user.id, action: 'channel.created', targetType: 'channel', targetId: id, targetLabel: input.name, metadata: { private: input.isPrivate } });
  });
  ctx.realtime.syncCommunity(communityId);
  ctx.realtime.toCommunity(communityId, 'community:update', { communityId });
  const dto = buildCommunityDTO(ctx.db, requireCommunityAccess(ctx.db, communityId, user.id)).channels.find((c) => c.id === id);
  if (!dto) throw new Error('created channel not visible to creator');
  return dto;
}

function requireTextChannel(ctx: AppContext, channelId: string) {
  const ch = ctx.db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!ch || ch.kind !== 'text' || !ch.communityId) throw notFound('Channel not found.');
  return ch as typeof ch & { communityId: string };
}

export function updateChannel(ctx: AppContext, user: UserRow, channelId: string, input: z.output<typeof updateChannelSchema>): void {
  const ch = requireTextChannel(ctx, channelId);
  const access = requireCommunityPermission(ctx.db, ch.communityId, user.id, Permission.MANAGE_CHANNELS);
  if (!hasPerm(computeChannelPermissions(access.ctx, loadOverwrites(ctx.db, channelId)), Permission.VIEW_CHANNEL)) throw notFound('Channel not found.');
  assertCategoryInCommunity(ctx, input.categoryId, ch.communityId);
  ctx.db.update(channels).set({ ...input, updatedAt: Date.now() }).where(eq(channels.id, channelId)).run();
  audit(ctx.db, { scope: 'community', communityId: ch.communityId, actorId: user.id, action: 'channel.updated', targetType: 'channel', targetId: channelId, targetLabel: input.name ?? ch.name, metadata: { fields: Object.keys(input) } });
  ctx.realtime.toCommunity(ch.communityId, 'community:update', { communityId: ch.communityId });
}

export function deleteChannel(ctx: AppContext, user: UserRow, channelId: string): void {
  const ch = requireTextChannel(ctx, channelId);
  const access = requireCommunityPermission(ctx.db, ch.communityId, user.id, Permission.MANAGE_CHANNELS);
  if (!hasPerm(computeChannelPermissions(access.ctx, loadOverwrites(ctx.db, channelId)), Permission.VIEW_CHANNEL)) throw notFound('Channel not found.');
  ctx.db.transaction((tx) => {
    tx.update(uploads).set({ status: 'deleted' }).where(eq(uploads.channelId, channelId)).run();
    tx.delete(channels).where(eq(channels.id, channelId)).run();
    audit(tx, { scope: 'community', communityId: ch.communityId, actorId: user.id, action: 'channel.deleted', targetType: 'channel', targetId: channelId, targetLabel: ch.name });
  });
  ctx.realtime.syncCommunity(ch.communityId);
  ctx.realtime.toCommunity(ch.communityId, 'community:update', { communityId: ch.communityId });
}

export function listChannelOverwrites(ctx: AppContext, user: UserRow, channelId: string) {
  const ch = requireTextChannel(ctx, channelId);
  requireCommunityPermission(ctx.db, ch.communityId, user.id, Permission.MANAGE_CHANNELS);
  return loadOverwrites(ctx.db, channelId);
}

/**
 * Sets (or clears, when allow = deny = 0) one permission overwrite.
 * Non-owners can only allow/deny permissions they hold themselves, and cannot
 * lock themselves out of the channel they are editing.
 */
export function setChannelOverwrite(ctx: AppContext, user: UserRow, channelId: string, input: z.output<typeof channelOverwriteSchema>): void {
  const ch = requireTextChannel(ctx, channelId);
  const access = requireCommunityPermission(ctx.db, ch.communityId, user.id, Permission.MANAGE_CHANNELS);
  const current = loadOverwrites(ctx.db, channelId);
  const actorChannelPerms = computeChannelPermissions(access.ctx, current);
  if (!hasPerm(actorChannelPerms, Permission.VIEW_CHANNEL)) throw notFound('Channel not found.');
  const privileged = access.isOwner || hasPerm(access.permissions, Permission.ADMINISTRATOR);
  if (!privileged && ((input.allow | input.deny) & ~actorChannelPerms & CHANNEL_PERMISSIONS) !== 0) {
    throw forbidden('You can only change permissions you have yourself.', 'hierarchy');
  }
  if (input.allow & input.deny) throw badRequest('A permission cannot be both allowed and denied.');
  if (input.targetType === 'role') {
    const role = ctx.db.select().from(roles).where(eq(roles.id, input.targetId)).get();
    if (!role || role.communityId !== ch.communityId) throw badRequest('Unknown role.');
    if (!privileged && !role.isDefault && role.position >= access.highest) throw forbidden('You can only edit overwrites for roles below yours.', 'hierarchy');
  } else if (!isMember(ctx.db, ch.communityId, input.targetId)) {
    throw badRequest('That user is not a member of this community.');
  }

  const next = current.filter((o) => !(o.targetType === input.targetType && o.targetId === input.targetId));
  if (input.allow !== 0 || input.deny !== 0) next.push({ ...input });
  if (!privileged && !hasPerm(computeChannelPermissions(access.ctx, next), Permission.VIEW_CHANNEL)) {
    throw badRequest('That change would remove your own access to this channel.', undefined, 'self_lockout');
  }

  ctx.db.transaction((tx) => {
    tx.delete(channelOverwrites)
      .where(and(eq(channelOverwrites.channelId, channelId), eq(channelOverwrites.targetType, input.targetType), eq(channelOverwrites.targetId, input.targetId)))
      .run();
    if (input.allow !== 0 || input.deny !== 0) {
      tx.insert(channelOverwrites).values({ channelId, ...input }).run();
    }
    audit(tx, { scope: 'community', communityId: ch.communityId, actorId: user.id, action: 'channel.permissions_updated', targetType: 'channel', targetId: channelId, targetLabel: ch.name, metadata: { ...input } });
  });
  ctx.realtime.syncCommunity(ch.communityId);
  ctx.realtime.toCommunity(ch.communityId, 'community:update', { communityId: ch.communityId });
}

/** Convenience: make a channel private (only listed roles + managers) or public again. */
export function setChannelPrivacy(ctx: AppContext, user: UserRow, channelId: string, isPrivate: boolean, allowedRoleIds: string[]): void {
  const ch = requireTextChannel(ctx, channelId);
  const access = requireCommunityPermission(ctx.db, ch.communityId, user.id, Permission.MANAGE_CHANNELS);
  const everyoneId = access.ctx.everyoneRole.id;
  const current = loadOverwrites(ctx.db, channelId);
  const everyone = current.find((o) => o.targetType === 'role' && o.targetId === everyoneId) ?? { targetType: 'role' as const, targetId: everyoneId, allow: 0, deny: 0 };
  const deny = isPrivate ? everyone.deny | Permission.VIEW_CHANNEL : everyone.deny & ~Permission.VIEW_CHANNEL;
  setChannelOverwrite(ctx, user, channelId, { targetType: 'role', targetId: everyoneId, allow: everyone.allow & ~Permission.VIEW_CHANNEL, deny });
  if (isPrivate) {
    for (const roleId of allowedRoleIds) {
      if (roleId === everyoneId) continue;
      const existing = loadOverwrites(ctx.db, channelId).find((o) => o.targetType === 'role' && o.targetId === roleId);
      setChannelOverwrite(ctx, user, channelId, {
        targetType: 'role',
        targetId: roleId,
        allow: (existing?.allow ?? 0) | Permission.VIEW_CHANNEL,
        deny: (existing?.deny ?? 0) & ~Permission.VIEW_CHANNEL,
      });
    }
  }
}

/* ------------------------------------------------------------------ Roles */

export function listRoles(ctx: AppContext, user: UserRow, communityId: string): RoleDTO[] {
  requireCommunityAccess(ctx.db, communityId, user.id);
  const counts = new Map(
    ctx.db
      .select({ roleId: memberRoles.roleId, n: sql<number>`count(*)` })
      .from(memberRoles)
      .where(eq(memberRoles.communityId, communityId))
      .groupBy(memberRoles.roleId)
      .all()
      .map((r) => [r.roleId, r.n]),
  );
  return ctx.db
    .select()
    .from(roles)
    .where(eq(roles.communityId, communityId))
    .orderBy(desc(roles.position))
    .all()
    .map((r) => toRoleDTO(r, r.isDefault ? undefined : (counts.get(r.id) ?? 0)));
}

function assertCanGrant(access: CommunityAccess, permissions: number): void {
  if (access.isOwner || hasPerm(access.permissions, Permission.ADMINISTRATOR)) return;
  if ((permissions & ~access.permissions) !== 0) {
    throw forbidden('You can only grant permissions you have yourself.', 'hierarchy');
  }
}

export function createRole(ctx: AppContext, user: UserRow, communityId: string, input: z.output<typeof createRoleSchema>): RoleDTO {
  const access = requireCommunityPermission(ctx.db, communityId, user.id, Permission.MANAGE_ROLES);
  assertCanGrant(access, input.permissions);
  const count = ctx.db.select({ id: roles.id }).from(roles).where(eq(roles.communityId, communityId)).all().length;
  if (count >= LIMITS.rolesPerCommunity) throw conflict('This community has reached the role limit.');
  const row: RoleRow = { id: newId(), communityId, name: input.name, color: input.color, position: 1, permissions: input.permissions, isDefault: false, hoist: input.hoist, createdAt: Date.now() };
  ctx.db.transaction((tx) => {
    // New roles start at the bottom of the hierarchy (just above @everyone).
    tx.update(roles).set({ position: sql`${roles.position} + 1` }).where(and(eq(roles.communityId, communityId), eq(roles.isDefault, false))).run();
    tx.insert(roles).values(row).run();
    audit(tx, { scope: 'community', communityId, actorId: user.id, action: 'role.created', targetType: 'role', targetId: row.id, targetLabel: row.name, metadata: { permissions: row.permissions } });
  });
  ctx.realtime.toCommunity(communityId, 'community:update', { communityId });
  return toRoleDTO(row, 0);
}

function requireRole(ctx: AppContext, roleId: string): RoleRow {
  const role = ctx.db.select().from(roles).where(eq(roles.id, roleId)).get();
  if (!role) throw notFound('Role not found.');
  return role;
}

function assertRoleBelow(access: CommunityAccess, role: RoleRow): void {
  if (access.isOwner || role.isDefault) return;
  if (role.position >= access.highest) throw forbidden('You can only manage roles below your highest role.', 'hierarchy');
}

export function updateRole(ctx: AppContext, user: UserRow, roleId: string, input: z.output<typeof updateRoleSchema>): RoleDTO {
  const role = requireRole(ctx, roleId);
  const access = requireCommunityPermission(ctx.db, role.communityId, user.id, Permission.MANAGE_ROLES);
  assertRoleBelow(access, role);
  if (role.isDefault && (input.name !== undefined || input.hoist !== undefined)) {
    throw badRequest('The @everyone role can only have its permissions changed.');
  }
  if (input.permissions !== undefined) {
    // Only check the bits that change: keeping existing permissions you lack is fine.
    assertCanGrant(access, (input.permissions ^ role.permissions) & input.permissions);
    if (!access.isOwner && !hasPerm(access.permissions, Permission.ADMINISTRATOR) && ((role.permissions & ~input.permissions) & ~access.permissions) !== 0) {
      throw forbidden('You can only remove permissions you have yourself.', 'hierarchy');
    }
  }
  ctx.db.update(roles).set(input).where(eq(roles.id, roleId)).run();
  audit(ctx.db, { scope: 'community', communityId: role.communityId, actorId: user.id, action: 'role.updated', targetType: 'role', targetId: roleId, targetLabel: input.name ?? role.name, metadata: { ...input } });
  ctx.realtime.syncCommunity(role.communityId);
  ctx.realtime.toCommunity(role.communityId, 'community:update', { communityId: role.communityId });
  return toRoleDTO({ ...role, ...input });
}

export function moveRole(ctx: AppContext, user: UserRow, roleId: string, direction: 'up' | 'down'): void {
  const role = requireRole(ctx, roleId);
  if (role.isDefault) throw badRequest('@everyone is always at the bottom.');
  const access = requireCommunityPermission(ctx.db, role.communityId, user.id, Permission.MANAGE_ROLES);
  assertRoleBelow(access, role);
  const neighbour = ctx.db
    .select()
    .from(roles)
    .where(and(eq(roles.communityId, role.communityId), eq(roles.isDefault, false), direction === 'up' ? gt(roles.position, role.position) : lt(roles.position, role.position)))
    .orderBy(direction === 'up' ? asc(roles.position) : desc(roles.position))
    .get();
  if (!neighbour) return;
  if (direction === 'up') assertRoleBelow(access, neighbour);
  ctx.db.transaction((tx) => {
    tx.update(roles).set({ position: neighbour.position }).where(eq(roles.id, role.id)).run();
    tx.update(roles).set({ position: role.position }).where(eq(roles.id, neighbour.id)).run();
  });
  audit(ctx.db, { scope: 'community', communityId: role.communityId, actorId: user.id, action: 'role.moved', targetType: 'role', targetId: roleId, targetLabel: role.name, metadata: { direction } });
  ctx.realtime.toCommunity(role.communityId, 'community:update', { communityId: role.communityId });
}

export function deleteRole(ctx: AppContext, user: UserRow, roleId: string): void {
  const role = requireRole(ctx, roleId);
  if (role.isDefault) throw badRequest('The @everyone role cannot be deleted.');
  const access = requireCommunityPermission(ctx.db, role.communityId, user.id, Permission.MANAGE_ROLES);
  assertRoleBelow(access, role);
  ctx.db.transaction((tx) => {
    tx.delete(channelOverwrites).where(and(eq(channelOverwrites.targetType, 'role'), eq(channelOverwrites.targetId, roleId))).run();
    tx.delete(roles).where(eq(roles.id, roleId)).run();
    tx.update(roles).set({ position: sql`${roles.position} - 1` }).where(and(eq(roles.communityId, role.communityId), gt(roles.position, role.position))).run();
    audit(tx, { scope: 'community', communityId: role.communityId, actorId: user.id, action: 'role.deleted', targetType: 'role', targetId: roleId, targetLabel: role.name });
  });
  ctx.realtime.syncCommunity(role.communityId);
  ctx.realtime.toCommunity(role.communityId, 'community:update', { communityId: role.communityId });
}

export function setMemberRoles(ctx: AppContext, user: UserRow, communityId: string, targetUserId: string, roleIds: string[]): string[] {
  const actor = requireCommunityPermission(ctx.db, communityId, user.id, Permission.MANAGE_ROLES);
  const target = getCommunityAccess(ctx.db, communityId, targetUserId);
  if (!target) throw notFound('Member not found.');
  if (!actor.isOwner) {
    if (targetUserId === user.id) throw forbidden('You cannot change your own roles.', 'hierarchy');
    if (target.highest >= actor.highest) throw forbidden('You can only change roles of members below you.', 'hierarchy');
  }
  const requested = new Set(roleIds);
  const communityRoles = ctx.db.select().from(roles).where(eq(roles.communityId, communityId)).all();
  const byId = new Map(communityRoles.map((r) => [r.id, r]));
  for (const id of requested) {
    const r = byId.get(id);
    if (!r || r.isDefault) throw badRequest('Unknown role.');
  }
  const current = new Set(target.ctx.memberRoles.map((r) => r.id));
  const changed = [...requested].filter((id) => !current.has(id)).concat([...current].filter((id) => !requested.has(id)));
  for (const id of changed) {
    const r = byId.get(id);
    if (r) assertRoleBelow(actor, r);
  }
  ctx.db.transaction((tx) => {
    tx.delete(memberRoles).where(and(eq(memberRoles.communityId, communityId), eq(memberRoles.userId, targetUserId))).run();
    if (requested.size) {
      tx.insert(memberRoles).values([...requested].map((roleId) => ({ communityId, userId: targetUserId, roleId }))).run();
    }
    const targetUser = tx.select({ username: users.username }).from(users).where(eq(users.id, targetUserId)).get();
    audit(tx, { scope: 'community', communityId, actorId: user.id, action: 'member.roles_updated', targetType: 'user', targetId: targetUserId, targetLabel: targetUser?.username ?? null, metadata: { roleIds: [...requested] } });
  });
  ctx.realtime.syncUserRooms(targetUserId);
  ctx.realtime.toCommunity(communityId, 'community:update', { communityId });
  return [...requested];
}

/* ---------------------------------------------------------------- Invites */

type InviteRow = typeof invites.$inferSelect;

function toInviteDTOs(db: DbOrTx, rows: InviteRow[]): InviteDTO[] {
  const ids = [...new Set(rows.flatMap((r) => [r.inviterId, r.targetUserId]).filter((x): x is string => !!x))];
  const people = new Map(ids.length ? db.select(summaryColumns).from(users).where(inArray(users.id, ids)).all().map((u) => [u.id, toUserSummary(u)]) : []);
  return rows.map((r) => ({
    code: r.code,
    communityId: r.communityId,
    inviter: r.inviterId ? (people.get(r.inviterId) ?? null) : null,
    maxUses: r.maxUses,
    uses: r.uses,
    expiresAt: r.expiresAt,
    revokedAt: r.revokedAt,
    createdAt: r.createdAt,
    targetUser: r.targetUserId ? (people.get(r.targetUserId) ?? null) : null,
  }));
}

export function createInvite(ctx: AppContext, user: UserRow, communityId: string, input: z.output<typeof createInviteSchema>): InviteDTO {
  const access = requireCommunityPermission(ctx.db, communityId, user.id, Permission.CREATE_INVITES);
  let targetUserId: string | null = null;
  if (input.targetUsername) {
    const target = ctx.db.select().from(users).where(eq(users.username, input.targetUsername)).get();
    if (!target || target.status !== 'active') throw notFound('No user with that username.');
    if (isMember(ctx.db, communityId, target.id)) throw conflict(`${target.displayName} is already a member.`, 'already_member');
    if (isBanned(ctx.db, communityId, target.id)) throw conflict('That user is banned from this community.', 'banned');
    targetUserId = target.id;
  }
  const now = Date.now();
  const row: InviteRow = {
    code: randomCode(10),
    communityId,
    inviterId: user.id,
    targetUserId,
    maxUses: targetUserId ? 1 : input.maxUses,
    uses: 0,
    expiresAt: input.expiresInHours === null ? null : now + input.expiresInHours * 3600_000,
    revokedAt: null,
    createdAt: now,
  };
  ctx.db.insert(invites).values(row).run();
  audit(ctx.db, { scope: 'community', communityId, actorId: user.id, action: 'invite.created', targetType: 'invite', targetId: row.code, metadata: { maxUses: row.maxUses, expiresAt: row.expiresAt, direct: !!targetUserId } });
  if (targetUserId) {
    notify(ctx, { userId: targetUserId, type: 'invite', actorId: user.id, communityId, data: { code: row.code, communityName: access.community.name } });
  }
  const [dto] = toInviteDTOs(ctx.db, [row]);
  return dto as InviteDTO;
}

export function listInvites(ctx: AppContext, user: UserRow, communityId: string): InviteDTO[] {
  const access = requireCommunityPermission(ctx.db, communityId, user.id, Permission.CREATE_INVITES);
  const all = hasPerm(access.permissions, Permission.MANAGE_INVITES);
  const now = Date.now();
  const rows = ctx.db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.communityId, communityId),
        isNull(invites.revokedAt),
        or(isNull(invites.expiresAt), gt(invites.expiresAt, now)),
        all ? undefined : eq(invites.inviterId, user.id),
      ),
    )
    .orderBy(desc(invites.createdAt))
    .limit(200)
    .all();
  return toInviteDTOs(ctx.db, rows);
}

export function revokeInvite(ctx: AppContext, user: UserRow, code: string): void {
  const invite = ctx.db.select().from(invites).where(eq(invites.code, code)).get();
  if (!invite) throw notFound('Invite not found.');
  const access = requireCommunityAccess(ctx.db, invite.communityId, user.id);
  if (invite.inviterId !== user.id && !hasPerm(access.permissions, Permission.MANAGE_INVITES)) throw forbidden();
  ctx.db.update(invites).set({ revokedAt: Date.now() }).where(eq(invites.code, code)).run();
  audit(ctx.db, { scope: 'community', communityId: invite.communityId, actorId: user.id, action: 'invite.revoked', targetType: 'invite', targetId: code });
}

function usableInvite(ctx: AppContext, code: string, userId: string | null): InviteRow {
  const invite = ctx.db.select().from(invites).where(eq(invites.code, code)).get();
  const now = Date.now();
  const invalid = () => new AppError(404, 'invite_invalid', 'This invitation is invalid or has expired.');
  if (!invite || invite.revokedAt || (invite.expiresAt !== null && invite.expiresAt <= now) || (invite.maxUses !== null && invite.uses >= invite.maxUses)) {
    throw invalid();
  }
  if (invite.targetUserId && userId && invite.targetUserId !== userId) throw invalid();
  return invite;
}

export function previewInvite(ctx: AppContext, code: string, userId: string | null): InvitePreviewDTO {
  const invite = usableInvite(ctx, code, userId);
  const community = ctx.db.select().from(communities).where(eq(communities.id, invite.communityId)).get();
  if (!community) throw new AppError(404, 'invite_invalid', 'This invitation is invalid or has expired.');
  const inviter = invite.inviterId ? ctx.db.select(summaryColumns).from(users).where(eq(users.id, invite.inviterId)).get() : undefined;
  return {
    code,
    community: toCommunitySummary(community),
    inviter: inviter ? toUserSummary(inviter) : null,
    expiresAt: invite.expiresAt,
    alreadyMember: userId ? isMember(ctx.db, community.id, userId) : false,
  };
}

export function acceptInvite(ctx: AppContext, user: UserRow, code: string): CommunityDTO {
  const invite = usableInvite(ctx, code, user.id);
  if (isMember(ctx.db, invite.communityId, user.id)) return getCommunityForUser(ctx, invite.communityId, user.id);
  if (isBanned(ctx.db, invite.communityId, user.id)) throw forbidden('You are banned from this community.', 'banned');
  ctx.db.transaction((tx) => {
    // Conditional increment: concurrent redemptions cannot exceed max_uses.
    const claimed = tx
      .update(invites)
      .set({ uses: sql`${invites.uses} + 1` })
      .where(and(eq(invites.code, code), or(isNull(invites.maxUses), sql`${invites.uses} < ${invites.maxUses}`)))
      .run();
    if (claimed.changes !== 1) throw new AppError(404, 'invite_invalid', 'This invitation is invalid or has expired.');
    addMember(ctx, tx, invite.communityId, user.id, Date.now());
    audit(tx, { scope: 'community', communityId: invite.communityId, actorId: user.id, action: 'member.joined', targetType: 'user', targetId: user.id, targetLabel: user.username, metadata: { invite: code } });
  });
  afterJoin(ctx, invite.communityId, user);
  return getCommunityForUser(ctx, invite.communityId, user.id);
}

/* ---------------------------------------------------------------- Explore */

export function exploreCommunities(ctx: AppContext, opts: { q?: string; tag?: string; limit: number }): CommunitySummary[] {
  const conditions = [eq(communities.visibility, 'public')];
  if (opts.q) conditions.push(like(communities.name, `%${opts.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
  if (opts.tag) conditions.push(sql`exists (select 1 from json_each(${communities.tags}) where value = ${opts.tag})`);
  return ctx.db
    .select()
    .from(communities)
    .where(and(...conditions))
    .orderBy(desc(communities.memberCount), desc(communities.createdAt))
    .limit(opts.limit)
    .all()
    .map(toCommunitySummary);
}

/* -------------------------------------------------------------- Audit log */

export function listCommunityAudit(ctx: AppContext, user: UserRow, communityId: string, before?: number): AuditEventDTO[] {
  requireCommunityPermission(ctx.db, communityId, user.id, Permission.VIEW_AUDIT_LOG);
  const rows = ctx.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.communityId, communityId), before ? lt(auditEvents.createdAt, before) : undefined))
    .orderBy(desc(auditEvents.createdAt))
    .limit(100)
    .all();
  return toAuditDTOs(ctx.db, rows);
}

export function toAuditDTOs(db: DbOrTx, rows: (typeof auditEvents.$inferSelect)[]): AuditEventDTO[] {
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const actors = new Map(actorIds.length ? db.select(summaryColumns).from(users).where(inArray(users.id, actorIds)).all().map((u) => [u.id, toUserSummary(u)]) : []);
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    communityId: r.communityId,
    actor: r.actorId ? (actors.get(r.actorId) ?? null) : null,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    targetLabel: r.targetLabel,
    reason: r.reason,
    metadata: r.metadata,
    createdAt: r.createdAt,
  }));
}

/** IDs of all members (used for presence fan-out). */
export function memberIdsOf(db: DbOrTx, communityId: string): string[] {
  return db.select({ id: communityMembers.userId }).from(communityMembers).where(eq(communityMembers.communityId, communityId)).all().map((r) => r.id);
}

