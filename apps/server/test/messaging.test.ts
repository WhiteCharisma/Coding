import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Permission } from '@creator-network/shared';
import { messages } from '../src/db/schema';
import { createTestServer, nonce, type TestClient, type TestServer } from './helpers';

let srv: TestServer;
let alice: TestClient;
let bob: TestClient;
let carol: TestClient; // member without access to some things
let outsider: TestClient;
let community: any;
let general: any;

beforeAll(async () => {
  srv = await createTestServer();
  [alice, bob, carol, outsider] = [srv.client(), srv.client(), srv.client(), srv.client()];
  await alice.register('alice');
  await bob.register('bob');
  await carol.register('carol');
  await outsider.register('outsider');
  community = (await alice.post('/api/communities', { name: 'Studio A', visibility: 'private' })).body.community;
  general = community.channels.find((c: any) => c.name === 'general');
  const inv = (await alice.post(`/api/communities/${community.id}/invites`, {})).body.invite;
  await bob.post(`/api/invites/${inv.code}/accept`);
  await carol.post(`/api/invites/${inv.code}/accept`);
});
afterAll(async () => {
  await srv.stop();
});

const send = (c: TestClient, channelId: string, content: string, extra: Record<string, unknown> = {}) =>
  c.post(`/api/channels/${channelId}/messages`, { content, nonce: nonce(), ...extra });

describe('sending and history', () => {
  it('persists messages with server-generated ids and returns them in history', async () => {
    const res = await send(alice, general.id, 'First take of the bassline 🎸');
    expect(res.status).toBe(201);
    expect(res.body.message.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(res.body.message.author.username).toBe('alice');
    const history = await bob.get(`/api/channels/${general.id}/messages`);
    expect(history.body.messages.at(-1).content).toBe('First take of the bassline 🎸');
  });

  it('is idempotent: retrying with the same nonce never duplicates', async () => {
    const n = nonce();
    const first = await alice.post(`/api/channels/${general.id}/messages`, { content: 'retry me', nonce: n });
    const retry = await alice.post(`/api/channels/${general.id}/messages`, { content: 'retry me', nonce: n });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.message.id).toBe(first.body.message.id);
    const rows = srv.ctx.db.select().from(messages).where(eq(messages.nonce, n)).all();
    expect(rows).toHaveLength(1);
  });

  it('rejects reusing a nonce in another channel', async () => {
    const other = (await alice.post(`/api/communities/${community.id}/channels`, { name: 'nonce-test' })).body.channel;
    const n = nonce();
    await alice.post(`/api/channels/${general.id}/messages`, { content: 'a', nonce: n });
    expect((await alice.post(`/api/channels/${other.id}/messages`, { content: 'b', nonce: n })).status).toBe(409);
  });

  it('validates content', async () => {
    expect((await send(alice, general.id, '   ')).status).toBe(400);
    expect((await send(alice, general.id, 'x'.repeat(4001))).status).toBe(400);
    expect((await alice.post(`/api/channels/${general.id}/messages`, { content: 'no nonce' })).status).toBe(400);
  });

  it('paginates history backwards, forwards and around a message', async () => {
    const ch = (await alice.post(`/api/communities/${community.id}/channels`, { name: 'paging' })).body.channel;
    const ids: string[] = [];
    for (let i = 0; i < 120; i++) ids.push((await send(alice, ch.id, `message ${i}`)).body.message.id);
    const latest = (await bob.get(`/api/channels/${ch.id}/messages`)).body;
    expect(latest.messages).toHaveLength(50);
    expect(latest.messages.at(-1).content).toBe('message 119');
    expect(latest.hasMoreBefore).toBe(true);
    const older = (await bob.get(`/api/channels/${ch.id}/messages?before=${latest.messages[0].id}`)).body;
    expect(older.messages.at(-1).content).toBe('message 69');
    expect(older.messages[0].content).toBe('message 20');
    const oldest = (await bob.get(`/api/channels/${ch.id}/messages?before=${older.messages[0].id}`)).body;
    expect(oldest.messages).toHaveLength(20);
    expect(oldest.hasMoreBefore).toBe(false);
    const after = (await bob.get(`/api/channels/${ch.id}/messages?after=${ids[100]}`)).body;
    expect(after.messages.map((m: any) => m.content)).toEqual(
      Array.from({ length: 19 }, (_, i) => `message ${101 + i}`),
    );
    expect(after.hasMoreAfter).toBe(false);
    const around = (await bob.get(`/api/channels/${ch.id}/messages?around=${ids[60]}&limit=10`)).body;
    expect(around.messages.map((m: any) => m.content)).toContain('message 60');
    expect(around.hasMoreBefore && around.hasMoreAfter).toBe(true);
  });
});

