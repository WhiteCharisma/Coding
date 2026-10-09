import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { listBackups, restoreBackup } from '../src/ops/backup';
import { runCleanup } from '../src/ops/jobs';
import { startServer } from '../src/server';
import { toFtsQuery } from '../src/search/service';
import { createTestServer, nonce, ORIGIN, type TestClient, type TestServer } from './helpers';

let srv: TestServer;
let alice: TestClient;
let bob: TestClient;
let community: any;
let general: any;

beforeAll(async () => {
  srv = await createTestServer();
  [alice, bob] = [srv.client(), srv.client()];
  await alice.register('alice');
  await bob.register('bob');
  community = (await alice.post('/api/communities', { name: 'Search Space' })).body.community;
  general = community.channels.find((c: any) => c.name === 'general');
  const inv = (await alice.post(`/api/communities/${community.id}/invites`, {})).body.invite;
  await bob.post(`/api/invites/${inv.code}/accept`);
  for (const text of [
    'Sidechain compression on the pad bus',
    'Café vibes: field recording from Lisbon',
    'Mastering for vinyl needs mono bass',
    'The vocal chain uses a plate reverb',
  ]) {
    await alice.post(`/api/channels/${general.id}/messages`, { content: text, nonce: nonce() });
  }
});
afterAll(async () => {
  await srv.stop();
});

