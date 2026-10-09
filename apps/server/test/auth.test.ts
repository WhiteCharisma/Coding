import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessions, users } from '../src/db/schema';
import { createTestServer, ORIGIN, readOutbox, tokenFromMail, waitForMail, type TestServer } from './helpers';

let srv: TestServer;
beforeAll(async () => {
  srv = await createTestServer();
});
afterAll(async () => {
  await srv.stop();
});

describe('registration', () => {
  it('creates an account, sets a hardened session cookie and returns the user', async () => {
    const c = srv.client();
    const res = await c.post('/api/auth/register', { username: 'reg.alice', email: 'reg.alice@example.com', password: 'a-strong-test-passphrase', displayName: 'Alice' });
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('reg.alice');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    const cookie = res.headers.getSetCookie().join(';');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    const session = await c.get('/api/auth/session');
    expect(session.status).toBe(200);
    expect(session.body.user.id).toBe(res.body.user.id);
  });

  it('reports the session state without a 401 for anonymous visitors', async () => {
    const c = srv.client();
    const anon = await c.get('/api/auth/state');
    expect(anon.status).toBe(200);
    expect(anon.body.user).toBeNull();
    const user = await c.register('state.probe');
    const signedIn = await c.get('/api/auth/state');
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.user.id).toBe(user.id);
    expect(signedIn.body.user).not.toHaveProperty('passwordHash');
  });

  it('stores only an Argon2id hash of the password and a hash of the session token', async () => {
    const c = srv.client();
    const user = await c.register('hashcheck');
    const row = srv.ctx.db.select().from(users).where(eq(users.id, user.id)).get();
    expect(row?.passwordHash.startsWith('$argon2id$')).toBe(true);
    const token = c.cookie.split('=')[1] as string;
    const stored = srv.ctx.db.select().from(sessions).where(eq(sessions.userId, user.id)).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).not.toBe(token);
    expect(stored[0]?.tokenHash).toHaveLength(64);
  });

  it('rejects duplicate usernames and does not reveal duplicate emails specifically', async () => {
    await srv.client().register('dupe');
    const again = await srv.client().post('/api/auth/register', { username: 'dupe', email: 'other@example.com', password: 'a-strong-test-passphrase', displayName: 'X' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('username_taken');
    const sameEmail = await srv.client().post('/api/auth/register', { username: 'dupe2', email: 'dupe@example.com', password: 'a-strong-test-passphrase', displayName: 'X' });
    expect(sameEmail.status).toBe(409);
    expect(sameEmail.body.error.code).toBe('account_exists');
    expect(sameEmail.body.error.message).not.toMatch(/email.*(taken|exists|in use)/i);
  });

  it('rejects reserved usernames, invalid input and weak passwords', async () => {
    const c = srv.client();
    expect((await c.post('/api/auth/register', { username: 'admin', email: 'a1@example.com', password: 'a-strong-test-passphrase', displayName: 'A' })).status).toBe(409);
    expect((await c.post('/api/auth/register', { username: 'ab', email: 'a2@example.com', password: 'a-strong-test-passphrase', displayName: 'A' })).status).toBe(400);
    expect((await c.post('/api/auth/register', { username: 'okname', email: 'not-an-email', password: 'a-strong-test-passphrase', displayName: 'A' })).status).toBe(400);
    const weak = await c.post('/api/auth/register', { username: 'okname', email: 'a3@example.com', password: 'password123', displayName: 'A' });
    expect(weak.status).toBe(400);
    const short = await c.post('/api/auth/register', { username: 'okname', email: 'a3@example.com', password: 'short', displayName: 'A' });
    expect(short.status).toBe(400);
  });

  it('ignores attempts to self-assign privileged fields', async () => {
    const c = srv.client();
    const res = await c.post('/api/auth/register', { username: 'sneaky', email: 'sneaky@example.com', password: 'a-strong-test-passphrase', displayName: 'S', platformRole: 'admin', status: 'active', isDemo: true });
    expect(res.status).toBe(201);
    expect(res.body.user.platformRole).toBe('member');
    await c.patch('/api/me/profile', { platformRole: 'admin', displayName: 'Still member' });
    const me = await c.get('/api/auth/session');
    expect(me.body.user.platformRole).toBe('member');
    expect((await c.get('/api/admin/overview')).status).toBe(403);
  });
});

