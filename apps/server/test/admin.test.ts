import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '../src/db/schema';
import { createTestServer, nonce, tokenFromMail, type TestClient, type TestServer } from './helpers';

let srv: TestServer;
let admin: TestClient;
let mod: TestClient;
let alice: TestClient;
let bob: TestClient;
let community: any;
let general: any;

function setRole(userId: string, role: 'admin' | 'moderator' | 'member') {
  srv.ctx.db.update(users).set({ platformRole: role }).where(eq(users.id, userId)).run();
}

beforeAll(async () => {
  srv = await createTestServer();
  [admin, mod, alice, bob] = [srv.client(), srv.client(), srv.client(), srv.client()];
  await admin.register('rootadmin');
  await mod.register('modperson');
  await alice.register('alice');
  await bob.register('bob');
  // Equivalent to `cli create-admin` / `cli promote` — there is no HTTP path to become admin.
  setRole(admin.user.id, 'admin');
  setRole(mod.user.id, 'moderator');
  community = (await alice.post('/api/communities', { name: 'Report Hall' })).body.community;
  general = community.channels.find((c: any) => c.name === 'general');
  const inv = (await alice.post(`/api/communities/${community.id}/invites`, {})).body.invite;
  await bob.post(`/api/invites/${inv.code}/accept`);
});
afterAll(async () => {
  await srv.stop();
});

describe('admin access control', () => {
  it('blocks regular members from every admin endpoint', async () => {
    for (const url of [
      '/api/admin/overview',
      '/api/admin/users',
      '/api/admin/reports',
      '/api/admin/audit',
      '/api/admin/settings',
      '/api/admin/communities',
    ]) {
      expect((await alice.get(url)).status).toBe(403);
    }
    expect((await alice.post(`/api/admin/users/${bob.user.id}/suspend`, { reason: 'because', days: 1 })).status).toBe(
      403,
    );
    expect((await alice.put(`/api/admin/users/${alice.user.id}/role`, { role: 'admin' })).status).toBe(403);
    expect((await srv.client().get('/api/admin/overview')).status).toBe(401);
  });

  it('moderators can review but not change settings or roles', async () => {
    expect((await mod.get('/api/admin/overview')).status).toBe(200);
    expect((await mod.get('/api/admin/settings')).status).toBe(403);
    expect((await mod.put(`/api/admin/users/${bob.user.id}/role`, { role: 'moderator' })).status).toBe(403);
    expect(
      (await mod.post(`/api/admin/users/${admin.user.id}/suspend`, { reason: 'coup attempt', days: 1 })).status,
    ).toBe(403);
  });

  it('shows instance health and counts to admins', async () => {
    const res = await admin.get('/api/admin/overview');
    expect(res.status).toBe(200);
    expect(res.body.health.checks.database.ok).toBe(true);
    expect(res.body.counts.users).toBeGreaterThanOrEqual(4);
  });
});

describe('suspensions', () => {
  it('suspends a user, ends their sessions and explains why at login', async () => {
    const victim = srv.client();
    await victim.register('rulebreaker');
    srv.ctx.settings.update({ appealContact: 'appeals@example.com' }, null);
    expect(
      (await admin.post(`/api/admin/users/${victim.user.id}/suspend`, { reason: 'Repeated spam in #general', days: 7 }))
        .status,
    ).toBe(200);
    expect((await victim.get('/api/auth/session')).status).toBe(401);
    const login = await srv
      .client()
      .post('/api/auth/login', { login: 'rulebreaker', password: 'a-strong-test-passphrase' });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('account_suspended');
    expect(login.body.error.details.reason).toBe('Repeated spam in #general');
    expect(login.body.error.details.appealContact).toBe('appeals@example.com');
    // Wrong password does not reveal the suspension.
    const wrong = await srv.client().post('/api/auth/login', { login: 'rulebreaker', password: 'not-the-password' });
    expect(wrong.status).toBe(401);
    expect((await admin.post(`/api/admin/users/${victim.user.id}/restore`)).status).toBe(200);
    expect(
      (await srv.client().post('/api/auth/login', { login: 'rulebreaker', password: 'a-strong-test-passphrase' }))
        .status,
    ).toBe(200);
  });

  it('expired temporary suspensions lift automatically at login', async () => {
    const temp = srv.client();
    await temp.register('timeout.user');
    await admin.post(`/api/admin/users/${temp.user.id}/suspend`, { reason: 'Cool down', days: 1 });
    srv.ctx.db
      .update(users)
      .set({ suspendedUntil: Date.now() - 1000 })
      .where(eq(users.id, temp.user.id))
      .run();
    expect(
      (await srv.client().post('/api/auth/login', { login: 'timeout.user', password: 'a-strong-test-passphrase' }))
        .status,
    ).toBe(200);
  });
});

