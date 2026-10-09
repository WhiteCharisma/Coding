import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import {
  LIMITS,
  Permission,
  extractMentions,
  uploadKindForMime,
  type AttachmentDTO,
  type MessageDTO,
  type MessagePage,
  type MessageReplyDTO,
  type ReactionEvent,
  type SendMessageInput,
  type UnreadState,
} from '@creator-network/shared';
import { audit } from '../audit';
import {
  type ChannelAccess,
  getChannelAccess,
  hasPerm,
  isBlockedEitherWay,
  requireChannelAccess,
  requireChannelPermission,
} from '../communities/access';
import type { AppContext } from '../context';
import type { DbOrTx } from '../db/client';
import { newId } from '../db/ids';
import {
  channelParticipants,
  channels,
  communities,
  communityMembers,
  messageMentions,
  messageReactions,
  messages,
  readStates,
  uploads,
  users,
} from '../db/schema';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { markChannelNotificationsRead, notify, scrubMessageNotifications } from '../notifications/service';
import { summaryColumns, toUserSummary, type UserRow } from '../users/dto';

export type MessageRow = typeof messages.$inferSelect;
type UploadRow = typeof uploads.$inferSelect;

const MAX_REACTION_KINDS = 20;
const MAX_PINS = 50;

/* ------------------------------------------------------------------ DTOs */

export function attachmentUrl(id: string): string {
  return `/api/files/${id}`;
}

export function toAttachmentDTO(u: UploadRow): AttachmentDTO {
  return {
    id: u.id,
    kind: uploadKindForMime(u.mime) ?? 'document',
    name: u.name,
    mime: u.mime,
    size: u.size,
    url: attachmentUrl(u.id),
    width: u.width,
    height: u.height,
    durationMs: u.durationMs,
    waveform: u.waveform ?? null,
  };
}

function preview(content: string, max = 200): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Builds DTOs for a batch of messages with a fixed number of queries.
 * `viewerId` controls the `me` flag on reactions (null for broadcasts).
 */
export function toMessageDTOs(db: DbOrTx, rows: MessageRow[], viewerId: string | null): MessageDTO[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const replyIds = [...new Set(rows.map((r) => r.replyToId).filter((x): x is string => !!x))];
  const replyRows = replyIds.length
    ? db
        .select({ id: messages.id, authorId: messages.authorId, content: messages.content, deletedAt: messages.deletedAt })
        .from(messages)
        .where(inArray(messages.id, replyIds))
        .all()
    : [];
  const replyAttachmentCounts = new Map(
    replyIds.length
      ? db
          .select({ messageId: uploads.messageId, n: sql<number>`count(*)` })
          .from(uploads)
          .where(and(inArray(uploads.messageId, replyIds), eq(uploads.status, 'attached')))
          .groupBy(uploads.messageId)
          .all()
          .map((r) => [r.messageId as string, r.n])
      : [],
  );
  const authorIds = [...new Set([...rows.map((r) => r.authorId), ...replyRows.map((r) => r.authorId)])];
  const authors = new Map(
    db
      .select(summaryColumns)
      .from(users)
      .where(inArray(users.id, authorIds))
      .all()
      .map((u) => [u.id, toUserSummary(u)]),
  );
  const attachments = new Map<string, AttachmentDTO[]>();
  for (const u of db
    .select()
    .from(uploads)
    .where(and(inArray(uploads.messageId, ids), eq(uploads.status, 'attached')))
    .orderBy(asc(uploads.id))
    .all()) {
    const list = attachments.get(u.messageId as string) ?? [];
    list.push(toAttachmentDTO(u));
    attachments.set(u.messageId as string, list);
  }
  const reactions = new Map<string, MessageDTO['reactions']>();
  for (const r of db
    .select({
      messageId: messageReactions.messageId,
      emoji: messageReactions.emoji,
      count: sql<number>`count(*)`,
      me: viewerId ? sql<number>`max(${messageReactions.userId} = ${viewerId})` : sql<number>`0`,
      first: sql<number>`min(${messageReactions.createdAt})`,
    })
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, ids))
    .groupBy(messageReactions.messageId, messageReactions.emoji)
    .orderBy(sql`min(${messageReactions.createdAt})`)
    .all()) {
    const list = reactions.get(r.messageId) ?? [];
    list.push({ emoji: r.emoji, count: r.count, me: r.me === 1 });
    reactions.set(r.messageId, list);
  }
  const mentions = new Map<string, { id: string; username: string }[]>();
  for (const m of db
    .select({ messageId: messageMentions.messageId, id: users.id, username: users.username })
    .from(messageMentions)
    .innerJoin(users, eq(users.id, messageMentions.userId))
    .where(inArray(messageMentions.messageId, ids))
    .all()) {
    const list = mentions.get(m.messageId) ?? [];
    list.push({ id: m.id, username: m.username });
    mentions.set(m.messageId, list);
  }
  const replies = new Map<string, MessageReplyDTO>(
    replyRows.map((r) => [
      r.id,
      {
        id: r.id,
        author: authors.get(r.authorId) ?? null,
        content: r.deletedAt ? '' : preview(r.content),
        deleted: r.deletedAt !== null,
        attachmentCount: replyAttachmentCounts.get(r.id) ?? 0,
      },
    ]),
  );

  return rows.map((r) => ({
    id: r.id,
    channelId: r.channelId,
    author: authors.get(r.authorId) ?? null,
    content: r.deletedAt ? '' : r.content,
    kind: r.kind,
    replyTo: r.replyToId ? (replies.get(r.replyToId) ?? null) : null,
    attachments: r.deletedAt ? [] : (attachments.get(r.id) ?? []),
    reactions: r.deletedAt ? [] : (reactions.get(r.id) ?? []),
    mentions: r.deletedAt ? [] : (mentions.get(r.id) ?? []),
    mentionEveryone: r.mentionEveryone,
    editedAt: r.editedAt,
    deletedAt: r.deletedAt,
    pinnedAt: r.pinnedAt,
    createdAt: r.createdAt,
    nonce: r.nonce,
  }));
}

