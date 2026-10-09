import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Permission } from '@creator-network/shared';
import { invites } from '../src/db/schema';
import { createTestServer, nonce, type TestClient, type TestServer } from './helpers';

let srv: TestServer;
let owner: TestClient;
let member: TestClient;
let outsider: TestClient;
let community: any;

beforeAll(async () => {
  srv = await createTestServer();
  owner = srv.client();
  member = srv.client();
  outsider = srv.client();
  await owner.register('founder');
  await member.register('member');
  await outsider.register('outsider');
  community = (await owner.post('/api/communities', { name: 'Beat Lab', template: 'music-collective', visibility: 'private', description: 'A lab' })).body.community;
  const invite = (await owner.post(`/api/communities/${community.id}/invites`, { maxUses: null, expiresInHours: 24 })).body.invite;
  expect((await member.post(`/api/invites/${invite.code}/accept`)).status).toBe(200);
});
afterAll(async () => {
  await srv.stop();
});

const channelByName = (c: any, name: string) => c.channels.find((ch: any) => ch.name === name);

describe('community creation', () => {
  it('creates categories, channels and default roles from a template', () => {
    expect(community.categories.map((c: any) => c.name)).toEqual(['Start here', 'Studio', 'Showcase']);
    expect(community.channels.map((c: any) => c.name)).toContain('feedback-loop');
    expect(community.roles.map((r: any) => r.name)).toEqual(expect.arrayContaining(['@everyone', 'Moderator']));
    expect(community.myPermissions & Permission.ADMINISTRATOR).toBeTruthy();
  });

  it('marks announcement channels read-only for @everyone', async () => {
    const view = (await member.get(`/api/communities/${community.id}`)).body.community;
    const ann = channelByName(view, 'announcements');
    expect(ann.myPermissions & Permission.SEND_MESSAGES).toBe(0);
    const send = await member.post(`/api/channels/${ann.id}/messages`, { content: 'hi', nonce: nonce() });
    expect(send.status).toBe(403);
    expect((await owner.post(`/api/channels/${ann.id}/messages`, { content: 'Welcome', nonce: nonce() })).status).toBe(201);
  });
});

describe('visibility and membership', () => {
  it('hides private communities and their channels from non-members (404, not 403)', async () => {
    expect((await outsider.get(`/api/communities/${community.id}`)).status).toBe(404);
    expect((await outsider.get(`/api/communities/${community.id}/members`)).status).toBe(404);
    const general = channelByName(community, 'general');
    expect((await outsider.get(`/api/channels/${general.id}/messages`)).status).toBe(404);
    expect((await outsider.post(`/api/channels/${general.id}/messages`, { content: 'let me in', nonce: nonce() })).status).toBe(404);
    expect((await outsider.post(`/api/communities/${community.id}/join`)).status).toBe(404);
  });

  it('lists only public communities in explore', async () => {
    await owner.post('/api/communities', { name: 'Open Mic', visibility: 'public', tags: ['music'] });
    const list = (await outsider.get('/api/communities/explore')).body.communities.map((c: any) => c.name);
    expect(list).toContain('Open Mic');
    expect(list).not.toContain('Beat Lab');
  });

  it('lets anyone join a public community without an invite', async () => {
    const pub = (await owner.post('/api/communities', { name: 'Public Square', visibility: 'public' })).body.community;
    const joined = await outsider.post(`/api/communities/${pub.id}/join`);
    expect(joined.status).toBe(200);
    expect(joined.body.community.memberCount).toBe(2);
  });

  it('owners cannot leave; members can', async () => {
    expect((await owner.post(`/api/communities/${community.id}/leave`)).status).toBe(400);
    const c = srv.client();
    await c.register('drifter');
    const inv = (await owner.post(`/api/communities/${community.id}/invites`, {})).body.invite;
    await c.post(`/api/invites/${inv.code}/accept`);
    expect((await c.post(`/api/communities/${community.id}/leave`)).status).toBe(204);
    expect((await c.get(`/api/communities/${community.id}`)).status).toBe(404);
  });
});

