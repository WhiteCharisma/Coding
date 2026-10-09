import { createHmac } from 'node:crypto';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientToServerEvents, ServerToClientEvents, VoiceJoinAck } from '@creator-network/shared';
import { loadConfig } from '../src/config';
import { createTestServer, nextEvent, noEvent, type TestClient, type TestServer } from './helpers';

type S = Socket<ServerToClientEvents, ClientToServerEvents>;

let srv: TestServer;
let alice: TestClient;
let bob: TestClient;
let carol: TestClient;
let outsider: TestClient;
let community: any;
let general: any;
let lobby: any;

const join = (socket: S, channelId: string, resumePeerId?: string) =>
  new Promise<VoiceJoinAck>((resolve) => socket.emit('voice:join', { channelId, resumePeerId }, resolve));
const ok = (ack: VoiceJoinAck) => {
  if (!ack.ok) throw new Error(`join failed: ${ack.error.code}`);
  return ack;
};
const sdp = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';

beforeAll(async () => {
  srv = await createTestServer({
    VOICE_MAX_PARTICIPANTS: '3',
    VOICE_STUN_URLS: 'stun:turn.example.test:3478',
    VOICE_TURN_URLS: 'turn:turn.example.test:3478?transport=udp,turns:turn.example.test:5349',
    VOICE_TURN_SECRET: 'test-only-turn-secret-0123456789',
  });
  [alice, bob, carol, outsider] = [srv.client(), srv.client(), srv.client(), srv.client()];
  await alice.register('alice');
  await bob.register('bob');
  await carol.register('carol');
  await outsider.register('outsider');
  community = (await alice.post('/api/communities', { name: 'Voice Lab' })).body.community;
  general = community.channels.find((c: any) => c.name === 'general');
  lobby = (await alice.post(`/api/communities/${community.id}/channels`, { name: 'lobby' })).body.channel;
  const inv = (await alice.post(`/api/communities/${community.id}/invites`, {})).body.invite;
  await bob.post(`/api/invites/${inv.code}/accept`);
  await carol.post(`/api/invites/${inv.code}/accept`);
});
afterAll(async () => {
  for (const c of [alice, bob, carol, outsider]) c.closeSockets();
  await srv.stop();
});