function getMessageRow(db: DbOrTx, messageId: string): MessageRow | undefined {
  return db.select().from(messages).where(eq(messages.id, messageId)).get();
}

/* --------------------------------------------------------------- History */

export function getHistory(
  ctx: AppContext,
  user: UserRow,
  channelId: string,
  q: { before?: string; after?: string; around?: string; limit: number },
): MessagePage {
  requireChannelAccess(ctx.db, channelId, user.id);
  const limit = Math.min(q.limit, LIMITS.messagePageMax);
  const base = eq(messages.channelId, channelId);

  const fetchBefore = (cursor: string | undefined, n: number, inclusive = false) =>
    ctx.db
      .select()
      .from(messages)
      .where(cursor ? and(base, inclusive ? sql`${messages.id} <= ${cursor}` : lt(messages.id, cursor)) : base)
      .orderBy(desc(messages.id))
      .limit(n + 1)
      .all();
  const fetchAfter = (cursor: string, n: number) =>
    ctx.db.select().from(messages).where(and(base, gt(messages.id, cursor))).orderBy(asc(messages.id)).limit(n + 1).all();

  let rows: MessageRow[];
  let hasMoreBefore: boolean;
  let hasMoreAfter: boolean;
  if (q.around) {
    const half = Math.max(1, Math.floor(limit / 2));
    const older = fetchBefore(q.around, half, true);
    const newer = fetchAfter(q.around, limit - half);
    hasMoreBefore = older.length > half;
    hasMoreAfter = newer.length > limit - half;
    rows = [...older.slice(0, half).reverse(), ...newer.slice(0, limit - half)];
  } else if (q.after) {
    const newer = fetchAfter(q.after, limit);
    hasMoreAfter = newer.length > limit;
    rows = newer.slice(0, limit);
    hasMoreBefore = true;
  } else {
    const older = fetchBefore(q.before, limit);
    hasMoreBefore = older.length > limit;
    rows = older.slice(0, limit).reverse();
    hasMoreAfter = false;
  }
  return { messages: toMessageDTOs(ctx.db, rows, user.id), hasMoreBefore, hasMoreAfter };
}

