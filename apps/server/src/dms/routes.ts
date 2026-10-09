import type { FastifyInstance } from 'fastify';
import { addParticipantsSchema, createDmSchema, idSchema, updateGroupDmSchema } from '@creator-network/shared';
import { requireAuth } from '../auth/plugin';
import type { AppContext } from '../context';
import { rateLimit } from '../lib/http';
import { parse } from '../lib/validation';
import * as svc from './service';

type IdParams = { Params: { id: string } };

export function registerDmRoutes(app: FastifyInstance, ctx: AppContext): void {
  const m = ctx.config.rateLimitMultiplier;
  const id = (raw: string) => parse(idSchema, raw);

  app.get('/api/dms', async (request) => {
    const { user } = requireAuth(request);
    return { dms: svc.listDms(ctx, user) };
  });

  app.post('/api/dms', { config: rateLimit(30 * m, '1 hour') }, async (request) => {
    const { user } = requireAuth(request);
    const input = parse(createDmSchema, request.body);
    return { dm: svc.openDm(ctx, user, input.userIds, input.name) };
  });

  app.get<IdParams>('/api/dms/:id', async (request) => {
    const { user } = requireAuth(request);
    return { dm: svc.getDm(ctx, user, id(request.params.id)) };
  });

  app.patch<IdParams>('/api/dms/:id', async (request) => {
    const { user } = requireAuth(request);
    return { dm: svc.renameGroup(ctx, user, id(request.params.id), parse(updateGroupDmSchema, request.body).name) };
  });

  app.post<IdParams>('/api/dms/:id/participants', async (request) => {
    const { user } = requireAuth(request);
    return { dm: svc.addParticipants(ctx, user, id(request.params.id), parse(addParticipantsSchema, request.body).userIds) };
  });

  app.delete<{ Params: { id: string; userId: string } }>('/api/dms/:id/participants/:userId', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.removeParticipant(ctx, user, id(request.params.id), id(request.params.userId));
    reply.status(204);
  });
}
