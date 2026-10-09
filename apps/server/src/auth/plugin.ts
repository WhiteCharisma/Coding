import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context';
import { forbidden, unauthorized } from '../lib/errors';
import { type AuthState, validateSessionToken } from './sessions';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthState | null;
  }
}

/** Header every state-changing API request must carry (custom-header CSRF defense). */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'CreatorNetwork';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function setSessionCookie(reply: FastifyReply, ctx: AppContext, token: string): void {
  reply.setCookie(ctx.config.sessionCookieName, token, {
    httpOnly: true,
    secure: ctx.config.secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(ctx.config.sessionTtlMs / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply, ctx: AppContext): void {
  reply.clearCookie(ctx.config.sessionCookieName, {
    httpOnly: true,
    secure: ctx.config.secureCookies,
    sameSite: 'lax',
    path: '/',
  });
}

/** Rejects cross-site state-changing requests. */
export function checkCsrf(ctx: AppContext, request: FastifyRequest): void {
  if (SAFE_METHODS.has(request.method)) return;
  if (request.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) {
    throw forbidden('This request was blocked for your protection. Reload the page and try again.', 'csrf_rejected');
  }
  const origin = request.headers.origin;
  if (origin !== undefined) {
    if (!ctx.config.allowedOrigins.includes(origin)) {
      throw forbidden('Cross-origin request rejected.', 'csrf_rejected');
    }
  } else {
    const site = request.headers['sec-fetch-site'];
    if (site !== undefined && site !== 'same-origin' && site !== 'none') {
      throw forbidden('Cross-site request rejected.', 'csrf_rejected');
    }
  }
}

export function registerAuthHooks(app: FastifyInstance, ctx: AppContext): void {
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    checkCsrf(ctx, request);
    const token = request.cookies[ctx.config.sessionCookieName];
    if (!token) return;
    const auth = validateSessionToken(ctx, token);
    if (auth) {
      request.auth = auth;
      if (auth.renewed) setSessionCookie(reply, ctx, token);
    } else {
      clearSessionCookie(reply, ctx);
    }
  });
}

export function requireAuth(request: FastifyRequest): AuthState {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

/** Platform staff check (moderator or admin). */
export function requireStaff(request: FastifyRequest, level: 'moderator' | 'admin' = 'moderator'): AuthState {
  const auth = requireAuth(request);
  const role = auth.user.platformRole;
  if (role === 'admin' || (level === 'moderator' && role === 'moderator')) return auth;
  throw forbidden();
}

/** Client info stored with a session (shown in the user's session list). */
export function clientMeta(request: FastifyRequest): { userAgent: string; ip: string } {
  return { userAgent: String(request.headers['user-agent'] ?? ''), ip: request.ip };
}