describe('search', () => {
  it('finds messages by words, prefixes and accent-insensitive matches', async () => {
    const plate = (await bob.get('/api/search/messages?q=plate')).body.results;
    expect(plate.map((r: any) => r.message.content)).toEqual(['The vocal chain uses a plate reverb']);
    expect(plate[0].highlight).toContain('\u0001plate\u0002');
    expect((await bob.get('/api/search/messages?q=sidech')).body.results).toHaveLength(1);
    expect((await bob.get('/api/search/messages?q=cafe')).body.results).toHaveLength(1);
    expect((await bob.get('/api/search/messages?q=vinyl%20mono')).body.results).toHaveLength(1);
  });

  it('filters by author and community', async () => {
    await bob.post(`/api/channels/${general.id}/messages`, { content: 'bob also talks about reverb', nonce: nonce() });
    const byBob = (await alice.get('/api/search/messages?q=reverb&author=bob')).body.results;
    expect(byBob.map((r: any) => r.message.author.username)).toEqual(['bob']);
    const scoped = (await alice.get(`/api/search/messages?q=reverb&communityId=${community.id}`)).body.results;
    expect(scoped.length).toBe(2);
  });

  it('treats FTS syntax in user input as plain text', async () => {
    for (const q of ['"unbalanced', 'reverb OR NOT x', 'NEAR(a b)', 'col:value', '*', '^start', '(((']) {
      const res = await bob.get(`/api/search/messages?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
    }
    expect(toFtsQuery('reverb OR "plate')).toBe('"reverb" "OR" "plate"*');
  });

  it('never returns messages from channels the searcher cannot read', async () => {
    const priv = (
      await alice.post(`/api/communities/${community.id}/channels`, { name: 'private-notes', isPrivate: true })
    ).body.channel;
    await alice.post(`/api/channels/${priv.id}/messages`, { content: 'confidential reverb settings', nonce: nonce() });
    const results = (await bob.get('/api/search/messages?q=confidential')).body.results;
    expect(results).toEqual([]);
    expect((await alice.get('/api/search/messages?q=confidential')).body.results).toHaveLength(1);
  });
});

describe('operations', () => {
  it('reports readiness', async () => {
    const res = await fetch(`${srv.url}/api/health/ready`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toEqual({ status: 'ok' }); // no internal details for anonymous callers
  });

  it('cleans up unattached uploads older than an hour', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['orphan text']), 'orphan.txt');
    const att = (await alice.req('POST', `/api/channels/${general.id}/attachments`, undefined, { raw: fd })).body
      .attachment;
    const { uploads } = await import('../src/db/schema');
    const { eq } = await import('drizzle-orm');
    srv.ctx.db
      .update(uploads)
      .set({ createdAt: Date.now() - 2 * 3600_000 })
      .where(eq(uploads.id, att.id))
      .run();
    const result = await runCleanup(srv.ctx);
    expect(result.files).toBeGreaterThanOrEqual(1);
    expect(srv.ctx.db.select().from(uploads).where(eq(uploads.id, att.id)).get()).toBeUndefined();
  });

  it('persists data across a restart, and a backup restores into a fresh data directory', async () => {
    const tmp = fs.mkdtempSync(path.join(srv.dataDir, 'restart-'));
    const env = {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '0',
      APP_ORIGIN: ORIGIN,
      LOG_LEVEL: 'silent',
      MAIL_TRANSPORT: 'outbox',
      RATE_LIMIT_MODE: 'relaxed',
      ARGON2_MEMORY_KIB: '8192',
      ARGON2_ITERATIONS: '1',
      BACKUP_INTERVAL_HOURS: '0',
      DATA_DIR: path.join(tmp, 'data'),
      BACKUP_DIR: path.join(tmp, 'backups'),
      WEB_DIST_DIR: path.join(tmp, 'none'),
    } as const;
    // First run: create data.
    let server = await startServer(loadConfig(env), { jobs: false });
    const { TestClient } = await import('./helpers');
    let c = new TestClient(server.url);
    await c.register('persistent');
    const comm = (await c.post('/api/communities', { name: 'Survivors' })).body.community;
    const ch = comm.channels[0];
    await c.post(`/api/channels/${ch.id}/messages`, { content: 'still here after restart', nonce: nonce() });
    const fd = new FormData();
    fd.append('file', new Blob(['liner notes']), 'notes.txt');
    const att = (await c.req('POST', `/api/channels/${ch.id}/attachments`, undefined, { raw: fd })).body.attachment;
    await c.post(`/api/channels/${ch.id}/messages`, { content: 'with file', nonce: nonce(), attachmentIds: [att.id] });
    const { createBackup } = await import('../src/ops/backup');
    const backup = await createBackup(server.ctx, { reason: 'manual' });
    expect(listBackups(env.BACKUP_DIR)).toHaveLength(1);
    await c.post(`/api/channels/${ch.id}/messages`, { content: 'written after the backup', nonce: nonce() });
    await server.close();

    // Second run on the same directory: everything is still there.
    server = await startServer(loadConfig(env), { jobs: false });
    c = new TestClient(server.url);
    await c.post('/api/auth/login', { login: 'persistent', password: 'a-strong-test-passphrase' });
    const history = (await c.get(`/api/channels/${ch.id}/messages`)).body.messages.map((m: any) => m.content);
    expect(history).toEqual(expect.arrayContaining(['still here after restart', 'written after the backup']));
    await server.close();

    // Restore the backup (server stopped) and start again: state is as of the backup, files intact.
    const result = await restoreBackup(backup.path, env.DATA_DIR);
    expect(result.previousDataMovedTo).not.toBeNull();
    expect(fs.existsSync(path.join(result.previousDataMovedTo as string, 'creator-network.sqlite'))).toBe(true);
    server = await startServer(loadConfig(env), { jobs: false });
    c = new TestClient(server.url);
    await c.post('/api/auth/login', { login: 'persistent', password: 'a-strong-test-passphrase' });
    const restored = (await c.get(`/api/channels/${ch.id}/messages`)).body.messages.map((m: any) => m.content);
    expect(restored).toContain('still here after restart');
    expect(restored).not.toContain('written after the backup');
    const file = await c.get(att.url);
    expect(file.status).toBe(200);
    expect(file.body).toBe('liner notes');
    await server.close();
  });

  it('refuses to restore a corrupted archive and leaves current data untouched', async () => {
    const dir = fs.mkdtempSync(path.join(srv.dataDir, 'corrupt-'));
    const bogus = path.join(dir, 'creator-network-20990101T000000Z.tar.gz');
    fs.writeFileSync(bogus, 'not a tarball');
    const dataDir = path.join(dir, 'data');
    fs.mkdirSync(dataDir);
    fs.writeFileSync(path.join(dataDir, 'creator-network.sqlite'), 'current');
    await expect(restoreBackup(bogus, dataDir)).rejects.toThrow();
    expect(fs.readFileSync(path.join(dataDir, 'creator-network.sqlite'), 'utf8')).toBe('current');
  });
});