export function getMessageForUser(ctx: AppContext, user: UserRow, messageId: string): MessageDTO {
  const row = getMessageRow(ctx.db, messageId);
  if (!row || !getChannelAccess(ctx.db, row.channelId, user.id)) throw notFound('Message not found.');
  const [dto] = toMessageDTOs(ctx.db, [row], user.id);
  return dto as MessageDTO;
}

/* ------------------------------------------------------------------ Send */

/** Resolves @username mentions to users who can actually see the channel. */
function resolveMentions(ctx: AppContext, access: ChannelAccess, content: string, authorId: string): { userIds: string[]; everyone: boolean } {
  const parsed = extractMentions(content);
  let userIds: string[] = [];
  if (parsed.usernames.length) {
    const candidates = ctx.db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(inArray(users.username, parsed.usernames))
      .all()
      .filter((u) => u.status === 'active' && u.id !== authorId);
    userIds = candidates.filter((u) => getChannelAccess(ctx.db, access.channel.id, u.id) !== null).map((u) => u.id);
  }
  const everyone = parsed.everyone && access.channel.kind === 'text' && hasPerm(access.permissions, Permission.MENTION_EVERYONE);
  return { userIds, everyone };
}

export interface SendResult {
  message: MessageDTO;
  /** False when the nonce matched an already stored message (retry). */
  created: boolean;
}

export function sendMessage(ctx: AppContext, user: UserRow, channelId: string, input: SendMessageInput): SendResult {
  // 1. Idempotency: a retry of an already stored message returns it unchanged.
  const existing = ctx.db
    .select()
    .from(messages)
    .where(and(eq(messages.authorId, user.id), eq(messages.nonce, input.nonce)))
    .get();
  if (existing) {
    if (existing.channelId !== channelId) throw conflict('Duplicate message identifier.', 'nonce_reused');
    const [dto] = toMessageDTOs(ctx.db, [existing], user.id);
    return { message: dto as MessageDTO, created: false };
  }

  // 2. Authorization.
  const access = requireChannelPermission(ctx.db, channelId, user.id, Permission.SEND_MESSAGES);
  if (input.attachmentIds.length > 0 && !hasPerm(access.permissions, Permission.ATTACH_FILES)) {
    throw forbidden('You cannot attach files in this channel.');
  }
  const settings = ctx.settings.get();
  if (settings.requireEmailVerification && ctx.mailer.enabled && user.emailVerifiedAt === null) {
    throw forbidden('Confirm your email address before sending messages.', 'email_unverified');
  }

  // 3. Validate references.
  let replyTo: MessageRow | undefined;
  if (input.replyToId) {
    replyTo = getMessageRow(ctx.db, input.replyToId);
    if (!replyTo || replyTo.channelId !== channelId || replyTo.deletedAt) {
      throw badRequest('The message you are replying to is no longer available.', undefined, 'reply_unavailable');
    }
  }
  let attachmentRows: UploadRow[] = [];
  if (input.attachmentIds.length) {
    attachmentRows = ctx.db.select().from(uploads).where(inArray(uploads.id, input.attachmentIds)).all();
    const valid =
      attachmentRows.length === new Set(input.attachmentIds).size &&
      attachmentRows.every(
        (a) => a.uploaderId === user.id && a.purpose === 'attachment' && a.status === 'pending' && a.channelId === channelId,
      );
    if (!valid) throw badRequest('One of the attachments is invalid or was already used.', undefined, 'attachment_invalid');
  }
  const mentions = resolveMentions(ctx, access, input.content, user.id);

  // 4. Persist atomically. Only after commit is the message acknowledged/broadcast.
  const now = Date.now();
  const row: typeof messages.$inferInsert = {
    id: newId(now),
    channelId,
    authorId: user.id,
    content: input.content,
    kind: 'default',
    replyToId: replyTo?.id ?? null,
    nonce: input.nonce,
    mentionEveryone: mentions.everyone,
    createdAt: now,
    updatedAt: now,
  };
  const messageId = row.id;
  try {
    ctx.db.transaction((tx) => {
      tx.insert(messages).values(row).run();
      if (mentions.userIds.length) {
        tx.insert(messageMentions).values(mentions.userIds.map((userId) => ({ messageId, userId }))).run();
      }
      if (attachmentRows.length) {
        tx.update(uploads).set({ status: 'attached', messageId }).where(inArray(uploads.id, input.attachmentIds)).run();
      }
      tx.update(channels).set({ lastMessageId: messageId, lastMessageAt: now }).where(eq(channels.id, channelId)).run();
      tx.insert(readStates)
        .values({ userId: user.id, channelId, lastReadId: messageId, updatedAt: now })
        .onConflictDoUpdate({ target: [readStates.userId, readStates.channelId], set: { lastReadId: messageId, updatedAt: now } })
        .run();
    });
  } catch (err) {
    // Concurrent retry with the same nonce won the race: return the stored message.
    if (err instanceof Error && /UNIQUE constraint failed: messages\.author_id, messages\.nonce/.test(err.message)) {
      const stored = ctx.db.select().from(messages).where(and(eq(messages.authorId, user.id), eq(messages.nonce, input.nonce))).get();
      if (stored) {
        const [dto] = toMessageDTOs(ctx.db, [stored], user.id);
        return { message: dto as MessageDTO, created: false };
      }
    }
    throw err;
  }

  const stored = getMessageRow(ctx.db, messageId) as MessageRow;
  const [dto] = toMessageDTOs(ctx.db, [stored], null);
  const message = dto as MessageDTO;
  ctx.realtime.toChannel(channelId, 'message:new', message);
  fanOutNotifications(ctx, user, access, message, mentions.userIds, replyTo);
  return { message, created: true };
}