describe('invitations', () => {
  it('previews an invite without signing in, and enforces max uses', async () => {
    const inv = (await owner.post(`/api/communities/${community.id}/invites`, { maxUses: 1, expiresInHours: 1 })).body.invite;
    const anonymous = srv.client();
    const preview = await anonymous.get(`/api/invites/${inv.code}`);
    expect(preview.status).toBe(200);
    expect(preview.body.invite.community.name).toBe('Beat Lab');
    const first = srv.client();
    await first.register('firstuse');
    expect((await first.post(`/api/invites/${inv.code}/accept`)).status).toBe(200);
    const second = srv.client();
    await second.register('seconduse');
    const denied = await second.post(`/api/invites/${inv.code}/accept`);
    expect(denied.status).toBe(404);
    expect(denied.body.error.code).toBe('invite_invalid');
  });

  it('rejects expired and revoked invites', async () => {
    const inv = (await owner.post(`/api/communities/${community.id}/invites`, { expiresInHours: 1 })).body.invite;
    srv.ctx.db.update(invites).set({ expiresAt: Date.now() - 1 }).where(eq(invites.code, inv.code)).run();
    expect((await outsider.post(`/api/invites/${inv.code}/accept`)).status).toBe(404);
    const inv2 = (await owner.post(`/api/communities/${community.id}/invites`, {})).body.invite;
    expect((await owner.del(`/api/invites/${inv2.code}`)).status).toBe(204);
    expect((await outsider.post(`/api/invites/${inv2.code}/accept`)).status).toBe(404);
  });

  it('direct invitations can only be redeemed by the invited user and notify them', async () => {
    const target = srv.client();
    await target.register('invitee');
    const inv = (await owner.post(`/api/communities/${community.id}/invites`, { targetUsername: 'invitee' })).body.invite;
    expect((await outsider.post(`/api/invites/${inv.code}/accept`)).status).toBe(404);
    const notes = (await target.get('/api/notifications')).body.notifications;
    expect(notes.some((n: any) => n.type === 'invite' && n.data.code === inv.code)).toBe(true);
    expect((await target.post(`/api/invites/${inv.code}/accept`)).status).toBe(200);
  });

  it('members without CREATE_INVITES cannot create invites', async () => {
    const roles = (await owner.get(`/api/communities/${community.id}/roles`)).body.roles;
    const everyone = roles.find((r: any) => r.isDefault);
    await owner.patch(`/api/roles/${everyone.id}`, { permissions: everyone.permissions & ~Permission.CREATE_INVITES });
    expect((await member.post(`/api/communities/${community.id}/invites`, {})).status).toBe(403);
    await owner.patch(`/api/roles/${everyone.id}`, { permissions: everyone.permissions });
  });
});

