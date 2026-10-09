/**
 * Authorization core. Every route or socket handler that touches a community,
 * channel or DM must resolve access through these functions.
 *
 * Rules:
 *  - Invisible resources produce 404 (notFound) so their existence is not leaked.
 *  - Visible-but-forbidden actions produce 403 (forbidden).
 */
import { and, eq, inArray, or } from 'drizzle-orm';
import {
  DM_PERMISSIONS,
  Permission,
  computeBasePermissions,
  computeChannelPermissions,
  highestRolePosition,
  type OverwriteLike,
  type PermissionContext,
  type RoleLike,
} from '@creator-network/shared';
import type { DbOrTx } from '../db/client';
import {
  channelOverwrites,
  channelParticipants,
  channels,
  communities,
  communityMembers,
  memberRoles,
  roles,
  userBlocks,
  users,
} from '../db/schema';
import { forbidden, notFound } from '../lib/errors';

export type CommunityRow = typeof communities.$inferSelect;
export type ChannelRow = typeof channels.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;

export interface CommunityAccess {
  community: CommunityRow;
  ctx: PermissionContext;
  permissions: number;
  isOwner: boolean;
  /** Highest role position (Infinity for the owner). */
  highest: number;
}

export interface ChannelAccess {
  channel: ChannelRow;
  permissions: number;
  community: CommunityAccess | null;
}

function toRoleLike(r: RoleRow): RoleLike {
  return { id: r.id, permissions: r.permissions, position: r.position, isDefault: r.isDefault };
}

/** Loads the permission context of a member. Returns null when the user is not a member. */
export function getCommunityAccess(db: DbOrTx, communityId: string, userId: string): CommunityAccess | null {
  const community = db.select().from(communities).where(eq(communities.id, communityId)).get();
  if (!community) return null;
  const member = db
    .select({ userId: communityMembers.userId })
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)))
    .get();
  if (!member) return null;
  const allRoles = db.select().from(roles).where(eq(roles.communityId, communityId)).all();
  const assigned = new Set(
    db
      .select({ roleId: memberRoles.roleId })
      .from(memberRoles)
      .where(and(eq(memberRoles.communityId, communityId), eq(memberRoles.userId, userId)))
      .all()
      .map((r) => r.roleId),
  );
  const everyone = allRoles.find((r) => r.isDefault);
  if (!everyone) throw new Error(`Community ${communityId} has no @everyone role`);
  const ctx: PermissionContext = {
    userId,
    ownerId: community.ownerId,
    everyoneRole: toRoleLike(everyone),
    memberRoles: allRoles.filter((r) => assigned.has(r.id) && !r.isDefault).map(toRoleLike),
  };
  return {
    community,
    ctx,
    permissions: computeBasePermissions(ctx),
    isOwner: community.ownerId === userId,
    highest: highestRolePosition(ctx),
  };
}

export function requireCommunityAccess(db: DbOrTx, communityId: string, userId: string): CommunityAccess {
  const access = getCommunityAccess(db, communityId, userId);
  if (!access) throw notFound('Community not found.');
  return access;
}

export function requireCommunityPermission(
  db: DbOrTx,
  communityId: string,
  userId: string,
  permission: number,
): CommunityAccess {
  const access = requireCommunityAccess(db, communityId, userId);
  if (!hasPerm(access.permissions, permission)) throw forbidden();
  return access;
}

export function hasPerm(bits: number, permission: number): boolean {
  if ((bits & Permission.ADMINISTRATOR) === Permission.ADMINISTRATOR) return true;
  return (bits & permission) === permission;
}

export function loadOverwrites(db: DbOrTx, channelId: string): OverwriteLike[] {
  return db.select().from(channelOverwrites).where(eq(channelOverwrites.channelId, channelId)).all();
}

/** True when either user has blocked the other. */
export function isBlockedEitherWay(db: DbOrTx, a: string, b: string): boolean {
  const row = db
    .select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
        and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
      ),
    )
    .get();
  return !!row;
}

/**
 * Resolves what a user may do in a channel (community text channel or DM).
 * Returns null when the user cannot see the channel at all.
 */
export function getChannelAccess(db: DbOrTx, channelId: string, userId: string): ChannelAccess | null {
  const channel = db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!channel) return null;

  if (channel.kind === 'dm' || channel.kind === 'group_dm') {
    const participants = db
      .select({ userId: channelParticipants.userId })
      .from(channelParticipants)
      .where(eq(channelParticipants.channelId, channelId))
      .all();
    if (!participants.some((p) => p.userId === userId)) return null;
    let permissions = DM_PERMISSIONS;
    if (channel.kind === 'dm') {
      const other = participants.find((p) => p.userId !== userId);
      const otherUser = other
        ? db.select({ status: users.status }).from(users).where(eq(users.id, other.userId)).get()
        : undefined;
      // Read-only when the other person is gone, suspended, or either side blocked the other.
      if (!other || !otherUser || otherUser.status !== 'active' || isBlockedEitherWay(db, userId, other.userId)) {
        permissions = Permission.VIEW_CHANNEL;
      }
    }
    return { channel, permissions, community: null };
  }

  if (!channel.communityId) return null;
  const community = getCommunityAccess(db, channel.communityId, userId);
  if (!community) return null;
  const permissions = computeChannelPermissions(community.ctx, loadOverwrites(db, channelId));
  if (!hasPerm(permissions, Permission.VIEW_CHANNEL)) return null;
  return { channel, permissions, community };
}

