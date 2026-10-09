import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  COMMUNITY_TAGS,
  channelOverwriteSchema,
  createCategorySchema,
  createChannelSchema,
  createCommunitySchema,
  createInviteSchema,
  createRoleSchema,
  deleteCommunitySchema,
  idSchema,
  moderationReasonSchema,
  moveRoleSchema,
  setMemberRolesSchema,
  transferOwnershipSchema,
  updateCategorySchema,
  updateChannelSchema,
  updateCommunitySchema,
  updateRoleSchema,
} from '@creator-network/shared';
import { requireAuth } from '../auth/plugin';
import type { AppContext } from '../context';
import { rateLimit } from '../lib/http';
import { parse } from '../lib/validation';
import * as svc from './service';

type IdParams = { Params: { id: string } };
type MemberParams = { Params: { id: string; userId: string } };

const exploreQuery = z.object({
  q: z.string().trim().max(60).optional(),
  tag: z.enum(COMMUNITY_TAGS).optional(),
});
const inviteCodeSchema = z.string().regex(/^[A-Za-z0-9]{6,32}$/);
const privacySchema = z.object({ isPrivate: z.boolean(), allowedRoleIds: z.array(idSchema).max(50).default([]) });
const auditQuery = z.object({ before: z.coerce.number().int().positive().optional() });

