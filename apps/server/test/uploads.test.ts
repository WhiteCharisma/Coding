import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Permission } from '@creator-network/shared';
import { encodePng } from '../src/seed/png';
import { synthesize } from '../src/seed/audio';
import { createTestServer, nonce, type TestClient, type TestServer } from './helpers';

let srv: TestServer;
let alice: TestClient;
let bob: TestClient;
let outsider: TestClient;
let general: any;
let other: any;

const png = (size = 32) => encodePng(size, size, new Uint8Array(size * size * 3).fill(180));

function form(file: Buffer | string, name: string, fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('file', new Blob([typeof file === 'string' ? file : new Uint8Array(file)]), name);
  return fd;
}

const upload = (c: TestClient, url: string, fd: FormData) => c.req('POST', url, undefined, { raw: fd });

beforeAll(async () => {
  srv = await createTestServer();
  [alice, bob, outsider] = [srv.client(), srv.client(), srv.client()];
  await alice.register('alice');
  await bob.register('bob');
  await outsider.register('outsider');
  const community = (await alice.post('/api/communities', { name: 'Files Club' })).body.community;
  general = community.channels.find((c: any) => c.name === 'general');
  other = (await alice.post(`/api/communities/${community.id}/channels`, { name: 'other' })).body.channel;
  const inv = (await alice.post(`/api/communities/${community.id}/invites`, {})).body.invite;
  await bob.post(`/api/invites/${inv.code}/accept`);
});
afterAll(async () => {
  await srv.stop();
});