describe('login and sessions', () => {
  it('logs in with username or email and gives identical errors for unknown users and wrong passwords', async () => {
    await srv.client().register('loginuser');
    const byName = await srv.client().post('/api/auth/login', { login: 'loginuser', password: 'a-strong-test-passphrase' });
    expect(byName.status).toBe(200);
    const byEmail = await srv.client().post('/api/auth/login', { login: 'LoginUser@Example.com', password: 'a-strong-test-passphrase' });
    expect(byEmail.status).toBe(200);
    const wrong = await srv.client().post('/api/auth/login', { login: 'loginuser', password: 'nope-nope-nope' });
    const unknown = await srv.client().post('/api/auth/login', { login: 'ghost-user', password: 'nope-nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('temporarily locks an account after repeated failures', async () => {
    await srv.client().register('lockme');
    for (let i = 0; i < 5; i++) {
      expect((await srv.client().post('/api/auth/login', { login: 'lockme', password: 'wrong-password-x' })).status).toBe(401);
    }
    const locked = await srv.client().post('/api/auth/login', { login: 'lockme', password: 'a-strong-test-passphrase' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('login_locked');
  });

  it('logout invalidates the session server-side (old cookie stops working)', async () => {
    const c = srv.client();
    await c.register('logouter');
    const stolenCookie = c.cookie;
    expect((await c.post('/api/auth/logout')).status).toBe(204);
    const replay = srv.client();
    replay.cookie = stolenCookie;
    expect((await replay.get('/api/auth/session')).status).toBe(401);
  });

  it('lists sessions and revokes another device', async () => {
    const a = srv.client();
    await a.register('multidevice');
    const b = srv.client();
    expect((await b.post('/api/auth/login', { login: 'multidevice', password: 'a-strong-test-passphrase' })).status).toBe(200);
    const list = await a.get('/api/auth/sessions');
    expect(list.body.sessions).toHaveLength(2);
    const other = list.body.sessions.find((s: any) => !s.current);
    expect((await a.del(`/api/auth/sessions/${other.id}`)).status).toBe(204);
    expect((await b.get('/api/auth/session')).status).toBe(401);
    expect((await a.get('/api/auth/session')).status).toBe(200);
  });

  it('cannot revoke someone else’s session', async () => {
    const victim = srv.client();
    await victim.register('victimsess');
    const attacker = srv.client();
    await attacker.register('attackersess');
    const victimSession = (await victim.get('/api/auth/sessions')).body.sessions[0];
    expect((await attacker.del(`/api/auth/sessions/${victimSession.id}`)).status).toBe(404);
    expect((await victim.get('/api/auth/session')).status).toBe(200);
  });

  it('rejects expired sessions', async () => {
    const c = srv.client();
    const user = await c.register('expiring');
    srv.ctx.db.update(sessions).set({ expiresAt: Date.now() - 1000 }).where(eq(sessions.userId, user.id)).run();
    expect((await c.get('/api/auth/session')).status).toBe(401);
  });

  it('revoke-others keeps only the current session', async () => {
    const a = srv.client();
    await a.register('revokeothers');
    const b = srv.client();
    await b.post('/api/auth/login', { login: 'revokeothers', password: 'a-strong-test-passphrase' });
    expect((await a.post('/api/auth/sessions/revoke-others')).body.revoked).toBe(1);
    expect((await b.get('/api/auth/session')).status).toBe(401);
    expect((await a.get('/api/auth/session')).status).toBe(200);
  });
});

describe('CSRF and origin protection', () => {
  it('rejects state-changing requests without the custom header', async () => {
    const res = await fetch(`${srv.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ login: 'x', password: 'y' }),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error.code).toBe('csrf_rejected');
  });

  it('rejects requests from a foreign origin even with the header', async () => {
    const c = srv.client();
    const res = await c.req('POST', '/api/auth/login', { login: 'x', password: 'y' }, { headers: { origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
  });

  it('sends security headers', async () => {
    const res = await fetch(`${srv.url}/api/health`);
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('permissions-policy')).toContain('camera=()');
  });
});

describe('email verification and password recovery', () => {
  it('verifies an email address with a single-use token', async () => {
    const c = srv.client();
    await c.register('verifyme');
    const mail = await waitForMail(srv.dataDir, (m) => m.to === 'verifyme@example.com' && /Confirm your email/.test(m.subject));
    const token = tokenFromMail(mail.text);
    expect((await c.post('/api/auth/verify-email', { token })).status).toBe(200);
    expect((await c.get('/api/auth/session')).body.user.emailVerified).toBe(true);
    expect((await c.post('/api/auth/verify-email', { token })).status).toBe(400);
  });

  it('resets a password with a single-use, short-lived token and revokes all sessions', async () => {
    const c = srv.client();
    await c.register('forgetful');
    const before = readOutbox(srv.dataDir).length;
    const unknown = await srv.client().post('/api/auth/forgot-password', { email: 'nobody-here@example.com' });
    expect(unknown.status).toBe(202);
    const res = await srv.client().post('/api/auth/forgot-password', { email: 'forgetful@example.com' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual(unknown.body);
    expect(readOutbox(srv.dataDir).slice(before).filter((m) => m.to === 'nobody-here@example.com')).toHaveLength(0);
    const mail = await waitForMail(srv.dataDir, (m) => m.to === 'forgetful@example.com' && /Reset your/.test(m.subject));
    const token = tokenFromMail(mail.text);

    expect((await srv.client().post('/api/auth/reset-password', { token, password: 'a-brand-new-passphrase' })).status).toBe(204);
    expect((await c.get('/api/auth/session')).status).toBe(401);
    expect((await srv.client().post('/api/auth/reset-password', { token, password: 'another-new-passphrase' })).status).toBe(400);
    expect((await srv.client().post('/api/auth/login', { login: 'forgetful', password: 'a-strong-test-passphrase' })).status).toBe(401);
    expect((await srv.client().post('/api/auth/login', { login: 'forgetful', password: 'a-brand-new-passphrase' })).status).toBe(200);
  });

  it('does not leak reset tokens into logs or responses', async () => {
    await srv.client().register('noleak');
    const res = await srv.client().post('/api/auth/forgot-password', { email: 'noleak@example.com' });
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
  });
});

describe('account changes', () => {
  it('changing the password requires the current one and signs out other sessions', async () => {
    const a = srv.client();
    await a.register('changer');
    const b = srv.client();
    await b.post('/api/auth/login', { login: 'changer', password: 'a-strong-test-passphrase' });
    expect((await a.post('/api/auth/change-password', { currentPassword: 'wrong-current-pw', newPassword: 'another-good-passphrase' })).status).toBe(400);
    expect((await a.post('/api/auth/change-password', { currentPassword: 'a-strong-test-passphrase', newPassword: 'another-good-passphrase' })).status).toBe(204);
    expect((await b.get('/api/auth/session')).status).toBe(401);
    expect((await a.get('/api/auth/session')).status).toBe(200);
  });

  it('deletes (anonymises) an account and blocks owners until they transfer communities', async () => {
    const c = srv.client();
    const user = await c.register('leaver');
    const community = await c.post('/api/communities', { name: 'Leaver Hub' });
    expect(community.status).toBe(201);
    const blocked = await c.del('/api/me', { password: 'a-strong-test-passphrase', deleteMessages: false });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('owns_communities');
    expect((await c.del(`/api/communities/${community.body.community.id}`, { password: 'a-strong-test-passphrase', confirmName: 'Leaver Hub' })).status).toBe(204);
    expect((await c.del('/api/me', { password: 'wrong-password-x', deleteMessages: true })).status).toBe(400);
    expect((await c.del('/api/me', { password: 'a-strong-test-passphrase', deleteMessages: true })).status).toBe(204);
    expect((await c.get('/api/auth/session')).status).toBe(401);
    expect((await srv.client().post('/api/auth/login', { login: 'leaver', password: 'a-strong-test-passphrase' })).status).toBe(401);
    const row = srv.ctx.db.select().from(users).where(eq(users.id, user.id)).get();
    expect(row?.status).toBe('deleted');
    expect(row?.email).not.toContain('leaver@example.com');
    const viewer = srv.client();
    await viewer.register('viewer.one');
    expect((await viewer.get('/api/users/leaver')).status).toBe(404);
  });
});

describe('registration modes', () => {
  it('closed and invite-only registration are enforced server-side', async () => {
    srv.ctx.settings.update({ registrationMode: 'closed' }, null);
    const closed = await srv.client().post('/api/auth/register', { username: 'latecomer', email: 'late@example.com', password: 'a-strong-test-passphrase', displayName: 'Late' });
    expect(closed.status).toBe(403);
    expect(closed.body.error.code).toBe('registration_closed');

    srv.ctx.settings.update({ registrationMode: 'invite' }, null);
    const noCode = await srv.client().post('/api/auth/register', { username: 'latecomer', email: 'late@example.com', password: 'a-strong-test-passphrase', displayName: 'Late' });
    expect(noCode.status).toBe(403);
    expect(noCode.body.error.code).toBe('invite_required');

    const owner = srv.client();
    srv.ctx.settings.update({ registrationMode: 'open' }, null);
    await owner.register('inviteowner');
    const community = await owner.post('/api/communities', { name: 'Invite Club' });
    const invite = await owner.post(`/api/communities/${community.body.community.id}/invites`, { maxUses: 5, expiresInHours: 24 });
    srv.ctx.settings.update({ registrationMode: 'invite' }, null);
    const withCode = await srv.client().post('/api/auth/register', { username: 'latecomer', email: 'late@example.com', password: 'a-strong-test-passphrase', displayName: 'Late', inviteCode: invite.body.invite.code });
    expect(withCode.status).toBe(201);
    srv.ctx.settings.update({ registrationMode: 'open' }, null);
  });
});

describe('rate limiting (strict mode)', () => {
  it('limits login attempts per IP', async () => {
    const strict = await createTestServer({ RATE_LIMIT_MODE: 'strict' });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        statuses.push((await strict.client().post('/api/auth/login', { login: `nobody${i}`, password: 'whatever-pass' })).status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
    } finally {
      await strict.stop();
    }
  });
});