export function requireChannelAccess(db: DbOrTx, channelId: string, userId: string): ChannelAccess {
  const access = getChannelAccess(db, channelId, userId);
  if (!access) throw notFound('Channel not found.');
  return access;
}

export function requireChannelPermission(
  db: DbOrTx,
  channelId: string,
  userId: string,
  permission: number,
): ChannelAccess {
  const access = requireChannelAccess(db, channelId, userId);
  if (!hasPerm(access.permissions, permission)) {
    if (permission === Permission.SEND_MESSAGES && access.channel.kind === 'dm') {
      throw forbidden('You can no longer send messages in this conversation.', 'dm_unavailable');
    }
    throw forbidden();
  }
  return access;
}

export interface UserChannelPermissions {
  /** channelId → effective permissions (only channels the user can view). */
  channels: Map<string, { permissions: number; communityId: string | null; kind: ChannelRow['kind'] }>;
  /** communityId → base permissions of the user in that community. */
  communities: Map<string, number>;
}

/**
 * Computes effective permissions for every channel a user can see, using a
 * fixed number of queries regardless of how many communities they belong to.
 * Used for room subscriptions, bootstrap data and search filtering.
 */
export function computeUserChannelPermissions(db: DbOrTx, userId: string): UserChannelPermissions {
  const result: UserChannelPermissions = { channels: new Map(), communities: new Map() };

  const memberships = db
    .select({ community: communities })
    .from(communityMembers)
    .innerJoin(communities, eq(communities.id, communityMembers.communityId))
    .where(eq(communityMembers.userId, userId))
    .all()
    .map((r) => r.community);

  if (memberships.length > 0) {
    const communityIds = memberships.map((c) => c.id);
    const allRoles = db.select().from(roles).where(inArray(roles.communityId, communityIds)).all();
    const assigned = new Set(
      db
        .select({ roleId: memberRoles.roleId })
        .from(memberRoles)
        .where(eq(memberRoles.userId, userId))
        .all()
        .map((r) => r.roleId),
    );
    const channelRows = db
      .select({ id: channels.id, communityId: channels.communityId })
      .from(channels)
      .where(inArray(channels.communityId, communityIds))
      .all();
    const overwriteRows = db
      .select({ ow: channelOverwrites })
      .from(channelOverwrites)
      .innerJoin(channels, eq(channels.id, channelOverwrites.channelId))
      .where(inArray(channels.communityId, communityIds))
      .all()
      .map((r) => r.ow);
    const overwritesByChannel = new Map<string, OverwriteLike[]>();
    for (const o of overwriteRows) {
      const list = overwritesByChannel.get(o.channelId) ?? [];
      list.push(o);
      overwritesByChannel.set(o.channelId, list);
    }

    const contexts = new Map<string, PermissionContext>();
    for (const c of memberships) {
      const cRoles = allRoles.filter((r) => r.communityId === c.id);
      const everyone = cRoles.find((r) => r.isDefault);
      if (!everyone) continue;
      const ctx: PermissionContext = {
        userId,
        ownerId: c.ownerId,
        everyoneRole: toRoleLike(everyone),
        memberRoles: cRoles.filter((r) => !r.isDefault && assigned.has(r.id)).map(toRoleLike),
      };
      contexts.set(c.id, ctx);
      result.communities.set(c.id, computeBasePermissions(ctx));
    }
    for (const ch of channelRows) {
      const ctx = ch.communityId ? contexts.get(ch.communityId) : undefined;
      if (!ctx) continue;
      const bits = computeChannelPermissions(ctx, overwritesByChannel.get(ch.id) ?? []);
      if (hasPerm(bits, Permission.VIEW_CHANNEL)) {
        result.channels.set(ch.id, { permissions: bits, communityId: ch.communityId, kind: 'text' });
      }
    }
  }

  const dms = db
    .select({ id: channels.id, kind: channels.kind })
    .from(channelParticipants)
    .innerJoin(channels, eq(channels.id, channelParticipants.channelId))
    .where(eq(channelParticipants.userId, userId))
    .all();
  for (const dm of dms) {
    result.channels.set(dm.id, { permissions: DM_PERMISSIONS, communityId: null, kind: dm.kind });
  }
  return result;
}