describe('channels and permission overwrites', () => {
  it('only members with MANAGE_CHANNELS can create channels', async () => {
    expect((await member.post(`/api/communities/${community.id}/channels`, { name: 'hacked' })).status).toBe(403);
    expect((await owner.post(`/api/communities/${community.id}/channels`, { name: 'Mix Notes' })).body.channel.name).toBe('mix-notes');
  });

  it('private channels are invisible to members without access', async () => {
    const priv = (await owner.post(`/api/communities/${community.id}/channels`, { name: 'staff-room', isPrivate: true })).body.channel;
    expect(priv.isPrivate).toBe(true);
    const view = (await member.get(`/api/communities/${community.id}`)).body.community;
    expect(channelByName(view, 'staff-room')).toBeUndefined();
    expect((await member.get(`/api/channels/${priv.id}/messages`)).status).toBe(404);
    expect((await member.get(`/api/channels/${priv.id}/pins`)).status).toBe(404);
    const search = await member.get(`/api/search/messages?q=x&channelId=${priv.id}`);
    expect(search.body.results).toEqual([]);

    // Grant access through a role.
    const role = (await owner.post(`/api/communities/${community.id}/roles`, { name: 'Staff' })).body.role;
    await owner.put(`/api/channels/${priv.id}/privacy`, { isPrivate: true, allowedRoleIds: [role.id] });
    await owner.put(`/api/communities/${community.id}/members/${member.user.id}/roles`, { roleIds: [role.id] });
    expect((await member.get(`/api/channels/${priv.id}/messages`)).status).toBe(200);
    await owner.put(`/api/communities/${community.id}/members/${member.user.id}/roles`, { roleIds: [] });
    expect((await member.get(`/api/channels/${priv.id}/messages`)).status).toBe(404);
  });

  it('a member-specific deny overwrite removes access', async () => {
    const ch = (await owner.post(`/api/communities/${community.id}/channels`, { name: 'quiet-corner' })).body.channel;
    expect((await member.get(`/api/channels/${ch.id}/messages`)).status).toBe(200);
    expect((await owner.put(`/api/channels/${ch.id}/overwrites`, { targetType: 'member', targetId: member.user.id, allow: 0, deny: Permission.VIEW_CHANNEL })).status).toBe(204);
    expect((await member.get(`/api/channels/${ch.id}/messages`)).status).toBe(404);
  });

  it('rejects overwrites containing non-channel permissions', async () => {
    const ch = channelByName(community, 'general');
    const res = await owner.put(`/api/channels/${ch.id}/overwrites`, { targetType: 'role', targetId: community.everyoneRoleId, allow: Permission.ADMINISTRATOR, deny: 0 });
    expect(res.status).toBe(400);
  });
});

describe('roles and hierarchy', () => {
  let modClient: TestClient;
  let mod2Client: TestClient;
  let modRole: any;

  beforeAll(async () => {
    modClient = srv.client();
    mod2Client = srv.client();
    await modClient.register('moddy');
    await mod2Client.register('moddytwo');
    for (const c of [modClient, mod2Client]) {
      const inv = (await owner.post(`/api/communities/${community.id}/invites`, {})).body.invite;
      await c.post(`/api/invites/${inv.code}/accept`);
    }
    modRole = (await owner.get(`/api/communities/${community.id}/roles`)).body.roles.find((r: any) => r.name === 'Moderator');
    await owner.put(`/api/communities/${community.id}/members/${modClient.user.id}/roles`, { roleIds: [modRole.id] });
    await owner.put(`/api/communities/${community.id}/members/${mod2Client.user.id}/roles`, { roleIds: [modRole.id] });
  });

  it('members cannot change their own or others’ roles', async () => {
    expect((await member.put(`/api/communities/${community.id}/members/${member.user.id}/roles`, { roleIds: [modRole.id] })).status).toBe(403);
    expect((await member.post(`/api/communities/${community.id}/roles`, { name: 'Boss', permissions: Permission.ADMINISTRATOR })).status).toBe(403);
  });

  it('a role manager cannot grant permissions they lack or touch roles at/above their own', async () => {
    const managerRole = (await owner.post(`/api/communities/${community.id}/roles`, { name: 'Role Manager', permissions: Permission.MANAGE_ROLES })).body.role;
    // Move it above Moderator so the manager outranks moderators.
    await owner.post(`/api/roles/${managerRole.id}/move`, { direction: 'up' });
    await owner.post(`/api/roles/${managerRole.id}/move`, { direction: 'up' });
    const manager = srv.client();
    await manager.register('rolemanager');
    const inv = (await owner.post(`/api/communities/${community.id}/invites`, {})).body.invite;
    await manager.post(`/api/invites/${inv.code}/accept`);
    await owner.put(`/api/communities/${community.id}/members/${manager.user.id}/roles`, { roleIds: [managerRole.id] });

    const escalate = await manager.post(`/api/communities/${community.id}/roles`, { name: 'Super', permissions: Permission.ADMINISTRATOR });
    expect(escalate.status).toBe(403);
    const editOwn = await manager.patch(`/api/roles/${managerRole.id}`, { permissions: Permission.MANAGE_ROLES | Permission.BAN_MEMBERS });
    expect(editOwn.status).toBe(403);
    const self = await manager.put(`/api/communities/${community.id}/members/${manager.user.id}/roles`, { roleIds: [managerRole.id, modRole.id] });
    expect(self.status).toBe(403);
    const ok = await manager.post(`/api/communities/${community.id}/roles`, { name: 'Helper', permissions: Permission.MANAGE_ROLES });
    expect(ok.status).toBe(201);
  });

  it('moderators can kick members but not the owner or equal-ranked moderators', async () => {
    const victim = srv.client();
    await victim.register('kickable');
    const inv = (await owner.post(`/api/communities/${community.id}/invites`, {})).body.invite;
    await victim.post(`/api/invites/${inv.code}/accept`);
    expect((await modClient.post(`/api/communities/${community.id}/members/${owner.user.id}/kick`, {})).status).toBe(403);
    expect((await modClient.post(`/api/communities/${community.id}/members/${mod2Client.user.id}/kick`, {})).status).toBe(403);
    expect((await member.post(`/api/communities/${community.id}/members/${victim.user.id}/kick`, {})).status).toBe(403);
    expect((await modClient.post(`/api/communities/${community.id}/members/${victim.user.id}/kick`, { reason: 'spam' })).status).toBe(204);
    expect((await victim.get(`/api/communities/${community.id}`)).status).toBe(404);
    const audit = (await owner.get(`/api/communities/${community.id}/audit`)).body.events;
    expect(audit.some((e: any) => e.action === 'member.kicked' && e.targetId === victim.user.id && e.reason === 'spam')).toBe(true);
    expect((await member.get(`/api/communities/${community.id}/audit`)).status).toBe(403);
  });

  it('banned users are removed and cannot rejoin until unbanned', async () => {
    const troll = srv.client();
    await troll.register('trolly');
    const inv = (await owner.post(`/api/communities/${community.id}/invites`, { maxUses: null })).body.invite;
    await troll.post(`/api/invites/${inv.code}/accept`);
    expect((await modClient.post(`/api/communities/${community.id}/bans/${troll.user.id}`, { reason: 'harassment' })).status).toBe(204);
    expect((await troll.get(`/api/communities/${community.id}`)).status).toBe(404);
    const rejoin = await troll.post(`/api/invites/${inv.code}/accept`);
    expect(rejoin.status).toBe(403);
    expect(rejoin.body.error.code).toBe('banned');
    expect((await modClient.del(`/api/communities/${community.id}/bans/${troll.user.id}`)).status).toBe(204);
    expect((await troll.post(`/api/invites/${inv.code}/accept`)).status).toBe(200);
  });
});