describe('editing, deleting and moderation', () => {
  it('only the author can edit', async () => {
    const msg = (await send(alice, general.id, 'tpyo here')).body.message;
    expect((await bob.patch(`/api/messages/${msg.id}`, { content: 'hijacked' })).status).toBe(403);
    const edited = await alice.patch(`/api/messages/${msg.id}`, { content: 'typo fixed' });
    expect(edited.status).toBe(200);
    expect(edited.body.message.editedAt).not.toBeNull();
    expect(edited.body.message.content).toBe('typo fixed');
  });

  it('members cannot delete others’ messages; authors and moderators can', async () => {
    const msg = (await send(alice, general.id, 'delete me later')).body.message;
    expect((await bob.del(`/api/messages/${msg.id}`)).status).toBe(403);
    expect((await outsider.del(`/api/messages/${msg.id}`)).status).toBe(404);
    expect((await alice.del(`/api/messages/${msg.id}`)).status).toBe(204);
    const fetched = (await bob.get(`/api/messages/${msg.id}`)).body.message;
    expect(fetched.deletedAt).not.toBeNull();
    expect(fetched.content).toBe('');

    const bobMsg = (await send(bob, general.id, 'spammy link')).body.message;
    expect((await alice.del(`/api/messages/${bobMsg.id}`)).status).toBe(204); // owner moderates
    const audit = (await alice.get(`/api/communities/${community.id}/audit`)).body.events;
    expect(audit.some((e: any) => e.action === 'message.deleted' && e.targetId === bobMsg.id)).toBe(true);
    expect(JSON.stringify(audit)).not.toContain('spammy link');
  });

  it('pins require MANAGE_MESSAGES', async () => {
    const msg = (await send(bob, general.id, 'pin-worthy')).body.message;
    expect((await bob.put(`/api/messages/${msg.id}/pin`)).status).toBe(403);
    expect((await alice.put(`/api/messages/${msg.id}/pin`)).status).toBe(200);
    expect((await bob.get(`/api/channels/${general.id}/pins`)).body.messages.map((m: any) => m.id)).toContain(msg.id);
    expect((await alice.del(`/api/messages/${msg.id}/pin`)).status).toBe(200);
    expect((await bob.get(`/api/channels/${general.id}/pins`)).body.messages.map((m: any) => m.id)).not.toContain(
      msg.id,
    );
  });
});

