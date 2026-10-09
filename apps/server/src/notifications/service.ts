import { and, count, desc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { NotificationDTO, NotificationType } from '@creator-network/shared';
import type { AppContext } from '../context';
import type { DbOrTx } from '../db/client';
import { newId } from '../db/ids';
import { channels, communities, notifications, users } from '../db/schema';
import { notificationPrefsOf, summaryColumns, toUserSummary } from '../users/dto';

export type NotificationRow = typeof notifications.$inferSelect;

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  communityId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  data?: Record<string, unknown>;
  /** Collapse into an existing unread notification for the same channel (used for DMs). */
  aggregate?: boolean;
}

/** Types a muted community can no longer generate. */
const MUTABLE_TYPES: NotificationType[] = ['mention', 'reply', 'community'];

export function toNotificationDTOs(db: DbOrTx, rows: NotificationRow[]): NotificationDTO[] {
  if (rows.length === 0) return [];
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const communityIds = [...new Set(rows.map((r) => r.communityId).filter((x): x is string => !!x))];
  const channelIds = [...new Set(rows.map((r) => r.channelId).filter((x): x is string => !!x))];
  const actors = new Map(
    actorIds.length
      ? db.select(summaryColumns).from(users).where(inArray(users.id, actorIds)).all().map((u) => [u.id, toUserSummary(u)])
      : [],
  );
  const communityNames = new Map(
    communityIds.length
      ? db.select({ id: communities.id, name: communities.name }).from(communities).where(inArray(communities.id, communityIds)).all().map((c) => [c.id, c.name])
      : [],
  );
  const channelNames = new Map(
    channelIds.length
      ? db.select({ id: channels.id, name: channels.name }).from(channels).where(inArray(channels.id, channelIds)).all().map((c) => [c.id, c.name])
      : [],
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type as NotificationType,
    actor: r.actorId ? (actors.get(r.actorId) ?? null) : null,
    communityId: r.communityId,
    communityName: r.communityId ? (communityNames.get(r.communityId) ?? null) : null,
    channelId: r.channelId,
    channelName: r.channelId ? (channelNames.get(r.channelId) ?? null) : null,
    messageId: r.messageId,
    data: r.data,
    count: r.count,
    readAt: r.readAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Creates (or aggregates) a notification and pushes it to the user's sockets.
 * Respects the recipient's notification preferences and muted communities.
 */
export function notify(ctx: AppContext, input: NotifyInput): NotificationDTO | null {
  const recipient = ctx.db
    .select({ status: users.status, notificationPrefs: users.notificationPrefs, mutedCommunityIds: users.mutedCommunityIds })
    .from(users)
    .where(eq(users.id, input.userId))
    .get();
  if (!recipient || recipient.status !== 'active') return null;
  if (input.type !== 'system') {
    const prefs = notificationPrefsOf(recipient);
    if (prefs[input.type as keyof typeof prefs] === false) return null;
  }
  if (input.communityId && MUTABLE_TYPES.includes(input.type) && recipient.mutedCommunityIds.includes(input.communityId)) {
    return null;
  }

  const now = Date.now();
  let row: NotificationRow | undefined;
  if (input.aggregate && input.channelId) {
    const existing = ctx.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, input.userId),
          eq(notifications.type, input.type),
          eq(notifications.channelId, input.channelId),
          isNull(notifications.readAt),
        ),
      )
      .get();
    if (existing) {
      ctx.db
        .update(notifications)
        .set({
          count: existing.count + 1,
          updatedAt: now,
          actorId: input.actorId ?? existing.actorId,
          messageId: input.messageId ?? existing.messageId,
          data: input.data ?? existing.data,
        })
        .where(eq(notifications.id, existing.id))
        .run();
      row = ctx.db.select().from(notifications).where(eq(notifications.id, existing.id)).get();
    }
  }
  if (!row) {
    row = {
      id: newId(now),
      userId: input.userId,
      type: input.type,
      actorId: input.actorId ?? null,
      communityId: input.communityId ?? null,
      channelId: input.channelId ?? null,
      messageId: input.messageId ?? null,
      data: input.data ?? {},
      count: 1,
      readAt: null,
      createdAt: now,
      updatedAt: now,
    };
    ctx.db.insert(notifications).values(row).run();
  }
  const [dto] = toNotificationDTOs(ctx.db, [row]);
  if (dto) ctx.realtime.toUser(input.userId, 'notification:new', dto);
  return dto ?? null;
}

export function listNotifications(
  ctx: AppContext,
  userId: string,
  opts: { before?: number; unreadOnly?: boolean; types?: NotificationType[]; limit: number },
): NotificationDTO[] {
  const conditions = [eq(notifications.userId, userId)];
  if (opts.before) conditions.push(lt(notifications.updatedAt, opts.before));
  if (opts.unreadOnly) conditions.push(isNull(notifications.readAt));
  if (opts.types?.length) conditions.push(inArray(notifications.type, opts.types));
  const rows = ctx.db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.updatedAt))
    .limit(opts.limit)
    .all();
  return toNotificationDTOs(ctx.db, rows);
}

export function unreadNotificationCount(db: DbOrTx, userId: string): number {
  const row = db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .get();
  return row?.n ?? 0;
}

export function markNotificationsRead(ctx: AppContext, userId: string, ids: string[] | 'all'): void {
  const now = Date.now();
  const where =
    ids === 'all'
      ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
      : and(eq(notifications.userId, userId), inArray(notifications.id, ids), isNull(notifications.readAt));
  ctx.db.update(notifications).set({ readAt: now }).where(where).run();
  ctx.realtime.toUser(userId, 'notification:read', { ids });
}

/** Reading a channel clears its DM/mention/reply notifications up to that message. */
export function markChannelNotificationsRead(ctx: AppContext, userId: string, channelId: string, upToMessageId: string): void {
  const now = Date.now();
  const targets = ctx.db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.channelId, channelId),
        isNull(notifications.readAt),
        inArray(notifications.type, ['dm', 'mention', 'reply']),
        or(isNull(notifications.messageId), lte(notifications.messageId, upToMessageId)),
      ),
    )
    .all()
    .map((r) => r.id);
  if (targets.length === 0) return;
  ctx.db.update(notifications).set({ readAt: now }).where(inArray(notifications.id, targets)).run();
  ctx.realtime.toUser(userId, 'notification:read', { ids: targets });
}

/** When a message is deleted, remove notifications that would still show its content. */
export function scrubMessageNotifications(db: DbOrTx, messageId: string): void {
  db.delete(notifications)
    .where(and(eq(notifications.messageId, messageId), inArray(notifications.type, ['mention', 'reply'])))
    .run();
  db.update(notifications)
    .set({ data: sql`json_set(${notifications.data}, '$.preview', '')` })
    .where(and(eq(notifications.messageId, messageId), eq(notifications.type, 'dm')))
    .run();
}