function fanOutNotifications(
  ctx: AppContext,
  author: UserRow,
  access: ChannelAccess,
  message: MessageDTO,
  mentionedIds: string[],
  replyTo: MessageRow | undefined,
): void {
  const text = message.content ? preview(message.content, 140) : message.attachments.length ? `📎 ${message.attachments.length} attachment(s)` : '';
  const channel = access.channel;
  if (channel.kind !== 'text') {
    const others = ctx.db
      .select({ userId: channelParticipants.userId })
      .from(channelParticipants)
      .where(eq(channelParticipants.channelId, channel.id))
      .all()
      .map((p) => p.userId)
      .filter((id) => id !== author.id);
    for (const userId of others) {
      if (isBlockedEitherWay(ctx.db, userId, author.id)) continue;
      notify(ctx, { userId, type: 'dm', actorId: author.id, channelId: channel.id, messageId: message.id, data: { preview: text }, aggregate: true });
    }
    return;
  }
  const notified = new Set<string>();
  for (const userId of mentionedIds) {
    if (isBlockedEitherWay(ctx.db, userId, author.id)) continue;
    notify(ctx, { userId, type: 'mention', actorId: author.id, communityId: channel.communityId, channelId: channel.id, messageId: message.id, data: { preview: text } });
    notified.add(userId);
  }
  if (replyTo && replyTo.authorId !== author.id && !notified.has(replyTo.authorId)) {
    if (getChannelAccess(ctx.db, channel.id, replyTo.authorId) && !isBlockedEitherWay(ctx.db, replyTo.authorId, author.id)) {
      notify(ctx, { userId: replyTo.authorId, type: 'reply', actorId: author.id, communityId: channel.communityId, channelId: channel.id, messageId: message.id, data: { preview: text } });
    }
  }
}

/* ------------------------------------------------------------ Edit/delete */