describe('voice configuration', () => {
  const base = { NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:5173' } as const;
  it('treats empty voice lines in .env as unset, and checks what is set', () => {
    const config = loadConfig({ ...base, VOICE_STUN_URLS: '', VOICE_TURN_URLS: '', VOICE_TURN_SECRET: '' });
    expect(config.voice).toMatchObject({
      enabled: true,
      stunUrls: [],
      turnUrls: [],
      turnSecret: null,
      maxBitrate: 320_000,
    });
    expect(() => loadConfig({ ...base, VOICE_TURN_URLS: 'turn:t.example:3478' })).toThrow(/VOICE_TURN_SECRET/);
    expect(() => loadConfig({ ...base, VOICE_TURN_SECRET: 'short' })).toThrow(/16 characters/);
    expect(() => loadConfig({ ...base, VOICE_STUN_URLS: 'http://not-stun' })).toThrow(/stun:/);
  });
});

describe('voice rooms', () => {
  it('members join; people who cannot see the channel get "not found"', async () => {
    const [a, b, o] = [await alice.socket(), await bob.socket(), await outsider.socket()];
    const denied = await join(o, general.id);
    expect(denied).toMatchObject({ ok: false, error: { code: 'not_found' } });

    const seen = nextEvent(b, 'voice:room', 3000, (r: any) => r.channelId === general.id && r.peers.length === 1);
    const first = ok(await join(a, general.id));
    expect(first.room.peers.map((p) => p.user.username)).toEqual(['alice']);
    expect((await seen).peers[0].user.username).toBe('alice'); // the sidebar of others updates too

    const second = ok(await join(b, general.id));
    expect(second.room.peers.map((p) => p.user.username)).toEqual(['alice', 'bob']);
    expect(second.maxBitrate).toBe(320_000);
    // An outsider cannot list it either.
    const rooms = await new Promise<any[]>((resolve) => o.emit('voice:rooms', {}, resolve));
    expect(rooms).toEqual([]);
    const visible = await new Promise<any[]>((resolve) => a.emit('voice:rooms', {}, resolve));
    expect(visible.map((r) => r.channelId)).toEqual([general.id]);

    a.emit('voice:leave', { channelId: general.id });
    b.emit('voice:leave', { channelId: general.id });
    await nextEvent(a, 'voice:room', 3000, (r: any) => r.channelId === general.id && r.peers.length === 0);
    alice.closeSockets();
    bob.closeSockets();
    outsider.closeSockets();
  });

  it('relays signals only between members of the same room', async () => {
    const [a, b, c] = [await alice.socket(), await bob.socket(), await carol.socket()];
    const pa = ok(await join(a, general.id)).peerId;
    const pb = ok(await join(b, general.id)).peerId;
    ok(await join(c, lobby.id)); // another room

    const got = nextEvent(b, 'voice:signal');
    a.emit('voice:signal', { channelId: general.id, to: pb, signal: { description: { type: 'offer', sdp } } });
    expect(await got).toEqual({ channelId: general.id, from: pa, signal: { description: { type: 'offer', sdp } } });

    // Carol is in another room: she cannot reach Bob, even with his peer id.
    const leak = noEvent(b, 'voice:signal');
    c.emit('voice:signal', { channelId: general.id, to: pb, signal: { candidate: null } });
    c.emit('voice:signal', { channelId: lobby.id, to: pb, signal: { candidate: null } });
    expect(await leak).toBe(true);

    // Malformed or oversized signals are dropped.
    const junk = noEvent(b, 'voice:signal');
    a.emit('voice:signal', {
      channelId: general.id,
      to: pb,
      signal: { description: { type: 'offer', sdp: 'x'.repeat(40_000) } },
    });
    a.emit('voice:signal', {
      channelId: general.id,
      to: pb,
      signal: { description: { type: 'offer', sdp }, extra: 1 },
    } as any);
    a.emit('voice:signal', { channelId: general.id, to: pb, signal: { candidate: { candidate: 'a'.repeat(5000) } } });
    expect(await junk).toBe(true);
    a.emit('voice:leave', { channelId: general.id });
    b.emit('voice:leave', { channelId: general.id });
    c.emit('voice:leave', { channelId: lobby.id });
    await nextEvent(a, 'voice:room', 3000, (r: any) => r.channelId === general.id && r.peers.length === 0);
    for (const client of [alice, bob, carol]) client.closeSockets();
  });

  it('keeps one voice session per account: joining on another device ends the first', async () => {
    const [phone, laptop] = [await alice.socket(), await alice.socket()];
    ok(await join(phone, general.id));
    const ended = nextEvent(phone, 'voice:ended');
    const second = ok(await join(laptop, lobby.id));
    expect(await ended).toEqual({ channelId: general.id, reason: 'elsewhere' });
    expect(second.room.peers).toHaveLength(1);
    laptop.emit('voice:leave', { channelId: lobby.id });
    alice.closeSockets();
  });

  it('resumes the same session after a dropped connection (within the grace period)', async () => {
    const a1 = await alice.socket();
    const b = await bob.socket();
    const first = ok(await join(a1, general.id));
    ok(await join(b, general.id));
    const dropped = nextEvent(b, 'voice:room', 3000, (r: any) => r.peers.some((p: any) => !p.connected));
    a1.disconnect();
    expect((await dropped).peers.find((p: any) => p.peerId === first.peerId).connected).toBe(false);

    const a2 = await alice.socket();
    const back = nextEvent(b, 'voice:room', 3000, (r: any) => r.peers.every((p: any) => p.connected));
    const resumed = ok(await join(a2, general.id, first.peerId));
    expect(resumed).toMatchObject({ resumed: true, peerId: first.peerId });
    await back;
    // Someone else's peer id cannot be taken over.
    const pb = (await new Promise<any[]>((r) => b.emit('voice:rooms', {}, r)))[0].peers.find(
      (p: any) => p.user.username === 'bob',
    ).peerId;
    const c = await carol.socket();
    const hijack = ok(await join(c, general.id, pb));
    expect(hijack.peerId).not.toBe(pb);
    for (const client of [alice, bob, carol]) client.closeSockets();
  });

  it('ends the session of someone who loses access (kicked)', async () => {
    const a = await alice.socket();
    const c = await carol.socket();
    ok(await join(a, lobby.id));
    ok(await join(c, lobby.id));
    const ended = nextEvent(c, 'voice:ended');
    const gone = nextEvent(a, 'voice:room', 3000, (r: any) => r.channelId === lobby.id && r.peers.length === 1);
    expect((await alice.post(`/api/communities/${community.id}/members/${carol.user.id}/kick`, {})).status).toBe(204);
    expect(await ended).toEqual({ channelId: lobby.id, reason: 'removed' });
    expect((await gone).peers.map((p: any) => p.user.username)).toEqual(['alice']);
    alice.closeSockets();
    carol.closeSockets();
  });

  it('hands out STUN and short-lived TURN credentials, never the secret; rooms have a size limit', async () => {
    const sockets = [await alice.socket(), await bob.socket(), await outsider.socket()];
    const ack = ok(await join(sockets[0]!, general.id));
    expect(ack.iceServers[0]).toEqual({ urls: ['stun:turn.example.test:3478'] });
    const turn = ack.iceServers[1]!;
    expect(turn.urls).toEqual(['turn:turn.example.test:3478?transport=udp', 'turns:turn.example.test:5349']);
    const [expiry, userId] = turn.username!.split(':');
    expect(userId).toBe(alice.user.id);
    expect(Number(expiry) - Date.now() / 1000).toBeGreaterThan(11 * 3600);
    expect(turn.credential).toBe(
      createHmac('sha1', 'test-only-turn-secret-0123456789').update(turn.username!).digest('base64'),
    );
    expect(JSON.stringify(ack)).not.toContain('test-only-turn-secret');

    // Capacity (3 in this test server): fill the room and try one more.
    const dave = srv.client();
    await dave.register('dave');
    const inv = (await alice.post(`/api/communities/${community.id}/invites`, {})).body.invite;
    await dave.post(`/api/invites/${inv.code}/accept`);
    const eve = srv.client();
    await eve.register('eve');
    await eve.post(`/api/invites/${inv.code}/accept`);
    ok(await join(sockets[1]!, general.id));
    ok(await join(await dave.socket(), general.id));
    expect(await join(await eve.socket(), general.id)).toMatchObject({ ok: false, error: { code: 'room_full' } });
    for (const client of [alice, bob, outsider, dave, eve]) client.closeSockets();
  });

  it('refuses everything when voice is turned off', async () => {
    const off = await createTestServer({ VOICE_ENABLED: 'false' });
    const u = off.client();
    await u.register('solo');
    const c = (await u.post('/api/communities', { name: 'Quiet' })).body.community;
    const ack = await join(await u.socket(), c.channels[0].id);
    expect(ack).toMatchObject({ ok: false, error: { code: 'voice_disabled' } });
    u.closeSockets();
    await off.stop();
  });
});
