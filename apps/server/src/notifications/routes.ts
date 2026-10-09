import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NOTIFICATION_TYPES, idSchema } from '@creator-network/shared';
import { requireAuth } from '../auth/plugin';
import type { AppContext } from '../context';
import { parse } from '../lib/validation';
import { listNotifications, markNotificationsRead, unreadNotificationCount } from './service';

const listQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  unread: z.enum(['1', 'true']).optional(),
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : []))
    .pipe(z.array(z.enum(NOTIFICATION_TYPES)).max(NOTIFICATION_TYPES.length)),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
const markSchema = z.object({ ids: z.union([z.literal('all'), z.array(idSchema).min(1).max(200)]) });

export function registerNotificationRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/notifications', async (request) => {
    const { user } = requireAuth(request);
    const q = parse(listQuery, request.query);
    return {
      notifications: listNotifications(ctx, user.id, {
        before: q.before,
        unreadOnly: !!q.unread,
        types: q.types,
        limit: q.limit,
      }),
      unread: unreadNotificationCount(ctx.db, user.id),
    };
  });

  app.post('/api/notifications/read', async (request) => {
    const { user } = requireAuth(request);
    const { ids } = parse(markSchema, request.body);
    markNotificationsRead(ctx, user.id, ids);
    return { unread: unreadNotificationCount(ctx.db, user.id) };
  });
}
