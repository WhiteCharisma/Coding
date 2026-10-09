import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  changeEmailSchema,
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  idSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type PublicConfig,
  type SessionInfo,
} from '@creator-network/shared';
import { audit } from '../audit';
import type { AppContext } from '../context';
import { sessions } from '../db/schema';
import { notFound } from '../lib/errors';
import { rateLimit } from '../lib/http';
import { parse } from '../lib/validation';
import { toSelfUser } from '../users/dto';
import { clearSessionCookie, clientMeta, requireAuth, setSessionCookie } from './plugin';
import * as auth from './service';
import { createSession, revokeSession, revokeUserSessions } from './sessions';

export function publicConfig(ctx: AppContext): PublicConfig {
  const s = ctx.settings.get();
  return {
    instanceName: s.instanceName,
    welcomeMessage: s.welcomeMessage,
    registrationMode: s.registrationMode,
    emailEnabled: ctx.mailer.enabled,
    requireEmailVerification: s.requireEmailVerification && ctx.mailer.enabled,
    maxUploadMb: s.maxUploadMb,
    communityCreation: s.communityCreation,
    appealContact: s.appealContact,
    version: ctx.config.version,
    voice: {
      enabled: ctx.config.voice.enabled,
      maxParticipants: ctx.config.voice.maxParticipants,
      maxBitrate: ctx.config.voice.maxBitrate,
    },
  };
}

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  const m = ctx.config.rateLimitMultiplier;

  app.get('/api/config', async () => publicConfig(ctx));

  app.get('/api/auth/session', async (request) => {
    const { user } = requireAuth(request);
    return { user: toSelfUser(user) };
  });

  // Same as /api/auth/session but never 401: lets the app probe for a session on load
  // without a failed request in the browser console.
  app.get('/api/auth/state', async (request) => ({ user: request.auth ? toSelfUser(request.auth.user) : null }));

  app.post('/api/auth/register', { config: rateLimit(5 * m, '1 hour') }, async (request, reply) => {
    const input = parse(registerSchema, request.body);
    const user = await auth.register(ctx, input);
    const { token } = createSession(ctx, user.id, clientMeta(request));
    setSessionCookie(reply, ctx, token);
    reply.status(201);
    return { user: toSelfUser(user) };
  });

  app.post('/api/auth/login', { config: rateLimit(10 * m, '1 minute') }, async (request, reply) => {
    const input = parse(loginSchema, request.body);
    const { user } = await auth.login(ctx, input.login, input.password);
    const { token } = createSession(ctx, user.id, clientMeta(request));
    setSessionCookie(reply, ctx, token);
    return { user: toSelfUser(user) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.auth) revokeSession(ctx, request.auth.session.id);
    clearSessionCookie(reply, ctx);
    reply.status(204);
  });

  app.post('/api/auth/verify-email', { config: rateLimit(20 * m, '1 hour') }, async (request) => {
    const { token } = parse(verifyEmailSchema, request.body);
    const user = auth.verifyEmail(ctx, token);
    return { verified: true, userId: user.id };
  });

  app.post('/api/auth/verify-email/resend', { config: rateLimit(3 * m, '1 hour') }, async (request, reply) => {
    const { user } = requireAuth(request);
    if (user.emailVerifiedAt === null) await auth.sendVerificationEmail(ctx, user);
    reply.status(202);
    return { sent: user.emailVerifiedAt === null };
  });

  app.post('/api/auth/forgot-password', { config: rateLimit(5 * m, '1 hour') }, async (request, reply) => {
    const { email } = parse(forgotPasswordSchema, request.body);
    await auth.requestPasswordReset(ctx, email);
    reply.status(202);
    return { accepted: true };
  });

  app.post('/api/auth/reset-password', { config: rateLimit(10 * m, '1 hour') }, async (request, reply) => {
    const { token, password } = parse(resetPasswordSchema, request.body);
    const user = await auth.resetPassword(ctx, token, password);
    revokeUserSessions(ctx, user.id);
    clearSessionCookie(reply, ctx);
    reply.status(204);
  });

  app.get('/api/auth/sessions', async (request) => {
    const { user, session } = requireAuth(request);
    const rows = ctx.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id))
      .orderBy(desc(sessions.lastSeenAt))
      .all();
    const list: SessionInfo[] = rows.map((s) => ({
      id: s.id,
      current: s.id === session.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
    }));
    return { sessions: list };
  });

  app.delete<{ Params: { id: string } }>('/api/auth/sessions/:id', async (request, reply) => {
    const { user, session } = requireAuth(request);
    const id = parse(idSchema, request.params.id);
    const target = ctx.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, user.id)))
      .get();
    if (!target) throw notFound('Session not found.');
    revokeSession(ctx, id);
    if (id === session.id) clearSessionCookie(reply, ctx);
    reply.status(204);
  });

  app.post('/api/auth/sessions/revoke-others', async (request) => {
    const { user, session } = requireAuth(request);
    const revoked = revokeUserSessions(ctx, user.id, session.id);
    audit(ctx.db, {
      scope: 'platform',
      actorId: user.id,
      action: 'user.sessions_revoked',
      targetType: 'user',
      targetId: user.id,
      targetLabel: user.username,
      metadata: { revoked },
    });
    return { revoked };
  });

  app.post('/api/auth/change-password', { config: rateLimit(10 * m, '1 hour') }, async (request, reply) => {
    const { user, session } = requireAuth(request);
    const input = parse(changePasswordSchema, request.body);
    await auth.changePassword(ctx, user, input);
    revokeUserSessions(ctx, user.id, session.id);
    reply.status(204);
  });

  app.post('/api/auth/change-email', { config: rateLimit(10 * m, '1 hour') }, async (request) => {
    const { user } = requireAuth(request);
    const input = parse(changeEmailSchema, request.body);
    const updated = await auth.changeEmail(ctx, user, input);
    return { user: toSelfUser(updated) };
  });

  app.delete('/api/me', { config: rateLimit(5 * m, '1 hour') }, async (request, reply) => {
    const { user } = requireAuth(request);
    const input = parse(deleteAccountSchema, request.body);
    await auth.deleteAccount(ctx, user, input.password, input.deleteMessages);
    clearSessionCookie(reply, ctx);
    reply.status(204);
  });
}
