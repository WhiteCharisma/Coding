import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestServer, type TestServer } from './helpers';

// Serving the built web app (production layout): SPA fallback, caching, and nothing private exposed.
describe('static web app serving', () => {
  let server: TestServer;
  let webDir: string;

  beforeAll(async () => {
    webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-web-'));
    fs.mkdirSync(path.join(webDir, 'assets'));
    fs.writeFileSync(
      path.join(webDir, 'index.html'),
      '<!doctype html><title>Creator Network</title><div id="root"></div>',
    );
    fs.writeFileSync(path.join(webDir, 'assets', 'app-abc123.js'), 'console.log("app")');
    fs.writeFileSync(path.join(webDir, 'robots.txt'), 'User-agent: *\nDisallow: /api/\n');
    server = await createTestServer({ WEB_DIST_DIR: webDir });
  });

  afterAll(async () => {
    await server.stop();
    fs.rmSync(webDir, { recursive: true, force: true });
  });

  it('serves index.html for client-side routes requested by a browser', async () => {
    const res = await fetch(`${server.url}/c/01ABC/01DEF`, { headers: { accept: 'text/html,application/xhtml+xml' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toContain('<div id="root">');
  });

  it('serves hashed assets as immutable and other files as revalidated', async () => {
    const asset = await fetch(`${server.url}/assets/app-abc123.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toContain('immutable');
    const robots = await fetch(`${server.url}/robots.txt`);
    expect(robots.status).toBe(200);
    expect(robots.headers.get('cache-control')).toBe('no-cache');
  });

  it('answers unknown API routes and missing assets with JSON 404, not the app shell', async () => {
    const api = await fetch(`${server.url}/api/does-not-exist`, { headers: { accept: 'text/html' } });
    expect(api.status).toBe(404);
    expect(((await api.json()) as { error: { code: string } }).error.code).toBe('not_found');
    const asset = await fetch(`${server.url}/assets/missing.js`, { headers: { accept: '*/*' } });
    expect(asset.status).toBe(404);
  });

  it('never exposes the database, uploads or backups', async () => {
    for (const p of [
      '/data/creator-network.sqlite',
      '/creator-network.sqlite',
      '/uploads/',
      '/backups/',
      '/../data/creator-network.sqlite',
      '/%2e%2e/data/creator-network.sqlite',
    ]) {
      const res = await fetch(`${server.url}${p}`, { headers: { accept: '*/*' } });
      expect(res.status, p).toBe(404);
    }
  });

  it('still serves the API normally', async () => {
    const res = await fetch(`${server.url}/api/health`);
    expect(res.status).toBe(200);
  });
});