describe('platform roles', () => {
  it('admins can grant roles but never demote the last admin or themselves', async () => {
    expect(
      (await admin.put(`/api/admin/users/${bob.user.id}/role`, { role: 'moderator' })).body.user.platformRole,
    ).toBe('moderator');
    expect((await admin.put(`/api/admin/users/${admin.user.id}/role`, { role: 'member' })).status).toBe(400);
    const second = srv.client();
    await second.register('secondadmin');
    setRole(second.user.id, 'admin');
    expect((await second.put(`/api/admin/users/${admin.user.id}/role`, { role: 'member' })).status).toBe(200);
    expect((await second.put(`/api/admin/users/${bob.user.id}/role`, { role: 'member' })).status).toBe(200);
    setRole(admin.user.id, 'admin');
  });
});

describe('reports and moderation', () => {
  it('lets members report content they can see and staff resolve it', async () => {
    const msg = (
      await bob.post(`/api/channels/${general.id}/messages`, {
        content: 'buy followers at scam.example',
        nonce: nonce(),
      })
    ).body.message;
    const outsider = srv.client();
    await outsider.register('nosy');
    expect(
      (await outsider.post('/api/reports', { targetType: 'message', targetId: msg.id, reason: 'spam' })).status,
    ).toBe(404);
    const report = await alice.post('/api/reports', {
      targetType: 'message',
      targetId: msg.id,
      reason: 'spam',
      details: 'Obvious scam link',
    });
    expect(report.status).toBe(201);
    const again = await alice.post('/api/reports', { targetType: 'message', targetId: msg.id, reason: 'spam' });
    expect(again.body.id).toBe(report.body.id);

    const open = (await mod.get('/api/admin/reports?status=open')).body.reports;
    const r = open.find((x: any) => x.id === report.body.id);
    expect(r.snapshot.content).toBe('buy followers at scam.example');
    const resolved = await mod.post(`/api/admin/reports/${r.id}/resolve`, {
      status: 'resolved',
      action: 'delete_message',
      note: 'Scam link removed',
    });
    expect(resolved.status).toBe(200);
    expect((await bob.get(`/api/messages/${msg.id}`)).body.message.deletedAt).not.toBeNull();
    expect((await mod.post(`/api/admin/reports/${r.id}/resolve`, { status: 'dismissed' })).status).toBe(400);
    const notes = (await alice.get('/api/notifications')).body.notifications;
    expect(notes.some((n: any) => n.type === 'moderation' && n.data.event === 'report_reviewed')).toBe(true);
    const audit = (await admin.get('/api/admin/audit')).body.events;
    expect(audit.some((e: any) => e.action === 'report.resolved')).toBe(true);
    expect(JSON.stringify(audit)).not.toContain('buy followers');
  });

  it('cannot report yourself', async () => {
    expect(
      (await alice.post('/api/reports', { targetType: 'user', targetId: alice.user.id, reason: 'other' })).status,
    ).toBe(400);
  });
});

describe('admin tools', () => {
  it('generates a one-time password reset link for servers without email', async () => {
    const res = await admin.post(`/api/admin/users/${bob.user.id}/reset-link`);
    expect(res.body.link).toMatch(/\/reset-password\?token=/);
    const token = tokenFromMail(res.body.link);
    expect(
      (await srv.client().post('/api/auth/reset-password', { token, password: 'reset-by-admin-123' })).status,
    ).toBe(204);
    expect((await srv.client().post('/api/auth/login', { login: 'bob', password: 'reset-by-admin-123' })).status).toBe(
      200,
    );
  });

  it('updates instance settings and registration invites', async () => {
    const res = await admin.patch('/api/admin/settings', {
      registrationMode: 'invite',
      maxUploadMb: 10,
      instanceName: 'Beat Commons',
    });
    expect(res.body.config.registrationMode).toBe('invite');
    expect((await srv.client().get('/api/config')).body.instanceName).toBe('Beat Commons');
    const invite = (await admin.post('/api/admin/registration-invites', { maxUses: 1, note: 'for Dana' })).body.invite;
    const ok = await srv.client().post('/api/auth/register', {
      username: 'dana',
      email: 'dana@example.com',
      password: 'a-strong-test-passphrase',
      displayName: 'Dana',
      inviteCode: invite.code,
    });
    expect(ok.status).toBe(201);
    const reuse = await srv.client().post('/api/auth/register', {
      username: 'dana2',
      email: 'dana2@example.com',
      password: 'a-strong-test-passphrase',
      displayName: 'Dana',
      inviteCode: invite.code,
    });
    expect(reuse.status).toBe(403);
    await admin.patch('/api/admin/settings', { registrationMode: 'open' });
  });

  it('removes a community and notifies its owner', async () => {
    const doomed = (await alice.post('/api/communities', { name: 'Doomed' })).body.community;
    expect((await mod.del(`/api/admin/communities/${doomed.id}`, { reason: 'Terms violation' })).status).toBe(403);
    expect((await admin.del(`/api/admin/communities/${doomed.id}`, { reason: 'Terms violation' })).status).toBe(204);
    expect((await alice.get(`/api/communities/${doomed.id}`)).status).toBe(404);
    const notes = (await alice.get('/api/notifications')).body.notifications;
    expect(notes.some((n: any) => n.data.event === 'community_removed')).toBe(true);
  });
});
