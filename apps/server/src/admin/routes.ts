import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  adminSetRoleSchema,
  adminSettingsSchema,
  adminSuspendSchema,
  idSchema,
  moderationReasonSchema,
  platformInviteSchema,
  resolveReportSchema,
} from '@creator-network/shared';
import { audit } from '../audit';
import { publicConfig } from '../auth/routes';
import { requireStaff } from '../auth/plugin';
import type { AppContext } from '../context';
import { parse } from '../lib/validation';
import { createBackup, listBackups } from '../ops/backup';
import { listReports, resolveReport } from '../reports/service';
import * as svc from './service';

type IdParams = { Params: { id: string } };

const usersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'suspended', 'deleted']).optional(),
  role: z.enum(['member', 'moderator', 'admin']).optional(),
  before: z.coerce.number().int().positive().optional(),
});
const reportsQuery = z.object({
  status: z.enum(['open', 'resolved', 'dismissed']).optional(),
  before: z.coerce.number().int().positive().optional(),
});
const beforeQuery = z.object({ before: z.coerce.number().int().positive().optional() });
const deleteUserSchema = z.object({ deleteMessages: z.boolean().default(false) });
const codeSchema = z.string().regex(/^[A-Za-z0-9]{6,32}$/);

/** Everything under /api/admin requires platform staff; admin-only actions check again in the service. */
export function registerAdminRoutes(app: FastifyInstance, ctx: AppContext): void {
  const id = (raw: string) => parse(idSchema, raw);

  app.get('/api/admin/overview', async (request) => {
    requireStaff(request);
    return svc.overview(ctx);
  });

  app.get('/api/admin/users', async (request) => {
    requireStaff(request);
    return { users: svc.listUsers(ctx, parse(usersQuery, request.query)) };
  });

  app.post<IdParams>('/api/admin/users/:id/suspend', async (request) => {
    const { user } = requireStaff(request);
    const input = parse(adminSuspendSchema, request.body);
    return { user: svc.suspendUser(ctx, user, id(request.params.id), input.reason, input.days) };
  });

  app.post<IdParams>('/api/admin/users/:id/restore', async (request) => {
    const { user } = requireStaff(request);
    return { user: svc.restoreUser(ctx, user, id(request.params.id)) };
  });

  app.put<IdParams>('/api/admin/users/:id/role', async (request) => {
    const { user } = requireStaff(request, 'admin');
    return { user: svc.setPlatformRole(ctx, user, id(request.params.id), parse(adminSetRoleSchema, request.body).role) };
  });

  app.post<IdParams>('/api/admin/users/:id/reset-link', async (request) => {
    const { user } = requireStaff(request, 'admin');
    return { link: svc.adminResetLink(ctx, user, id(request.params.id)) };
  });

  app.delete<IdParams>('/api/admin/users/:id', async (request, reply) => {
    const { user } = requireStaff(request, 'admin');
    await svc.adminDeleteUser(ctx, user, id(request.params.id), parse(deleteUserSchema, request.body).deleteMessages);
    reply.status(204);
  });

  app.get('/api/admin/communities', async (request) => {
    requireStaff(request);
    const { q } = parse(z.object({ q: z.string().trim().max(60).optional() }), request.query);
    return { communities: svc.listAllCommunities(ctx, q) };
  });

  app.delete<IdParams>('/api/admin/communities/:id', async (request, reply) => {
    const { user } = requireStaff(request, 'admin');
    svc.adminDeleteCommunity(ctx, user, id(request.params.id), parse(moderationReasonSchema, request.body).reason);
    reply.status(204);
  });

  app.get('/api/admin/reports', async (request) => {
    requireStaff(request);
    return { reports: listReports(ctx, parse(reportsQuery, request.query)) };
  });

  app.post<IdParams>('/api/admin/reports/:id/resolve', async (request) => {
    const { user } = requireStaff(request);
    return { report: resolveReport(ctx, user, id(request.params.id), parse(resolveReportSchema, request.body)) };
  });

  app.get('/api/admin/audit', async (request) => {
    requireStaff(request);
    return { events: svc.platformAudit(ctx, parse(beforeQuery, request.query).before) };
  });

  app.get('/api/admin/settings', async (request) => {
    requireStaff(request, 'admin');
    return { settings: ctx.settings.get(), hardLimits: { maxUploadMb: ctx.config.maxUploadMbHardLimit }, email: { enabled: ctx.mailer.enabled, transport: ctx.mailer.transport } };
  });

  app.patch('/api/admin/settings', async (request) => {
    const { user } = requireStaff(request, 'admin');
    const input = parse(adminSettingsSchema, request.body);
    if (input.maxUploadMb !== undefined) input.maxUploadMb = Math.min(input.maxUploadMb, ctx.config.maxUploadMbHardLimit);
    const settings = ctx.settings.update(input, user.id);
    audit(ctx.db, { scope: 'platform', actorId: user.id, action: 'settings.updated', metadata: { ...input } });
    return { settings, config: publicConfig(ctx) };
  });

  app.get('/api/admin/registration-invites', async (request) => {
    requireStaff(request, 'admin');
    return { invites: svc.listRegistrationInvites(ctx) };
  });

  app.post('/api/admin/registration-invites', async (request, reply) => {
    const { user } = requireStaff(request, 'admin');
    const invite = svc.createRegistrationInvite(ctx, user, parse(platformInviteSchema, request.body));
    reply.status(201);
    return { invite };
  });

  app.delete<{ Params: { code: string } }>('/api/admin/registration-invites/:code', async (request, reply) => {
    const { user } = requireStaff(request, 'admin');
    svc.revokeRegistrationInvite(ctx, user, parse(codeSchema, request.params.code));
    reply.status(204);
  });

  app.get('/api/admin/backups', async (request) => {
    requireStaff(request, 'admin');
    return { backups: listBackups(ctx.config.backupDir) };
  });

  app.post('/api/admin/backups', async (request, reply) => {
    const { user } = requireStaff(request, 'admin');
    const backup = await createBackup(ctx, { reason: 'manual' });
    audit(ctx.db, { scope: 'platform', actorId: user.id, action: 'backup.created', metadata: { file: backup.file, bytes: backup.bytes } });
    reply.status(201);
    return { backup };
  });
}
