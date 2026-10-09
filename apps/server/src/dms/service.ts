import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { LIMITS, Permission, type DmChannelDTO } from '@creator-network/shared';
import { getChannelAccess, isBlockedEitherWay } from '../communities/access';
import type { AppContext } from '../context';
import type { DbOrTx } from '../db/client';
import { newId } from '../db/ids';
import { channelParticipants, channels, communityMembers, messages, readStates, users } from '../db/schema';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { summaryColumns, toUserSummary, type UserRow } from '../users/dto';

type ChannelRow = typeof channels.$inferSelect;

function sharesCommunity(db: DbOrTx, a: string, b: string): boolean {
  const row = db.get<{ n: number }>(sql`
    select count(*) as n from ${communityMembers} x
    join ${communityMembers} y on y.community_id = x.community_id
    where x.user_id = ${a} and y.user_id = ${b}`);
  return (row?.n ?? 0) > 0;
}

/** Can `from` start a conversation with `to`? Returns a reason when not. */
export function dmBlockReason(db: DbOrTx, from: UserRow, to: Pick<UserRow, 'id' | 'status' | 'dmPolicy'>): string | null {
  if (to.status !== 'active') return 'This account is not available.';
  if (isBlockedEitherWay(db, from.id, to.id)) return 'You cannot message this user.';
  // Platform staff can always reach users (moderation notices / appeals).
  if (from.platformRole === 'admin' || from.platformRole === 'moderator') return null;
  if (to.dmPolicy === 'nobody') return 'This user does not accept direct messages.';
  if (to.dmPolicy === 'communities' && !sharesCommunity(db, from.id, to.id)) {
    return 'This user only accepts messages from people in their communities.';
  }
  return null;
}

export function toDmDTOs(db: DbOrTx, rows: ChannelRow[], viewerId: string): DmChannelDTO[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const parts = db
    .select({ channelId: channelParticipants.channelId, joinedAt: channelParticipants.joinedAt, user: summaryColumns })
    .from(channelParticipants)
    .innerJoin(users, eq(users.id, channelParticipants.userId))
    .where(inArray(channelParticipants.channelId, ids))
    .orderBy(asc(channelParticipants.joinedAt))
    .all();
  const byChannel = new Map<string, DmChannelDTO['participants']>();
  for (const p of parts) {
    const list = byChannel.get(p.channelId) ?? [];
    list.push(toUserSummary(p.user));
    byChannel.set(p.channelId, list);
  }
  const lastIds = rows.map((r) => r.lastMessageId).filter((x): x is string => !!x);
  const last = new Map(
    lastIds.length
      ? db
          .select({ id: messages.id, content: messages.content, deletedAt: messages.deletedAt })
          .from(messages)
          .where(inArray(messages.id, lastIds))
          .all()
          .map((m) => [m.id, m.deletedAt ? '' : m.content.replace(/\s+/g, ' ').slice(0, 120)])
      : [],
  );
  return rows.map((r) => {
    const access = getChannelAccess(db, r.id, viewerId);
    return {
      id: r.id,
      kind: r.kind,
      communityId: null,
      categoryId: null,
      name: r.name,
      topic: '',
      position: 0,
      isPrivate: true,
      lastMessageId: r.lastMessageId,
      lastMessageAt: r.lastMessageAt,
      myPermissions: access?.permissions ?? Permission.VIEW_CHANNEL,
      ownerId: r.ownerId,
      participants: byChannel.get(r.id) ?? [],
      lastMessagePreview: r.lastMessageId ? (last.get(r.lastMessageId) ?? null) : null,
    };
  });
}

export function listDms(ctx: AppContext, user: UserRow): DmChannelDTO[] {
  const rows = ctx.db
    .select({ channel: channels })
    .from(channelParticipants)
    .innerJoin(channels, eq(channels.id, channelParticipants.channelId))
    .where(eq(channelParticipants.userId, user.id))
    .orderBy(desc(sql`coalesce(${channels.lastMessageAt}, ${channels.createdAt})`))
    .limit(300)
    .all()
    .map((r) => r.channel);
  return toDmDTOs(ctx.db, rows, user.id);
}

function requireDm(ctx: AppContext, channelId: string, userId: string): ChannelRow {
  const access = getChannelAccess(ctx.db, channelId, userId);
  if (!access || access.channel.kind === 'text') throw notFound('Conversation not found.');
  return access.channel;
}

export function getDm(ctx: AppContext, user: UserRow, channelId: string): DmChannelDTO {
  const ch = requireDm(ctx, channelId, user.id);
  return toDmDTOs(ctx.db, [ch], user.id)[0] as DmChannelDTO;
}

function notifyParticipants(ctx: AppContext, channelId: string, userIds: string[]): void {
  for (const id of userIds) {
    ctx.realtime.syncUserRooms(id);
    ctx.realtime.toUser(id, 'dm:update', { channelId });
  }
}

function loadTargets(ctx: AppContext, user: UserRow, userIds: string[]): UserRow[] {
  const unique = [...new Set(userIds)].filter((id) => id !== user.id);
  if (unique.length === 0) throw badRequest('Choose at least one other person.');
  const targets = ctx.db.select().from(users).where(inArray(users.id, unique)).all();
  if (targets.length !== unique.length) throw notFound('User not found.');
  for (const t of targets) {
    const reason = dmBlockReason(ctx.db, user, t);
    if (reason) throw forbidden(reason, 'dm_not_allowed');
  }
  return targets;
}

