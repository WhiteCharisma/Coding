import { io as ioClient } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { messages } from '../src/db/schema';
import { createTestServer, nextEvent, noEvent, nonce, ORIGIN, sendViaSocket, sleep, type TestClient, type TestServer } from './helpers';

let srv: TestServer;
let alice: TestClient;
let bob: TestClient;
let outsider: TestClient;
let community: any;
let general: any;

beforeAll(async () => {
  srv = await createTestServer();
  [alice, bob, outsider] = [srv.client(), srv.client(), srv.client()];
  await alice.register('alice');
  await bob.register('bob');
  await outsider.register('outsider');
  community = (await alice.post('/api/communities', { name: 'Live Room' })).body.community;
  general = community.channels.find((c: any) => c.name === 'general');
  const inv = (await alice.post(`/api/communities/${community.id}/invites`, {})).body.invite;
  await bob.post(`/api/invites/${inv.code}/accept`);
});
afterAll(async () => {
  for (const c of [alice, bob, outsider]) c.closeSockets();
  await srv.stop();
});

describe('socket authentication', () => {
  it('rejects connections without a valid session', async () => {
    const socket = ioClient(srv.url, { transports: ['websocket'], extraHeaders: { origin: ORIGIN }, reconnection: false, forceNew: true });
    const err = await new Promise<Error>((resolve) => socket.once('connect_error', resolve));
    expect(err.message).toBe('unauthorized');
    socket.disconnect();
  });

  it('rejects handshakes from foreign origins (cross-site WebSocket hijacking)', async () => {
    await expect(alice.socket({ origin: 'https://evil.example' })).rejects.toBeTruthy();
  });
});

describe('real-time delivery', () => {
  it('acknowledges after persisting and delivers to other members', async () => {
    const a = await alice.socket();
    const b = await bob.socket();
    const incoming = nextEvent(b, 'message:new', 3000, (m: any) => m.content === 'live from the booth');
    const ack = await sendViaSocket(a, { channelId: general.id, content: 'live from the booth', nonce: nonce() });
    expect(ack.ok).toBe(true);
    const row = srv.ctx.db.select().from(messages).where(eq(messages.id, ack.message.id)).get();
    expect(row?.content).toBe('live from the booth');
    const delivered = await incoming;
    expect(delivered.id).toBe(ack.message.id);
    a.disconnect();
    b.disconnect();
  });

  it('a retried send with the same nonce is acknowledged with the same message and broadcast once', async () => {
    const a = await alice.socket();
    const b = await bob.socket();
    const n = nonce();
    const received: any[] = [];
    b.on('message:new', (m: any) => {
      if (m.nonce === n) received.push(m);
    });
    const [first, second] = await Promise.all([
      sendViaSocket(a, { channelId: general.id, content: 'double tap', nonce: n }),
      sendViaSocket(a, { channelId: general.id, content: 'double tap', nonce: n }),
    ]);
    expect(first.ok && second.ok).toBe(true);
    expect(first.message.id).toBe(second.message.id);
    await sleep(300);
    expect(received).toHaveLength(1);
    expect(srv.ctx.db.select().from(messages).where(eq(messages.nonce, n)).all()).toHaveLength(1);
    a.disconnect();
    b.disconnect();
  });

  it('returns structured errors for invalid or unauthorized sends', async () => {
    const o = await outsider.socket();
    const forbidden = await sendViaSocket(o, { channelId: general.id, content: 'sneaking in', nonce: nonce() });
    expect(forbidden.ok).toBe(false);
    expect(forbidden.error.code).toBe('not_found');
    const invalid = await sendViaSocket(o, { channelId: 'not-an-id', content: 'x', nonce: nonce() });
    expect(invalid.error.code).toBe('validation_failed');
    o.disconnect();
  });

  it('never delivers community messages to non-members', async () => {
    const o = await outsider.socket();
    const quiet = noEvent(o, 'message:new', 500);
    await alice.post(`/api/channels/${general.id}/messages`, { content: 'members only news', nonce: nonce() });
    expect(await quiet).toBe(true);
    o.disconnect();
  });

  it('stops delivery immediately when access is revoked (kick)', async () => {
    const temp = srv.client();
    await temp.register('tempmember');
    const inv = (await alice.post(`/api/communities/${community.id}/invites`, {})).body.invite;
    await temp.post(`/api/invites/${inv.code}/accept`);
    const t = await temp.socket();
    const firstMsg = nextEvent(t, 'message:new', 3000, (m: any) => m.content === 'before kick');
    await alice.post(`/api/channels/${general.id}/messages`, { content: 'before kick', nonce: nonce() });
    await firstMsg;
    const removal = nextEvent(t, 'community:remove', 3000);
    await alice.post(`/api/communities/${community.id}/members/${temp.user.id}/kick`, {});
    expect((await removal).reason).toBe('kicked');
    const quiet = noEvent(t, 'message:new', 500);
    await alice.post(`/api/channels/${general.id}/messages`, { content: 'after kick', nonce: nonce() });
    expect(await quiet).toBe(true);
    temp.closeSockets();
  });

  it('private channel messages only reach members with access', async () => {
    const priv = (await alice.post(`/api/communities/${community.id}/channels`, { name: 'leads-only', isPrivate: true })).body.channel;
    const b = await bob.socket();
    const quiet = noEvent(b, 'message:new', 500, (m: any) => m.channelId === priv.id);
    await alice.post(`/api/channels/${priv.id}/messages`, { content: 'secret plans', nonce: nonce() });
    expect(await quiet).toBe(true);
    // Granting access joins the room without reconnecting.
    await alice.put(`/api/channels/${priv.id}/overwrites`, { targetType: 'member', targetId: bob.user.id, allow: 1, deny: 0 });
    const now = nextEvent(b, 'message:new', 3000, (m: any) => m.channelId === priv.id);
    await alice.post(`/api/channels/${priv.id}/messages`, { content: 'welcome in', nonce: nonce() });
    expect((await now).content).toBe('welcome in');
    b.disconnect();
  });

  it('broadcasts edits, deletes and reactions', async () => {
    const a = await alice.socket();
    const b = await bob.socket();
    const msg = (await alice.post(`/api/channels/${general.id}/messages`, { content: 'v1', nonce: nonce() })).body.message;
    const upd = nextEvent(b, 'message:update', 3000, (m: any) => m.id === msg.id);
    await alice.patch(`/api/messages/${msg.id}`, { content: 'v2' });
    expect((await upd).content).toBe('v2');
    const react = nextEvent(b, 'reaction:update', 3000, (r: any) => r.messageId === msg.id);
    await alice.put(`/api/messages/${msg.id}/reactions`, { emoji: '🎚️' });
    expect(await react).toMatchObject({ emoji: '🎚️', count: 1, added: true, userId: alice.user.id });
    const del = nextEvent(b, 'message:delete', 3000, (d: any) => d.id === msg.id);
    await alice.del(`/api/messages/${msg.id}`);
    expect((await del).channelId).toBe(general.id);
    a.disconnect();
    b.disconnect();
  });
});