export function registerCommunityRoutes(app: FastifyInstance, ctx: AppContext): void {
  const m = ctx.config.rateLimitMultiplier;
  const id = (raw: string) => parse(idSchema, raw);

  app.get('/api/communities/explore', async (request) => {
    requireAuth(request);
    const q = parse(exploreQuery, request.query);
    return { communities: svc.exploreCommunities(ctx, { ...q, limit: 60 }) };
  });

  app.post('/api/communities', { config: rateLimit(10 * m, '1 hour') }, async (request, reply) => {
    const { user } = requireAuth(request);
    const community = svc.createCommunity(ctx, user, parse(createCommunitySchema, request.body));
    reply.status(201);
    return { community };
  });

  app.get<IdParams>('/api/communities/:id', async (request) => {
    const { user } = requireAuth(request);
    return { community: svc.getCommunityForUser(ctx, id(request.params.id), user.id) };
  });

  app.patch<IdParams>('/api/communities/:id', async (request) => {
    const { user } = requireAuth(request);
    return {
      community: svc.updateCommunity(ctx, user, id(request.params.id), parse(updateCommunitySchema, request.body)),
    };
  });

  app.delete<IdParams>('/api/communities/:id', async (request, reply) => {
    const { user } = requireAuth(request);
    const input = parse(deleteCommunitySchema, request.body);
    await svc.deleteCommunity(ctx, user, id(request.params.id), input.password, input.confirmName);
    reply.status(204);
  });

  app.post<IdParams>('/api/communities/:id/join', { config: rateLimit(30 * m, '1 minute') }, async (request) => {
    const { user } = requireAuth(request);
    return { community: svc.joinPublicCommunity(ctx, user, id(request.params.id)) };
  });

  app.post<IdParams>('/api/communities/:id/leave', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.leaveCommunity(ctx, user, id(request.params.id));
    reply.status(204);
  });

  app.get<IdParams>('/api/communities/:id/members', async (request) => {
    const { user } = requireAuth(request);
    return { members: svc.listMembers(ctx, user, id(request.params.id)) };
  });

  app.put<MemberParams>('/api/communities/:id/members/:userId/roles', async (request) => {
    const { user } = requireAuth(request);
    const { roleIds } = parse(setMemberRolesSchema, request.body);
    return { roleIds: svc.setMemberRoles(ctx, user, id(request.params.id), id(request.params.userId), roleIds) };
  });

  app.post<MemberParams>('/api/communities/:id/members/:userId/kick', async (request, reply) => {
    const { user } = requireAuth(request);
    const { reason } = parse(moderationReasonSchema, request.body);
    svc.kickMember(ctx, user, id(request.params.id), id(request.params.userId), reason);
    reply.status(204);
  });

  app.get<IdParams>('/api/communities/:id/bans', async (request) => {
    const { user } = requireAuth(request);
    return { bans: svc.listBans(ctx, user, id(request.params.id)) };
  });

  app.post<MemberParams>('/api/communities/:id/bans/:userId', async (request, reply) => {
    const { user } = requireAuth(request);
    const { reason } = parse(moderationReasonSchema, request.body);
    svc.banMember(ctx, user, id(request.params.id), id(request.params.userId), reason);
    reply.status(204);
  });

  app.delete<MemberParams>('/api/communities/:id/bans/:userId', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.unbanMember(ctx, user, id(request.params.id), id(request.params.userId));
    reply.status(204);
  });

  app.post<IdParams>('/api/communities/:id/transfer', { config: rateLimit(5 * m, '1 hour') }, async (request) => {
    const { user } = requireAuth(request);
    const input = parse(transferOwnershipSchema, request.body);
    return { community: await svc.transferOwnership(ctx, user, id(request.params.id), input.userId, input.password) };
  });

  /* Roles */
  app.get<IdParams>('/api/communities/:id/roles', async (request) => {
    const { user } = requireAuth(request);
    return { roles: svc.listRoles(ctx, user, id(request.params.id)) };
  });
  app.post<IdParams>('/api/communities/:id/roles', async (request, reply) => {
    const { user } = requireAuth(request);
    const role = svc.createRole(ctx, user, id(request.params.id), parse(createRoleSchema, request.body));
    reply.status(201);
    return { role };
  });
  app.patch<IdParams>('/api/roles/:id', async (request) => {
    const { user } = requireAuth(request);
    return { role: svc.updateRole(ctx, user, id(request.params.id), parse(updateRoleSchema, request.body)) };
  });
  app.post<IdParams>('/api/roles/:id/move', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.moveRole(ctx, user, id(request.params.id), parse(moveRoleSchema, request.body).direction);
    reply.status(204);
  });
  app.delete<IdParams>('/api/roles/:id', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.deleteRole(ctx, user, id(request.params.id));
    reply.status(204);
  });

  /* Categories */
  app.post<IdParams>('/api/communities/:id/categories', async (request, reply) => {
    const { user } = requireAuth(request);
    const category = svc.createCategory(
      ctx,
      user,
      id(request.params.id),
      parse(createCategorySchema, request.body).name,
    );
    reply.status(201);
    return { category };
  });
  app.patch<IdParams>('/api/categories/:id', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.updateCategory(ctx, user, id(request.params.id), parse(updateCategorySchema, request.body));
    reply.status(204);
  });
  app.delete<IdParams>('/api/categories/:id', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.deleteCategory(ctx, user, id(request.params.id));
    reply.status(204);
  });

  /* Channels */
  app.post<IdParams>('/api/communities/:id/channels', async (request, reply) => {
    const { user } = requireAuth(request);
    const channel = svc.createChannel(ctx, user, id(request.params.id), parse(createChannelSchema, request.body));
    reply.status(201);
    return { channel };
  });
  app.patch<IdParams>('/api/channels/:id', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.updateChannel(ctx, user, id(request.params.id), parse(updateChannelSchema, request.body));
    reply.status(204);
  });
  app.delete<IdParams>('/api/channels/:id', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.deleteChannel(ctx, user, id(request.params.id));
    reply.status(204);
  });
  app.get<IdParams>('/api/channels/:id/overwrites', async (request) => {
    const { user } = requireAuth(request);
    return { overwrites: svc.listChannelOverwrites(ctx, user, id(request.params.id)) };
  });
  app.put<IdParams>('/api/channels/:id/overwrites', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.setChannelOverwrite(ctx, user, id(request.params.id), parse(channelOverwriteSchema, request.body));
    reply.status(204);
  });
  app.put<IdParams>('/api/channels/:id/privacy', async (request, reply) => {
    const { user } = requireAuth(request);
    const input = parse(privacySchema, request.body);
    svc.setChannelPrivacy(ctx, user, id(request.params.id), input.isPrivate, input.allowedRoleIds);
    reply.status(204);
  });

  /* Invites */
  app.get<IdParams>('/api/communities/:id/invites', async (request) => {
    const { user } = requireAuth(request);
    return { invites: svc.listInvites(ctx, user, id(request.params.id)) };
  });
  app.post<IdParams>(
    '/api/communities/:id/invites',
    { config: rateLimit(30 * m, '1 hour') },
    async (request, reply) => {
      const { user } = requireAuth(request);
      const invite = svc.createInvite(ctx, user, id(request.params.id), parse(createInviteSchema, request.body));
      reply.status(201);
      return { invite };
    },
  );
  app.delete<{ Params: { code: string } }>('/api/invites/:code', async (request, reply) => {
    const { user } = requireAuth(request);
    svc.revokeInvite(ctx, user, parse(inviteCodeSchema, request.params.code));
    reply.status(204);
  });
  // Public preview so people arriving from an invite link see what they are joining.
  app.get<{ Params: { code: string } }>(
    '/api/invites/:code',
    { config: rateLimit(30 * m, '1 minute') },
    async (request) => {
      const code = parse(inviteCodeSchema, request.params.code);
      return { invite: svc.previewInvite(ctx, code, request.auth?.user.id ?? null) };
    },
  );
  app.post<{ Params: { code: string } }>(
    '/api/invites/:code/accept',
    { config: rateLimit(20 * m, '1 minute') },
    async (request) => {
      const { user } = requireAuth(request);
      return { community: svc.acceptInvite(ctx, user, parse(inviteCodeSchema, request.params.code)) };
    },
  );

  app.get<IdParams>('/api/communities/:id/audit', async (request) => {
    const { user } = requireAuth(request);
    const { before } = parse(auditQuery, request.query);
    return { events: svc.listCommunityAudit(ctx, user, id(request.params.id), before) };
  });
}
