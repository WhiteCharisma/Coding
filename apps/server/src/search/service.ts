import { inArray, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type { SearchResultDTO, searchQuerySchema } from '@creator-network/shared';
import { computeUserChannelPermissions } from '../communities/access';
import type { AppContext } from '../context';
import { channels, communities, users } from '../db/schema';
import { toMessageDTOs, type MessageRow } from '../messages/service';
import type { UserRow } from '../users/dto';

/**
 * Turns free text into a safe FTS5 query: every token is quoted (so operators
 * and syntax characters are inert) and the last token matches as a prefix.
 */
export function toFtsQuery(input: string): string | null {
  const tokens = input
    .normalize('NFKC')
    .split(/\s+/)
    .map((t) => t.replace(/["*^():]/g, '').trim())
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (tokens.length === 0) return null;
  return tokens.map((t, i) => `"${t}"${i === tokens.length - 1 && t.length >= 2 ? '*' : ''}`).join(' ');
}

export interface SearchResponse {
  results: SearchResultDTO[];
  nextBefore: string | null;
}

export function searchMessages(ctx: AppContext, user: UserRow, q: z.output<typeof searchQuerySchema>): SearchResponse {
  const empty = { results: [], nextBefore: null };
  // Authorization first: only channels the user can currently read.
  const perms = computeUserChannelPermissions(ctx.db, user.id);
  let channelIds = [...perms.channels.keys()];
  if (q.channelId) channelIds = channelIds.filter((id) => id === q.channelId);
  if (q.communityId) channelIds = channelIds.filter((id) => perms.channels.get(id)?.communityId === q.communityId);
  if (channelIds.length === 0) return empty;

  let authorId: string | null = null;
  if (q.author) {
    const author = ctx.db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.username} = ${q.author}`)
      .get();
    if (!author) return empty;
    authorId = author.id;
  }
  const fts = toFtsQuery(q.q);
  if (!fts && !authorId && !q.has && !q.channelId) return empty;

  const conditions: SQL[] = [
    sql`m.channel_id in (select value from json_each(${JSON.stringify(channelIds)}))`,
    sql`m.deleted_at is null`,
    sql`m.kind = 'default'`,
  ];
  if (authorId) conditions.push(sql`m.author_id = ${authorId}`);
  if (q.from) conditions.push(sql`m.created_at >= ${q.from}`);
  if (q.to) conditions.push(sql`m.created_at <= ${q.to}`);
  if (q.before) conditions.push(sql`m.id < ${q.before}`);
  if (q.has === 'link') conditions.push(sql`(m.content like '%http://%' or m.content like '%https://%')`);
  if (q.has === 'file')
    conditions.push(sql`exists (select 1 from uploads u where u.message_id = m.id and u.status = 'attached')`);
  if (q.has === 'image')
    conditions.push(
      sql`exists (select 1 from uploads u where u.message_id = m.id and u.status = 'attached' and u.mime like 'image/%')`,
    );
  if (q.has === 'audio')
    conditions.push(
      sql`exists (select 1 from uploads u where u.message_id = m.id and u.status = 'attached' and u.mime like 'audio/%')`,
    );
  const where = sql.join(conditions, sql` and `);
  const limit = q.limit + 1;

  type Row = MessageRow & { hl: string | null };
  let rows: Row[];
  const cols = sql`m.seq as seq, m.id as id, m.channel_id as channelId, m.author_id as authorId, m.content as content, m.kind as kind,
    m.reply_to_id as replyToId, m.nonce as nonce, m.mention_everyone as mentionEveryone, m.edited_at as editedAt,
    m.deleted_at as deletedAt, m.pinned_at as pinnedAt, m.pinned_by as pinnedBy, m.created_at as createdAt, m.updated_at as updatedAt`;
  if (fts) {
    rows = ctx.db.all<Row>(sql`
      select ${cols}, highlight(messages_fts, 0, char(1), char(2)) as hl
      from messages_fts f join messages m on m.seq = f.rowid
      where messages_fts match ${fts} and ${where}
      order by m.id desc limit ${limit}`);
  } else {
    rows = ctx.db.all<Row>(
      sql`select ${cols}, null as hl from messages m where ${where} order by m.id desc limit ${limit}`,
    );
  }
  const page = rows.slice(0, q.limit).map((r) => ({ ...r, mentionEveryone: Boolean(r.mentionEveryone) }));
  const dtos = toMessageDTOs(ctx.db, page, user.id);

  const chanIds = [...new Set(page.map((r) => r.channelId))];
  const chanRows = chanIds.length
    ? ctx.db
        .select({ id: channels.id, name: channels.name, kind: channels.kind, communityId: channels.communityId })
        .from(channels)
        .where(inArray(channels.id, chanIds))
        .all()
    : [];
  const chanById = new Map(chanRows.map((c) => [c.id, c]));
  const commIds = [...new Set(chanRows.map((c) => c.communityId).filter((x): x is string => !!x))];
  const commNames = new Map(
    commIds.length
      ? ctx.db
          .select({ id: communities.id, name: communities.name })
          .from(communities)
          .where(inArray(communities.id, commIds))
          .all()
          .map((c) => [c.id, c.name])
      : [],
  );
  const results: SearchResultDTO[] = dtos.map((message, i) => {
    const ch = chanById.get(message.channelId);
    return {
      message,
      channelName: ch?.name ?? '',
      channelKind: ch?.kind ?? 'text',
      communityId: ch?.communityId ?? null,
      communityName: ch?.communityId ? (commNames.get(ch.communityId) ?? null) : null,
      highlight: page[i]?.hl ?? message.content,
    };
  });
  return { results, nextBefore: rows.length > q.limit ? (page[page.length - 1]?.id ?? null) : null };
}