describe('typing and presence', () => {
  it('relays typing indicators only within the channel room', async () => {
    const a = await alice.socket();
    const b = await bob.socket();
    const o = await outsider.socket();
    const typing = nextEvent(b, 'typing:start', 3000);
    const outsiderQuiet = noEvent(o, 'typing:start', 500);
    a.emit('typing:start', { channelId: general.id });
    expect(await typing).toMatchObject({ channelId: general.id, userId: alice.user.id });
    expect(await outsiderQuiet).toBe(true);
    // An outsider cannot inject typing events into a channel they cannot see.
    const injected = noEvent(b, 'typing:start', 500, (t: any) => t.userId === outsider.user.id);
    o.emit('typing:start', { channelId: general.id });
    expect(await injected).toBe(true);
    for (const s of [a, b, o]) s.disconnect();
  });

  it('reports presence for connected users', async () => {
    const a = await alice.socket();
    const b = await bob.socket();
    const statuses = await new Promise<any>((resolve) => b.emit('presence:query', { userIds: [alice.user.id, outsider.user.id] }, resolve));
    expect(statuses[alice.user.id]).toBe('online');
    expect(statuses[outsider.user.id]).toBe('offline');
    a.disconnect();
    b.disconnect();
  });
});

describe('reconnection and sessions', () => {
  it('recovers missed messages from persisted history without gaps or duplicates', async () => {
    const b = await bob.socket();
    const lastSeen = await new Promise<any>((resolve) => {
      b.once('message:new', resolve);
      void alice.post(`/api/channels/${general.id}/messages`, { content: 'last seen', nonce: nonce() });
    });
    b.disconnect();
    const missed: string[] = [];
    for (let i = 0; i < 3; i++) {
      missed.push((await alice.post(`/api/channels/${general.id}/messages`, { content: `missed ${i}`, nonce: nonce() })).body.message.id);
    }
    const b2 = await bob.socket();
    const catchUp = (await bob.get(`/api/channels/${general.id}/messages?after=${lastSeen.id}`)).body;
    expect(catchUp.messages.map((m: any) => m.id)).toEqual(missed);
    const live = nextEvent(b2, 'message:new', 3000, (m: any) => m.content === 'after reconnect');
    await alice.post(`/api/channels/${general.id}/messages`, { content: 'after reconnect', nonce: nonce() });
    expect((await live).content).toBe('after reconnect');
    b2.disconnect();
  });

  it('disconnects sockets when their session is revoked', async () => {
    const device = srv.client();
    await device.post('/api/auth/login', { login: 'bob', password: 'a-strong-test-passphrase' });
    const s = await device.socket();
    const sessionsList = (await bob.get('/api/auth/sessions')).body.sessions;
    const target = sessionsList.find((x: any) => !x.current);
    const revoked = nextEvent(s, 'session:revoked', 3000);
    const disconnected = new Promise((resolve) => s.once('disconnect', resolve));
    await bob.del(`/api/auth/sessions/${target.id}`);
    await revoked;
    await disconnected;
    expect(s.connected).toBe(false);
  });

  it('rate-limits message bursts on a socket', async () => {
    const a = await alice.socket();
    const results = await Promise.all(Array.from({ length: 16 }, (_, i) => sendViaSocket(a, { channelId: general.id, content: `burst ${i}`, nonce: nonce() })));
    const limited = results.filter((r) => !r.ok && r.error.code === 'rate_limited');
    expect(limited.length).toBeGreaterThan(0);
    expect(limited.every((r) => r.error.retryable)).toBe(true);
    a.disconnect();
  });
});
