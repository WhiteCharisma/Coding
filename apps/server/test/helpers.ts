import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@creator-network/shared';
import { loadConfig, type AppConfig } from '../src/config';
import { startServer, type RunningServer } from '../src/server';

export const ORIGIN = 'http://localhost:5173';

export interface TestServer extends RunningServer {
  dataDir: string;
  config: AppConfig;
  client: () => TestClient;
  stop: () => Promise<void>;
}

export async function createTestServer(env: Record<string, string> = {}): Promise<TestServer> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-test-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '0',
    APP_ORIGIN: ORIGIN,
    DATA_DIR: path.join(dataDir, 'data'),
    BACKUP_DIR: path.join(dataDir, 'backups'),
    LOG_LEVEL: 'silent',
    MAIL_TRANSPORT: 'outbox',
    RATE_LIMIT_MODE: 'relaxed',
    ARGON2_MEMORY_KIB: '8192',
    ARGON2_ITERATIONS: '1',
    BACKUP_INTERVAL_HOURS: '0',
    WEB_DIST_DIR: path.join(dataDir, 'no-web'),
    ...env,
  });
  const server = await startServer(config, { jobs: false });
  return {
    ...server,
    dataDir,
    config,
    client: () => new TestClient(server.url),
    async stop() {
      await server.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

/** Minimal browser-like HTTP client: keeps the session cookie and sends the CSRF header + Origin. */
export class TestClient {
  cookie = '';
  user: any = null;
  private sockets: Socket[] = [];

  constructor(readonly baseUrl: string) {}

  async req<T = any>(method: string, url: string, body?: unknown, opts: { headers?: Record<string, string>; raw?: BodyInit } = {}): Promise<Res<T>> {
    const headers: Record<string, string> = {
      origin: ORIGIN,
      'x-requested-with': 'CreatorNetwork',
      ...(this.cookie ? { cookie: this.cookie } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...opts.headers,
    };
    const res = await fetch(this.baseUrl + url, {
      method,
      headers,
      body: opts.raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
      redirect: 'manual',
    });
    const setCookie = res.headers.getSetCookie();
    for (const c of setCookie) {
      const [pair] = c.split(';');
      if (!pair) continue;
      const [name, value] = pair.split('=');
      if (!name) continue;
      if (!value || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) this.cookie = '';
      else this.cookie = `${name}=${value}`;
    }
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  get<T = any>(url: string) {
    return this.req<T>('GET', url);
  }
  post<T = any>(url: string, body: unknown = {}) {
    return this.req<T>('POST', url, body);
  }
  patch<T = any>(url: string, body: unknown = {}) {
    return this.req<T>('PATCH', url, body);
  }
  put<T = any>(url: string, body: unknown = {}) {
    return this.req<T>('PUT', url, body);
  }
  del<T = any>(url: string, body?: unknown) {
    return this.req<T>('DELETE', url, body);
  }

  async register(username: string, extra: Record<string, unknown> = {}): Promise<any> {
    const res = await this.post('/api/auth/register', {
      username,
      email: `${username.replace(/[^a-z0-9]/g, '')}@example.com`,
      password: 'a-strong-test-passphrase',
      displayName: username[0]?.toUpperCase() + username.slice(1),
      ...extra,
    });
    if (res.status !== 201) throw new Error(`register ${username} failed: ${res.status} ${JSON.stringify(res.body)}`);
    this.user = res.body.user;
    return res.body.user;
  }

  /** Connects a Socket.IO client with this client's session cookie. */
  async socket(opts: { origin?: string } = {}): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = ioClient(this.baseUrl, {
      transports: ['websocket'],
      extraHeaders: { cookie: this.cookie, origin: opts.origin ?? ORIGIN },
      reconnection: false,
      forceNew: true,
    });
    this.sockets.push(socket as Socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (err) => reject(err));
    });
    return socket;
  }

  closeSockets(): void {
    for (const s of this.sockets) s.disconnect();
    this.sockets = [];
  }
}

/** Waits for one socket event (with timeout). */
export function nextEvent<T = any>(socket: Socket<any, any>, event: string, timeoutMs = 3000, filter?: (payload: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload: T) => {
      if (filter && !filter(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

/** Resolves true if the event does NOT arrive within the window. */
export function noEvent(socket: Socket<any, any>, event: string, windowMs = 400, filter?: (payload: any) => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const handler = (payload: any) => {
      if (filter && !filter(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(false);
    };
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(true);
    }, windowMs);
    socket.on(event, handler);
  });
}

export function sendViaSocket(socket: Socket<ServerToClientEvents, ClientToServerEvents>, payload: { channelId: string; content: string; nonce: string; replyToId?: string | null; attachmentIds?: string[] }): Promise<any> {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit('message:send', payload, (err: Error | null, res: any) => (err ? reject(err) : resolve(res)));
  });
}

let nonceCounter = 0;
export const nonce = () => `n${Date.now().toString(36)}${(nonceCounter++).toString(36)}xyz`;

export function readOutbox(dataDir: string): { to: string; subject: string; text: string }[] {
  const dir = path.join(dataDir, 'data', 'mail-outbox');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls the development mail outbox until a matching message appears (emails are sent asynchronously). */
export async function waitForMail(dataDir: string, match: (m: { to: string; subject: string; text: string }) => boolean, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = readOutbox(dataDir).filter(match);
    if (found.length) return found[found.length - 1] as { to: string; subject: string; text: string };
    if (Date.now() > deadline) throw new Error('timed out waiting for email');
    await sleep(25);
  }
}

export function tokenFromMail(text: string): string {
  return decodeURIComponent(/token=([A-Za-z0-9_%-]+)/.exec(text)?.[1] ?? '');
}