export function editMessage(ctx: AppContext, user: UserRow, messageId: string, content: string): MessageDTO {
  const row = getMessageRow(ctx.db, messageId);
  if (!row) throw notFound('Message not found.');
  const access = getChannelAccess(ctx.db, row.channelId, user.id);
  if (!access) throw notFound('Message not found.');
  if (row.authorId !== user.id || row.kind !== 'default') throw forbidden('You can only edit your own messages.');
  if (row.deletedAt) throw notFound('Message not found.');
  if (content === row.content) {
    const [dto] = toMessageDTOs(ctx.db, [row], user.id);
    return dto as MessageDTO;
  }
  const mentions = resolveMentions(ctx, access, content, user.id);
  const now = Date.now();
  ctx.db.transaction((tx) => {
    tx.update(messages).set({ content, editedAt: now, updatedAt: now, mentionEveryone: mentions.everyone }).where(eq(messages.id, messageId)).run();
    tx.delete(messageMentions).where(eq(messageMentions.messageId, messageId)).run();
    if (mentions.userIds.length) {
      tx.insert(messageMentions).values(mentions.userIds.map((userId) => ({ messageId, userId }))).run();
    }
  });
  const updated = getMessageRow(ctx.db, messageId) as MessageRow;
  const [broadcast] = toMessageDTOs(ctx.db, [updated], null);
  ctx.realtime.toChannel(row.channelId, 'message:update', broadcast as MessageDTO);
  const [dto] = toMessageDTOs(ctx.db, [updated], user.id);
  return dto as MessageDTO;
}

export function deleteMessage(ctx: AppContext, user: UserRow, messageId: string, opts: { asPlatformStaff?: boolean; reason?: string } = {}): void {
  const row = getMessageRow(ctx.db, messageId);
  if (!row) throw notFound('Message not found.');
  let moderated = false;
  if (!opts.asPlatformStaff) {
    const access = getChannelAccess(ctx.db, row.channelId, user.id);
    if (!access) throw notFound('Message not found.');
    if (row.authorId !== user.id) {
      if (!hasPerm(access.permissions, Permission.MANAGE_MESSAGES)) throw forbidden('You can only delete your own messages.');
      moderated = true;
    }
  } else {
    moderated = row.authorId !== user.id;
  }
  if (row.deletedAt) return;
  const now = Date.now();
  ctx.db.transaction((tx) => {
    tx.update(messages).set({ content: '', deletedAt: now, updatedAt: now, pinnedAt: null, pinnedBy: null }).where(eq(messages.id, messageId)).run();
    tx.delete(messageReactions).where(eq(messageReactions.messageId, messageId)).run();
    tx.delete(messageMentions).where(eq(messageMentions.messageId, messageId)).run();
    tx.update(uploads).set({ status: 'deleted' }).where(eq(uploads.messageId, messageId)).run();
    scrubMessageNotifications(tx, messageId);
    if (moderated) {
      const channel = tx.select({ communityId: channels.communityId }).from(channels).where(eq(channels.id, row.channelId)).get();
      const author = tx.select({ username: users.username }).from(users).where(eq(users.id, row.authorId)).get();
      audit(tx, {
        scope: opts.asPlatformStaff || !channel?.communityId ? 'platform' : 'community',
        communityId: opts.asPlatformStaff ? null : (channel?.communityId ?? null),
        actorId: user.id,
        action: 'message.deleted',
        targetType: 'message',
        targetId: messageId,
        targetLabel: author?.username ?? null,
        reason: opts.reason ?? null,
        metadata: { channelId: row.channelId, authorId: row.authorId },
      });
    }
  });
  ctx.realtime.toChannel(row.channelId, 'message:delete', { id: messageId, channelId: row.channelId });
  if (moderated) {
    notify(ctx, { userId: row.authorId, type: 'moderation', data: { event: 'message_removed', reason: opts.reason ?? '' } });
  }
}

/* -------------------------------------------------------------- Reactions */

export function setReaction(ctx: AppContext, user: UserRow, messageId: string, emoji: string, add: boolean): ReactionEvent {
  const row = getMessageRow(ctx.db, messageId);
  if (!row || row.deletedAt) throw notFound('Message not found.');
  const access = getChannelAccess(ctx.db, row.channelId, user.id);
  if (!access) throw notFound('Message not found.');
  if (add) {
    if (!hasPerm(access.permissions, Permission.ADD_REACTIONS)) throw forbidden('You cannot add reactions here.');
    const kinds = ctx.db
      .select({ emoji: messageReactions.emoji })
      .from(messageReactions)
      .where(eq(messageReactions.messageId, messageId))
      .groupBy(messageReactions.emoji)
      .all()
      .map((r) => r.emoji);
    if (!kinds.includes(emoji) && kinds.length >= MAX_REACTION_KINDS) {
      throw conflict('This message has the maximum number of different reactions.', 'too_many_reactions');
    }
    ctx.db.insert(messageReactions).values({ messageId, userId: user.id, emoji, createdAt: Date.now() }).onConflictDoNothing().run();
  } else {
    ctx.db
      .delete(messageReactions)
      .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, user.id), eq(messageReactions.emoji, emoji)))
      .run();
  }
  const count =
    ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(messageReactions)
      .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.emoji, emoji)))
      .get()?.n ?? 0;
  const event: ReactionEvent = { messageId, channelId: row.channelId, emoji, userId: user.id, added: add, count };
  ctx.realtime.toChannel(row.channelId, 'reaction:update', event);
  return event;
}

