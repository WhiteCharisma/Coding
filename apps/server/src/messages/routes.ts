import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  editMessageSchema,
  historyQuerySchema,
  idSchema,
  isEmoji,
  reactionSchema,
  readStateSchema,
  sendMessageSchema,
} from '@creator-network/shared';
import { requireAuth } from '../auth/plugin';
import type { AppContext } from '../context';
import { rateLimit } from '../lib/http';
import { parse } from '../lib/validation';
import * as svc from './service';

type IdParams = { Params: { id: string } };
const emojiQuery = z.object({ emoji: z.string().refine(isEmoji, { error: 'Reactions must be a single emoji' }) });

export function registerMessageRoutes(app: FastifyInstance, ctx: AppContext): void {
  const m = ctx.config.rateLimitMultiplier;
  const id = (raw: string) => parse(idSchema, raw);

  app.get<IdParams>('/api/channels/:id/messages', async (request) => {
    const { user } = requireAuth(request);
    return svc.getHistory(ctx, user, id(request.params.id), parse(historyQuerySchema, request.query));
  });

  // REST equivalent of the `message:send` socket event (same validation, idempotency and broadcast).
  app.post<IdParams>('/api/channels/:id/messages', { config: rateLimit(30 * m, '10 seconds') }, async (request, reply) => {
    const { user } = requireAuth(request);
    const result = svc.sendMessage(ctx, user, id(request.params.id), parse(sendMessageSchema, request.body));
    reply.status(result.created ? 201 : 200);
    return { message: result.message };
  });

  app.get<IdParams>('/api/messages/:id', async (request) => {
    const { user } = requireAuth(request);
    return { message: svc.getMessageForUser(ctx, user, id(request.params.id)) };
  });

  app.patch<IdParams>('/api/messages/:id', { config: rateLimit(30 * m, '10 seconds') }, async (request) => {
    const { user } = requireAuth(request);
    const { content } = parse(editMessageSchema, request.body);
    return { message: svc.editMessage(ctx, user, id(request.params.id), content) };
  });

  app.delete<IdParams>('/api/messages/:id', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.deleteMessage(ctx, user, id(request.params.id));
    reply.status(204);
  });

  app.put<IdParams>('/api/messages/:id/reactions', { config: rateLimit(60 * m, '10 seconds') }, async (request) => {
    const { user } = requireAuth(request);
    const { emoji } = parse(reactionSchema, request.body);
    return svc.setReaction(ctx, user, id(request.params.id), emoji, true);
  });

  app.delete<IdParams>('/api/messages/:id/reactions', { config: rateLimit(60 * m, '10 seconds') }, async (request) => {
    const { user } = requireAuth(request);
    const { emoji } = parse(emojiQuery, request.query);
    return svc.setReaction(ctx, user, id(request.params.id), emoji, false);
  });

  app.put<IdParams>('/api/messages/:id/pin', async (request) => {
    const { user } = requireAuth(request);
    return { message: svc.setPinned(ctx, user, id(request.params.id), true) };
  });

  app.delete<IdParams>('/api/messages/:id/pin', async (request) => {
    const { user } = requireAuth(request);
    return { message: svc.setPinned(ctx, user, id(request.params.id), false) };
  });

  app.get<IdParams>('/api/channels/:id/pins', async (request) => {
    const { user } = requireAuth(request);
    return { messages: svc.listPins(ctx, user, id(request.params.id)) };
  });

  app.post<IdParams>('/api/channels/:id/read', async (request) => {
    const { user } = requireAuth(request);
    const { messageId } = parse(readStateSchema, request.body);
    return { lastReadId: svc.markRead(ctx, user, id(request.params.id), messageId) };
  });
}
