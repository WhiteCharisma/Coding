import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestServer, nextEvent, noEvent, nonce, sendViaSocket, type TestClient, type TestServer } from './helpers';

let srv: TestServer;
let alice: TestClient;
let bob: TestClient;
let carol: TestClient;
let eve: TestClient;

beforeAll(async () => {
  srv = await createTestServer();
  [alice, bob, carol, eve] = [srv.client(), srv.client(), srv.client(), srv.client()];
  await alice.register('alice');
  await bob.register('bob');
  await carol.register('carol');
  await eve.register('eve');
});
afterAll(async () => {
  for (const c of [alice, bob, carol, eve]) c.closeSockets();
  await srv.stop();
});

describe('direct messages', () => {
  it('opens one conversation per pair and delivers only to participants', async () => {
    const dm = (await alice.post('/api/dms', { userIds: [bob.user.id] })).body.dm;
    const again = (await bob.post('/api/dms', { userIds: [alice.user.id] })).body.dm;
    expect(again.id).toBe(dm.id);
    expect(dm.kind).toBe('dm');

    const b = await bob.socket();
    const e = await eve.socket();
    const a = await alice.socket();
    const incoming = nextEvent(b, 'message:new', 3000, (m: any) => m.channelId === dm.id);
    const eveQuiet = noEvent(e, 'message:new', 500);
    const ack = await sendViaSocket(a, { channelId: dm.id, content: 'can you master my EP?', nonce: nonce() });
    expect(ack.ok).toBe(true);
    expect((await incoming).content).toBe('can you master my EP?');
    expect(await eveQuiet).toBe(true);

    // Eve cannot read, post, react to or subscribe to the conversation.
    expect((await eve.get(`/api/channels/${dm.id}/messages`)).status).toBe(404);
    expect((await eve.get(`/api/dms/${dm.id}`)).status).toBe(404);
    expect((await eve.post(`/api/channels/${dm.id}/messages`, { content: 'hi', nonce: nonce() })).status).toBe(404);
    expect((await eve.put(`/api/messages/${ack.message.id}/reactions`, { emoji: '👀' })).status).toBe(404);
    expect((await eve.get(`/api/messages/${ack.message.id}`)).status).toBe(404);
    const evesSearch = (await eve.get('/api/search/messages?q=master')).body.results;
    expect(evesSearch).toEqual([]);
    for (const s of [a, b, e]) s.disconnect();
  });

  it('aggregates DM notifications per conversation and clears them on read', async () => {
    const dm = (await carol.post('/api/dms', { userIds: [bob.user.id] })).body.dm;
    let last = '';
    for (let i = 0; i < 3; i++) last = (await carol.post(`/api/channels/${dm.id}/messages`, { content: `ping ${i}`, nonce: nonce() })).body.message.id;
    const notes = (await bob.get('/api/notifications?unread=1')).body.notifications.filter((n: any) => n.type === 'dm' && n.channelId === dm.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].count).toBe(3);
    await bob.post(`/api/channels/${dm.id}/read`, { messageId: last });
    const after = (await bob.get('/api/notifications?unread=1')).body.notifications.filter((n: any) => n.channelId === dm.id);
    expect(after).toHaveLength(0);
  });

  it('blocking makes the conversation read-only and prevents new DMs', async () => {
    const dm = (await alice.post('/api/dms', { userIds: [carol.user.id] })).body.dm;
    expect((await carol.put(`/api/users/${alice.user.id}/block`)).status).toBe(204);
    const send = await alice.post(`/api/channels/${dm.id}/messages`, { content: 'hello?', nonce: nonce() });
    expect(send.status).toBe(403);
    expect(send.body.error.code).toBe('dm_unavailable');
    expect((await carol.post(`/api/channels/${dm.id}/messages`, { content: 'nope', nonce: nonce() })).status).toBe(403);
    expect((await alice.get(`/api/channels/${dm.id}/messages`)).status).toBe(200);
    const blocks = (await carol.get('/api/me/blocks')).body.users.map((u: any) => u.id);
    expect(blocks).toContain(alice.user.id);
    expect((await carol.del(`/api/users/${alice.user.id}/block`)).status).toBe(204);
    expect((await alice.post(`/api/channels/${dm.id}/messages`, { content: 'hello again', nonce: nonce() })).status).toBe(201);
  });

  it('respects the recipient’s DM policy', async () => {
    await eve.patch('/api/me/preferences', { dmPolicy: 'nobody' });
    const res = await alice.post('/api/dms', { userIds: [eve.user.id] });
    expect(res.status).toBe(403);
    await eve.patch('/api/me/preferences', { dmPolicy: 'communities' });
    expect((await alice.post('/api/dms', { userIds: [eve.user.id] })).status).toBe(403);
    const c = (await alice.post('/api/communities', { name: 'Shared Space', visibility: 'public' })).body.community;
    await eve.post(`/api/communities/${c.id}/join`);
    expect((await alice.post('/api/dms', { userIds: [eve.user.id] })).status).toBe(200);
  });
});

describe('group conversations', () => {
  it('supports naming, adding and removing participants', async () => {
    const g = (await alice.post('/api/dms', { userIds: [bob.user.id, carol.user.id], name: 'EP crew' })).body.dm;
    expect(g.kind).toBe('group_dm');
    expect(g.participants).toHaveLength(3);
    expect((await bob.patch(`/api/dms/${g.id}`, { name: 'EP crew 🎛️' })).body.dm.name).toBe('EP crew 🎛️');
    expect((await bob.del(`/api/dms/${g.id}/participants/${carol.user.id}`)).status).toBe(403); // only the owner removes others
    expect((await alice.del(`/api/dms/${g.id}/participants/${carol.user.id}`)).status).toBe(204);
    expect((await carol.get(`/api/channels/${g.id}/messages`)).status).toBe(404);
    // Eve only accepts DMs from people in her communities (set above) — adding her to a group respects that.
    expect((await bob.post(`/api/dms/${g.id}/participants`, { userIds: [eve.user.id] })).status).toBe(403);
    await eve.patch('/api/me/preferences', { dmPolicy: 'everyone' });
    const added = (await bob.post(`/api/dms/${g.id}/participants`, { userIds: [eve.user.id] })).body.dm;
    expect(added.participants.map((p: any) => p.username)).toContain('eve');
    expect((await bob.del(`/api/dms/${g.id}/participants/${bob.user.id}`)).status).toBe(204); // leaving
    expect((await bob.get(`/api/dms/${g.id}`)).status).toBe(404);
  });
});
