import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idSchema, updatePreferencesSchema, updateProfileSchema, usernameSchema } from '@creator-network/shared';
import { requireAuth } from '../auth/plugin';
import type { AppContext } from '../context';
import { parse } from '../lib/validation';
import { toSelfUser } from './dto';
import * as svc from './service';

const searchQuery = z.object({ q: z.string().max(64).default(''), communityId: idSchema.optional() });

export function registerUserRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/me/bootstrap', async (request) => svc.bootstrap(ctx, requireAuth(request)));

  app.get('/api/users/search', async (request) => {
    const { user } = requireAuth(request);
    const q = parse(searchQuery, request.query);
    return { users: svc.searchUsers(ctx, user, q.q, q.communityId) };
  });

  app.get<{ Params: { username: string } }>('/api/users/:username', async (request) => {
    const { user } = requireAuth(request);
    return { profile: svc.getProfile(ctx, user, parse(usernameSchema, request.params.username)) };
  });

  app.patch('/api/me/profile', async (request) => {
    const { user } = requireAuth(request);
    return { user: toSelfUser(svc.updateProfile(ctx, user, parse(updateProfileSchema, request.body))) };
  });

  app.patch('/api/me/preferences', async (request) => {
    const { user } = requireAuth(request);
    return { user: toSelfUser(svc.updatePreferences(ctx, user, parse(updatePreferencesSchema, request.body))) };
  });

  app.post('/api/me/onboarding/complete', async (request) => {
    const { user } = requireAuth(request);
    return { user: toSelfUser(svc.completeOnboarding(ctx, user)) };
  });

  app.get('/api/me/blocks', async (request) => {
    const { user } = requireAuth(request);
    return { users: svc.listBlocked(ctx, user) };
  });

  app.put<{ Params: { id: string } }>('/api/users/:id/block', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.setBlocked(ctx, user, parse(idSchema, request.params.id), true);
    reply.status(204);
  });

  app.delete<{ Params: { id: string } }>('/api/users/:id/block', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.setBlocked(ctx, user, parse(idSchema, request.params.id), false);
    reply.status(204);
  });
}