/* ------------------------------------------------------------------- Pins */

export function setPinned(ctx: AppContext, user: UserRow, messageId: string, pinned: boolean): MessageDTO {
  const row = getMessageRow(ctx.db, messageId);
  if (!row || row.deletedAt) throw notFound('Message not found.');
  const access = getChannelAccess(ctx.db, row.channelId, user.id);
  if (!access) throw notFound('Message not found.');
  const isDm = access.channel.kind !== 'text';
  if (!isDm && !hasPerm(access.permissions, Permission.MANAGE_MESSAGES)) throw forbidden('You cannot pin messages here.');
  if (pinned && !row.pinnedAt) {
    const pins = ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(messages)
      .where(and(eq(messages.channelId, row.channelId), isNotNull(messages.pinnedAt)))
      .get()?.n ?? 0;
    if (pins >= MAX_PINS) throw conflict(`A channel can have at most ${MAX_PINS} pinned messages.`, 'too_many_pins');
  }
  const now = Date.now();
  ctx.db
    .update(messages)
    .set({ pinnedAt: pinned ? (row.pinnedAt ?? now) : null, pinnedBy: pinned ? user.id : null, updatedAt: now })
    .where(eq(messages.id, messageId))
    .run();
  if (access.channel.communityId) {
    audit(ctx.db, { scope: 'community', communityId: access.channel.communityId, actorId: user.id, action: pinned ? 'message.pinned' : 'message.unpinned', targetType: 'message', targetId: messageId, metadata: { channelId: row.channelId } });
  }
  const updated = getMessageRow(ctx.db, messageId) as MessageRow;
  const [broadcast] = toMessageDTOs(ctx.db, [updated], null);
  ctx.realtime.toChannel(row.channelId, 'message:update', broadcast as MessageDTO);
  const [dto] = toMessageDTOs(ctx.db, [updated], user.id);
  return dto as MessageDTO;
}

export function listPins(ctx: AppContext, user: UserRow, channelId: string): MessageDTO[] {
  requireChannelAccess(ctx.db, channelId, user.id);
  const rows = ctx.db
    .select()
    .from(messages)
    .where(and(eq(messages.channelId, channelId), isNotNull(messages.pinnedAt), isNull(messages.deletedAt)))
    .orderBy(desc(messages.pinnedAt))
    .limit(MAX_PINS)
    .all();
  return toMessageDTOs(ctx.db, rows, user.id);
}

/* ------------------------------------------------------------ Read states */

export function markRead(ctx: AppContext, user: UserRow, channelId: string, messageId: string): string | null {
  requireChannelAccess(ctx.db, channelId, user.id);
  const msg = ctx.db.select({ channelId: messages.channelId }).from(messages).where(eq(messages.id, messageId)).get();
  if (!msg || msg.channelId !== channelId) throw badRequest('Unknown message.');
  const now = Date.now();
  const current = ctx.db
    .select({ lastReadId: readStates.lastReadId })
    .from(readStates)
    .where(and(eq(readStates.userId, user.id), eq(readStates.channelId, channelId)))
    .get();
  if (current?.lastReadId && current.lastReadId >= messageId) return current.lastReadId;
  ctx.db
    .insert(readStates)
    .values({ userId: user.id, channelId, lastReadId: messageId, updatedAt: now })
    .onConflictDoUpdate({ target: [readStates.userId, readStates.channelId], set: { lastReadId: messageId, updatedAt: now } })
    .run();
  ctx.realtime.toUser(user.id, 'read:update', { channelId, lastReadId: messageId });
  markChannelNotificationsRead(ctx, user.id, channelId, messageId);
  return messageId;
}