describe('attachment uploads', () => {
  it('accepts an image, attaches it to a message and serves it only to authorised users', async () => {
    const res = await upload(alice, `/api/channels/${general.id}/attachments`, form(png(64), 'cover.png'));
    expect(res.status).toBe(201);
    const att = res.body.attachment;
    expect(att).toMatchObject({ kind: 'image', mime: 'image/png', width: 64, height: 64, name: 'cover.png' });
    expect((await bob.get(att.url)).status).toBe(404); // pending: only the uploader can see it

    const msg = (await alice.post(`/api/channels/${general.id}/messages`, { content: 'new cover', nonce: nonce(), attachmentIds: [att.id] })).body.message;
    expect(msg.attachments.map((a: any) => a.id)).toEqual([att.id]);

    const file = await fetch(`${srv.url}${att.url}`, { headers: { cookie: bob.cookie } });
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(file.headers.get('x-content-type-options')).toBe('nosniff');
    expect(file.headers.get('content-security-policy')).toContain('sandbox');
    expect(Buffer.from(await file.arrayBuffer()).subarray(1, 4).toString()).toBe('PNG');

    expect((await outsider.get(att.url)).status).toBe(404);
    expect((await fetch(`${srv.url}${att.url}`)).status).toBe(401);

    // Deleting the message makes the file unavailable.
    await alice.del(`/api/messages/${msg.id}`);
    expect((await bob.get(att.url)).status).toBe(404);
  });

  it('detects type from the file signature, not the extension', async () => {
    const fake = await upload(alice, `/api/channels/${general.id}/attachments`, form('<script>alert(1)</script>', 'innocent.png'));
    expect(fake.status).toBe(415);
    const html = await upload(alice, `/api/channels/${general.id}/attachments`, form('<html><body>hi</body></html>', 'page.html'));
    expect(html.status).toBe(415);
    const svg = await upload(alice, `/api/channels/${general.id}/attachments`, form('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', 'logo.svg'));
    expect(svg.status).toBe(415);
    const exe = await upload(alice, `/api/channels/${general.id}/attachments`, form(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0, 0, 0, 0x04, 0, 0, 0, 0xff, 0xff]), 'tool.png'));
    expect(exe.status).toBe(415);
    const disguisedPng = await upload(alice, `/api/channels/${general.id}/attachments`, form(png(), 'photo.jpg'));
    expect(disguisedPng.status).toBe(201);
    expect(disguisedPng.body.attachment.mime).toBe('image/png');
  });

  it('accepts plain text only when it really is text', async () => {
    expect((await upload(alice, `/api/channels/${general.id}/attachments`, form('lyrics line one\nline two', 'lyrics.txt'))).status).toBe(201);
    expect((await upload(alice, `/api/channels/${general.id}/attachments`, form(Buffer.from([0x00, 0x01, 0x02, 0xff]), 'binary.txt'))).status).toBe(415);
  });

  it('sanitises file names and keeps storage paths inside the uploads directory', async () => {
    const res = await upload(alice, `/api/channels/${general.id}/attachments`, form('notes', '../../../../etc/passwd.txt'));
    expect(res.status).toBe(201);
    expect(res.body.attachment.name).toBe('passwd.txt');
    expect(fs.existsSync(path.join(srv.dataDir, 'etc'))).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain(srv.dataDir);
  });

  it('enforces the configured size limit', async () => {
    srv.ctx.settings.update({ maxUploadMb: 1 }, null);
    const big = Buffer.concat([png(), Buffer.alloc(1024 * 1024 + 10)]);
    const res = await upload(alice, `/api/channels/${general.id}/attachments`, form(big, 'huge.png'));
    expect(res.status).toBe(413);
    srv.ctx.settings.update({ maxUploadMb: 25 }, null);
  });

  it('rejects attachments that belong to someone else or another channel', async () => {
    const mine = (await upload(alice, `/api/channels/${general.id}/attachments`, form(png(), 'a.png'))).body.attachment;
    const stolen = await bob.post(`/api/channels/${general.id}/messages`, { content: 'look', nonce: nonce(), attachmentIds: [mine.id] });
    expect(stolen.status).toBe(400);
    const wrongChannel = await alice.post(`/api/channels/${other.id}/messages`, { content: 'look', nonce: nonce(), attachmentIds: [mine.id] });
    expect(wrongChannel.status).toBe(400);
  });

  it('requires ATTACH_FILES in the channel', async () => {
    const ch = (await alice.post(`/api/communities/${general.communityId}/channels`, { name: 'no-files' })).body.channel;
    const roles = (await alice.get(`/api/communities/${general.communityId}/roles`)).body.roles;
    const everyone = roles.find((r: any) => r.isDefault);
    await alice.put(`/api/channels/${ch.id}/overwrites`, { targetType: 'role', targetId: everyone.id, allow: 0, deny: Permission.ATTACH_FILES });
    expect((await upload(bob, `/api/channels/${ch.id}/attachments`, form(png(), 'x.png'))).status).toBe(403);
    expect((await upload(outsider, `/api/channels/${ch.id}/attachments`, form(png(), 'x.png'))).status).toBe(404);
  });

  it('stores audio waveform metadata and supports byte ranges for seeking', async () => {
    const track = synthesize({ bpm: 120, style: 'musicbox', seed: 't', chords: [[60, 64, 67]] }, 32);
    const res = await upload(alice, `/api/channels/${general.id}/attachments`, form(track.wav, 'loop.wav', { waveform: JSON.stringify(track.peaks), durationMs: String(track.durationMs) }));
    expect(res.status).toBe(201);
    expect(res.body.attachment.kind).toBe('audio');
    expect(res.body.attachment.waveform).toEqual(track.peaks);
    const att = res.body.attachment;
    await alice.post(`/api/channels/${general.id}/messages`, { content: 'loop', nonce: nonce(), attachmentIds: [att.id] });
    const ranged = await fetch(`${srv.url}${att.url}`, { headers: { cookie: bob.cookie, range: 'bytes=0-99' } });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-range')).toBe(`bytes 0-99/${track.wav.length}`);
    expect((await ranged.arrayBuffer()).byteLength).toBe(100);
    const bad = await fetch(`${srv.url}${att.url}`, { headers: { cookie: bob.cookie, range: `bytes=${track.wav.length + 10}-` } });
    expect(bad.status).toBe(416);
  });
});

describe('profile images', () => {
  it('sets an avatar from an image and refuses non-images', async () => {
    const res = await upload(bob, '/api/me/avatar', form(png(96), 'me.png'));
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toMatch(/^\/api\/files\//);
    expect((await outsider.get(res.body.user.avatarUrl)).status).toBe(200); // avatars are visible to signed-in users
    const wav = synthesize({ bpm: 120, style: 'musicbox', seed: 'x', chords: [[60]] }, 8).wav;
    expect((await upload(bob, '/api/me/avatar', form(wav, 'me.png'))).status).toBe(415);
  });
});