describe('ownership', () => {
  it('only the owner can transfer ownership, with password confirmation', async () => {
    const c = (await owner.post('/api/communities', { name: 'Handover' })).body.community;
    const heir = srv.client();
    await heir.register('heir');
    const inv = (await owner.post(`/api/communities/${c.id}/invites`, {})).body.invite;
    await heir.post(`/api/invites/${inv.code}/accept`);
    expect((await heir.post(`/api/communities/${c.id}/transfer`, { userId: heir.user.id, password: 'a-strong-test-passphrase' })).status).toBe(403);
    expect((await owner.post(`/api/communities/${c.id}/transfer`, { userId: heir.user.id, password: 'wrong-password' })).status).toBe(400);
    expect((await owner.post(`/api/communities/${c.id}/transfer`, { userId: heir.user.id, password: 'a-strong-test-passphrase' })).status).toBe(200);
    const view = (await heir.get(`/api/communities/${c.id}`)).body.community;
    expect(view.ownerId).toBe(heir.user.id);
    expect((await owner.del(`/api/communities/${c.id}`, { password: 'a-strong-test-passphrase', confirmName: 'Handover' })).status).toBe(403);
    expect((await heir.del(`/api/communities/${c.id}`, { password: 'a-strong-test-passphrase', confirmName: 'Wrong' })).status).toBe(400);
    expect((await heir.del(`/api/communities/${c.id}`, { password: 'a-strong-test-passphrase', confirmName: 'Handover' })).status).toBe(204);
    expect((await heir.get(`/api/communities/${c.id}`)).status).toBe(404);
  });
});