describe('reactions, replies and mentions', () => {
  it('adds and removes reactions idempotently', async () => {
    const msg = (await send(alice, general.id, 'react to this')).body.message;
    expect((await bob.put(`/api/messages/${msg.id}/reactions`, { emoji: '🔥' })).body.count).toBe(1);
    expect((await bob.put(`/api/messages/${msg.id}/reactions`, { emoji: '🔥' })).body.count).toBe(1);
    expect((await carol.put(`/api/messages/${msg.id}/reactions`, { emoji: '🔥' })).body.count).toBe(2);
    const view = (await bob.get(`/api/messages/${msg.id}`)).body.message;
    expect(view.reactions).toEqual([{ emoji: '🔥', count: 2, me: true }]);
    expect((await bob.del(`/api/messages/${msg.id}/reactions?emoji=${encodeURIComponent('🔥')}`)).body.count).toBe(1);
    expect((await bob.put(`/api/messages/${msg.id}/reactions`, { emoji: 'not an emoji' })).status).toBe(400);
    expect((await outsider.put(`/api/messages/${msg.id}/reactions`, { emoji: '🔥' })).status).toBe(404);
  });

  it('replies carry a preview of the parent and notify its author', async () => {
    const parent = (await send(alice, general.id, 'What reverb are you using?')).body.message;
    const reply = (await send(bob, general.id, 'A plate with 1.8s decay', { replyToId: parent.id })).body.message;
    expect(reply.replyTo.id).toBe(parent.id);
    expect(reply.replyTo.content).toBe('What reverb are you using?');
    const notes = (await alice.get('/api/notifications')).body.notifications;
    expect(notes.some((n: any) => n.type === 'reply' && n.messageId === reply.id)).toBe(true);
    const otherCh = (await alice.post(`/api/communities/${community.id}/channels`, { name: 'elsewhere' })).body.channel;
    expect((await send(bob, otherCh.id, 'cross reply', { replyToId: parent.id })).status).toBe(400);
  });

  it('mentions notify members who can see the channel, and nobody else', async () => {
    const priv = (await alice.post(`/api/communities/${community.id}/channels`, { name: 'secret', isPrivate: true }))
      .body.channel;
    const res = (await send(alice, priv.id, 'hey @carol and @bob, can you hear this?')).body.message;
    expect(res.mentions).toEqual([]);
    const msg = (await send(alice, general.id, 'great mix @bob!')).body.message;
    expect(msg.mentions.map((m: any) => m.username)).toEqual(['bob']);
    const bobNotes = (await bob.get('/api/notifications')).body.notifications;
    expect(bobNotes.some((n: any) => n.type === 'mention' && n.messageId === msg.id)).toBe(true);
    expect(bobNotes.some((n: any) => n.channelId === priv.id)).toBe(false);
    const boot = (await bob.get('/api/me/bootstrap')).body;
    const unread = boot.unreads.find((u: any) => u.channelId === general.id);
    expect(unread.mentions).toBeGreaterThanOrEqual(1);
  });

  it('@everyone only counts when the author has MENTION_EVERYONE', async () => {
    const plain = (await send(bob, general.id, '@everyone listen up')).body.message;
    expect(plain.mentionEveryone).toBe(false);
    const fromOwner = (await send(alice, general.id, '@everyone listening session at 7')).body.message;
    expect(fromOwner.mentionEveryone).toBe(true);
  });
});

describe('read state', () => {
  it('tracks unread counts and clears them when read', async () => {
    const ch = (await alice.post(`/api/communities/${community.id}/channels`, { name: 'unread-test' })).body.channel;
    let last = '';
    for (let i = 0; i < 3; i++) last = (await send(alice, ch.id, `news ${i}`)).body.message.id;
    const before = (await bob.get('/api/me/bootstrap')).body.unreads.find((u: any) => u.channelId === ch.id);
    expect(before.unread).toBe(3);
    expect((await bob.post(`/api/channels/${ch.id}/read`, { messageId: last })).status).toBe(200);
    const after = (await bob.get('/api/me/bootstrap')).body.unreads.find((u: any) => u.channelId === ch.id);
    expect(after.unread).toBe(0);
    // Own messages never count as unread.
    const own = (await alice.get('/api/me/bootstrap')).body.unreads.find((u: any) => u.channelId === ch.id);
    expect(own.unread).toBe(0);
  });

  it('cannot mark a channel read with a message from another channel', async () => {
    const msg = (await send(alice, general.id, 'x')).body.message;
    const ch = (await alice.post(`/api/communities/${community.id}/channels`, { name: 'read-mismatch' })).body.channel;
    expect((await bob.post(`/api/channels/${ch.id}/read`, { messageId: msg.id })).status).toBe(400);
  });
});

describe('permission enforcement on messaging', () => {
  it('denies sending when SEND_MESSAGES is overridden off', async () => {
    const ch = (await alice.post(`/api/communities/${community.id}/channels`, { name: 'listen-only' })).body.channel;
    await alice.put(`/api/channels/${ch.id}/overwrites`, {
      targetType: 'role',
      targetId: community.everyoneRoleId,
      allow: 0,
      deny: Permission.SEND_MESSAGES,
    });
    expect((await send(bob, ch.id, 'can I talk?')).status).toBe(403);
    expect((await bob.get(`/api/channels/${ch.id}/messages`)).status).toBe(200);
  });

  it('a non-member cannot read a single message by id', async () => {
    const msg = (await send(alice, general.id, 'members only')).body.message;
    expect((await outsider.get(`/api/messages/${msg.id}`)).status).toBe(404);
  });
});