const UNREAD_CAP = 100;

/**
 * Unread and mention counts for a set of channels (capped at 100 per channel).
 * Direct messages count every unread message as a mention.
 */
export function computeUnreads(db: DbOrTx, userId: string, channelIds: string[], dmChannelIds: Set<string>): UnreadState[] {
  if (channelIds.length === 0) return [];
  const idsJson = JSON.stringify(channelIds);
  const rows = db.all<{ channelId: string; lastReadId: string | null; unread: number }>(sql`
    select c.id as channelId, rs.last_read_id as lastReadId,
      (select count(*) from (
        select 1 from messages m
        where m.channel_id = c.id and m.id > coalesce(rs.last_read_id, '')
          and m.author_id <> ${userId} and m.deleted_at is null
        limit ${UNREAD_CAP})) as unread
    from channels c
    left join read_states rs on rs.channel_id = c.id and rs.user_id = ${userId}
    where c.id in (select value from json_each(${idsJson}))
  `);
  const mentionRows = db.all<{ channelId: string; n: number }>(sql`
    select m.channel_id as channelId, count(*) as n
    from message_mentions mm
    join messages m on m.id = mm.message_id
    left join read_states rs on rs.user_id = mm.user_id and rs.channel_id = m.channel_id
    where mm.user_id = ${userId} and m.deleted_at is null and m.id > coalesce(rs.last_read_id, '')
    group by m.channel_id
  `);
  const everyoneRows = db.all<{ channelId: string; n: number }>(sql`
    select m.channel_id as channelId, count(*) as n
    from messages m
    left join read_states rs on rs.user_id = ${userId} and rs.channel_id = m.channel_id
    where m.mention_everyone = 1 and m.channel_id in (select value from json_each(${idsJson}))
      and m.id > coalesce(rs.last_read_id, '') and m.author_id <> ${userId} and m.deleted_at is null
    group by m.channel_id
  `);
  const mentionCounts = new Map<string, number>();
  for (const r of [...mentionRows, ...everyoneRows]) mentionCounts.set(r.channelId, (mentionCounts.get(r.channelId) ?? 0) + r.n);
  return rows.map((r) => ({
    channelId: r.channelId,
    lastReadId: r.lastReadId,
    unread: r.unread,
    mentions: dmChannelIds.has(r.channelId) ? r.unread : Math.min(mentionCounts.get(r.channelId) ?? 0, UNREAD_CAP),
  }));
}

/** Snapshot of a message for moderation reports (content captured at report time). */
export function messageSnapshot(db: DbOrTx, messageId: string): Record<string, unknown> | null {
  const row = getMessageRow(db, messageId);
  if (!row) return null;
  const author = db.select({ username: users.username, displayName: users.displayName }).from(users).where(eq(users.id, row.authorId)).get();
  const channel = db.select({ name: channels.name, kind: channels.kind, communityId: channels.communityId }).from(channels).where(eq(channels.id, row.channelId)).get();
  const community = channel?.communityId
    ? db.select({ name: communities.name }).from(communities).where(eq(communities.id, channel.communityId)).get()
    : undefined;
  const files = db.select({ name: uploads.name, mime: uploads.mime }).from(uploads).where(eq(uploads.messageId, messageId)).all();
  return {
    messageId: row.id,
    channelId: row.channelId,
    channelName: channel?.name ?? '',
    channelKind: channel?.kind ?? '',
    communityId: channel?.communityId ?? null,
    communityName: community?.name ?? null,
    authorId: row.authorId,
    authorUsername: author?.username ?? '',
    authorDisplayName: author?.displayName ?? '',
    content: row.content,
    attachments: files,
    createdAt: row.createdAt,
    deleted: row.deletedAt !== null,
  };
}

export function assertCommunityMember(db: DbOrTx, communityId: string, userId: string): void {
  const m = db
    .select({ u: communityMembers.userId })
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)))
    .get();
  if (!m) throw new AppError(404, 'not_found', 'Not found.');
}
