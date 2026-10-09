import type { FastifyInstance } from 'fastify';
import { createReportSchema } from '@creator-network/shared';
import { requireAuth } from '../auth/plugin';
import type { AppContext } from '../context';
import { rateLimit } from '../lib/http';
import { parse } from '../lib/validation';
import { createReport } from './service';

export function registerReportRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post(
    '/api/reports',
    { config: rateLimit(10 * ctx.config.rateLimitMultiplier, '1 hour') },
    async (request, reply) => {
      const { user } = requireAuth(request);
      const report = createReport(ctx, user, parse(createReportSchema, request.body));
      reply.status(201);
      return report;
    },
  );
}
