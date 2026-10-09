import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import type { z } from 'zod';
import type { ReportDTO, ReportReason, createReportSchema, resolveReportSchema } from '@creator-network/shared';
import { suspendUser } from '../admin/service';
import { audit } from '../audit';
import { getChannelAccess, getCommunityAccess } from '../communities/access';
import type { AppContext } from '../context';
import type { DbOrTx } from '../db/client';
import { newId } from '../db/ids';
import { communities, reports, users } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { deleteMessage, messageSnapshot } from '../messages/service';
import { notify } from '../notifications/service';
import { summaryColumns, toUserSummary, type UserRow } from '../users/dto';

type ReportRow = typeof reports.$inferSelect;

function toReportDTOs(db: DbOrTx, rows: ReportRow[]): ReportDTO[] {
  const ids = [...new Set(rows.flatMap((r) => [r.reporterId, r.resolvedBy]).filter((x): x is string => !!x))];
  const people = new Map(ids.length ? db.select(summaryColumns).from(users).where(inArray(users.id, ids)).all().map((u) => [u.id, toUserSummary(u)]) : []);
  return rows.map((r) => ({
    id: r.id,
    reporter: r.reporterId ? (people.get(r.reporterId) ?? null) : null,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason as ReportReason,
    details: r.details,
    snapshot: r.snapshot,
    status: r.status,
    resolvedBy: r.resolvedBy ? (people.get(r.resolvedBy) ?? null) : null,
    resolutionNote: r.resolutionNote,
    resolvedAt: r.resolvedAt,
    createdAt: r.createdAt,
  }));
}

/**
 * Files a report. The reporter must be able to see what they report; a copy of
 * the content is stored so moderators can review it even if it is later edited.
 */
export function createReport(ctx: AppContext, user: UserRow, input: z.output<typeof createReportSchema>): { id: string } {
  let snapshot: Record<string, unknown> | null;
  let communityId: string | null = null;
  let targetUserId: string | null = null;
  if (input.targetType === 'message') {
    snapshot = messageSnapshot(ctx.db, input.targetId);
    if (!snapshot || !getChannelAccess(ctx.db, String(snapshot.channelId), user.id)) throw notFound('Message not found.');
    communityId = (snapshot.communityId as string | null) ?? null;
    targetUserId = String(snapshot.authorId);
  } else if (input.targetType === 'user') {
    const target = ctx.db.select().from(users).where(eq(users.id, input.targetId)).get();
    if (!target || target.status === 'deleted') throw notFound('User not found.');
    targetUserId = target.id;
    snapshot = { username: target.username, displayName: target.displayName, headline: target.headline, bio: target.bio, links: target.links };
  } else {
    const community = ctx.db.select().from(communities).where(eq(communities.id, input.targetId)).get();
    if (!community || (community.visibility !== 'public' && !getCommunityAccess(ctx.db, community.id, user.id))) throw notFound('Community not found.');
    communityId = community.id;
    snapshot = { name: community.name, description: community.description, ownerId: community.ownerId };
  }
  if (targetUserId === user.id) throw badRequest('You cannot report yourself.');

  const existing = ctx.db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.reporterId, user.id), eq(reports.targetType, input.targetType), eq(reports.targetId, input.targetId), eq(reports.status, 'open')))
    .get();
  if (existing) return existing;

  const id = newId();
  ctx.db
    .insert(reports)
    .values({ id, reporterId: user.id, targetType: input.targetType, targetId: input.targetId, communityId, reason: input.reason, details: input.details, snapshot: snapshot ?? {}, createdAt: Date.now() })
    .run();
  return { id };
}

export function listReports(ctx: AppContext, opts: { status?: 'open' | 'resolved' | 'dismissed'; before?: number }): ReportDTO[] {
  const rows = ctx.db
    .select()
    .from(reports)
    .where(and(opts.status ? eq(reports.status, opts.status) : undefined, opts.before ? lt(reports.createdAt, opts.before) : undefined))
    .orderBy(desc(reports.createdAt))
    .limit(100)
    .all();
  return toReportDTOs(ctx.db, rows);
}

export function resolveReport(ctx: AppContext, staff: UserRow, reportId: string, input: z.output<typeof resolveReportSchema>): ReportDTO {
  const report = ctx.db.select().from(reports).where(eq(reports.id, reportId)).get();
  if (!report) throw notFound('Report not found.');
  if (report.status !== 'open') throw badRequest('This report was already handled.');

  const subjectUserId =
    report.targetType === 'user' ? report.targetId : report.targetType === 'message' ? String(report.snapshot.authorId ?? '') : null;

  if (input.action === 'delete_message') {
    if (report.targetType !== 'message') throw badRequest('Only message reports can delete a message.');
    deleteMessage(ctx, staff, report.targetId, { asPlatformStaff: true, reason: input.note });
  } else if (input.action === 'warn_user') {
    if (!subjectUserId) throw badRequest('This report has no user to warn.');
    notify(ctx, { userId: subjectUserId, type: 'moderation', actorId: null, data: { event: 'warning', reason: input.note } });
    audit(ctx.db, { scope: 'platform', actorId: staff.id, action: 'user.warned', targetType: 'user', targetId: subjectUserId, reason: input.note, metadata: { reportId } });
  } else if (input.action === 'suspend_user') {
    if (!subjectUserId) throw badRequest('This report has no user to suspend.');
    suspendUser(ctx, staff, subjectUserId, input.note || `Violation reported: ${report.reason}`, input.suspendDays ?? null);
  }

  const now = Date.now();
  ctx.db
    .update(reports)
    .set({ status: input.status, resolvedBy: staff.id, resolutionNote: input.note, resolvedAt: now })
    .where(eq(reports.id, reportId))
    .run();
  audit(ctx.db, { scope: 'platform', actorId: staff.id, action: `report.${input.status}`, targetType: 'report', targetId: reportId, reason: input.note, metadata: { action: input.action, targetType: report.targetType } });
  if (report.reporterId) {
    notify(ctx, { userId: report.reporterId, type: 'moderation', data: { event: 'report_reviewed', outcome: input.status } });
  }
  return toReportDTOs(ctx.db, [ctx.db.select().from(reports).where(eq(reports.id, reportId)).get() as ReportRow])[0] as ReportDTO;
}
