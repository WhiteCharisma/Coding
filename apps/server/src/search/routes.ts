import type { FastifyInstance } from 'fastify';
import { searchQuerySchema } from '@creator-network/shared';
import { requireAuth } from '../auth/plugin';
import type { AppContext } from '../context';
import { rateLimit } from '../lib/http';
import { parse } from '../lib/validation';
import { searchMessages } from './service';

export function registerSearchRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/search/messages', { config: rateLimit(60 * ctx.config.rateLimitMultiplier, '1 minute') }, async (request) => {
    const { user } = requireAuth(request);
    return searchMessages(ctx, user, parse(searchQuerySchema, request.query));
  });
}