export function openDm(ctx: AppContext, user: UserRow, userIds: string[], name?: string): DmChannelDTO {
  const targets = loadTargets(ctx, user, userIds);
  const now = Date.now();
  if (targets.length === 1) {
    const other = targets[0] as UserRow;
    const dmKey = [user.id, other.id].sort().join(':');
    const existing = ctx.db.select().from(channels).where(eq(channels.dmKey, dmKey)).get();
    if (existing) return toDmDTOs(ctx.db, [existing], user.id)[0] as DmChannelDTO;
    const channelId = newId(now);
    ctx.db.transaction((tx) => {
      tx.insert(channels).values({ id: channelId, kind: 'dm', dmKey, createdAt: now, updatedAt: now }).onConflictDoNothing().run();
      const created = tx.select({ id: channels.id }).from(channels).where(eq(channels.dmKey, dmKey)).get();
      if (created?.id === channelId) {
        tx.insert(channelParticipants)
          .values([
            { channelId, userId: user.id, joinedAt: now },
            { channelId, userId: other.id, joinedAt: now },
          ])
          .run();
      }
    });
    const ch = ctx.db.select().from(channels).where(eq(channels.dmKey, dmKey)).get() as ChannelRow;
    notifyParticipants(ctx, ch.id, [user.id, other.id]);
    return toDmDTOs(ctx.db, [ch], user.id)[0] as DmChannelDTO;
  }
  if (targets.length + 1 > LIMITS.groupDmMax) throw badRequest(`Group conversations can have at most ${LIMITS.groupDmMax} people.`);
  const channelId = newId(now);
  ctx.db.transaction((tx) => {
    tx.insert(channels).values({ id: channelId, kind: 'group_dm', name: name ?? '', ownerId: user.id, createdAt: now, updatedAt: now }).run();
    tx.insert(channelParticipants)
      .values([user.id, ...targets.map((t) => t.id)].map((userId) => ({ channelId, userId, joinedAt: now })))
      .run();
  });
  notifyParticipants(ctx, channelId, [user.id, ...targets.map((t) => t.id)]);
  return getDm(ctx, user, channelId);
}

function participantIds(db: DbOrTx, channelId: string): string[] {
  return db.select({ id: channelParticipants.userId }).from(channelParticipants).where(eq(channelParticipants.channelId, channelId)).all().map((r) => r.id);
}

export function renameGroup(ctx: AppContext, user: UserRow, channelId: string, name: string): DmChannelDTO {
  const ch = requireDm(ctx, channelId, user.id);
  if (ch.kind !== 'group_dm') throw badRequest('Only group conversations can be renamed.');
  ctx.db.update(channels).set({ name, updatedAt: Date.now() }).where(eq(channels.id, channelId)).run();
  notifyParticipants(ctx, channelId, participantIds(ctx.db, channelId));
  return getDm(ctx, user, channelId);
}

export function addParticipants(ctx: AppContext, user: UserRow, channelId: string, userIds: string[]): DmChannelDTO {
  const ch = requireDm(ctx, channelId, user.id);
  if (ch.kind !== 'group_dm') throw badRequest('Start a new group conversation to add people.');
  const current = participantIds(ctx.db, channelId);
  const fresh = userIds.filter((id) => !current.includes(id));
  if (fresh.length === 0) return getDm(ctx, user, channelId);
  const targets = loadTargets(ctx, user, fresh);
  if (current.length + targets.length > LIMITS.groupDmMax) throw badRequest(`Group conversations can have at most ${LIMITS.groupDmMax} people.`);
  const now = Date.now();
  const lastId = ch.lastMessageId;
  ctx.db.transaction((tx) => {
    tx.insert(channelParticipants).values(targets.map((t) => ({ channelId, userId: t.id, joinedAt: now }))).run();
    if (lastId) {
      for (const t of targets) {
        tx.insert(readStates).values({ userId: t.id, channelId, lastReadId: lastId, updatedAt: now }).onConflictDoNothing().run();
      }
    }
  });
  notifyParticipants(ctx, channelId, [...current, ...targets.map((t) => t.id)]);
  return getDm(ctx, user, channelId);
}

export function removeParticipant(ctx: AppContext, user: UserRow, channelId: string, targetId: string): void {
  const ch = requireDm(ctx, channelId, user.id);
  if (ch.kind !== 'group_dm') throw badRequest('You cannot leave a one-to-one conversation.');
  if (targetId !== user.id && ch.ownerId !== user.id) throw forbidden('Only the group owner can remove people.');
  const current = participantIds(ctx.db, channelId);
  if (!current.includes(targetId)) throw notFound('Participant not found.');
  const remaining = current.filter((id) => id !== targetId);
  ctx.db.transaction((tx) => {
    tx.delete(channelParticipants).where(and(eq(channelParticipants.channelId, channelId), eq(channelParticipants.userId, targetId))).run();
    tx.delete(readStates).where(and(eq(readStates.channelId, channelId), eq(readStates.userId, targetId))).run();
    if (remaining.length === 0) {
      tx.delete(channels).where(eq(channels.id, channelId)).run();
    } else if (ch.ownerId === targetId) {
      tx.update(channels).set({ ownerId: remaining[0] }).where(eq(channels.id, channelId)).run();
    }
  });
  notifyParticipants(ctx, channelId, [...remaining, targetId]);
}


