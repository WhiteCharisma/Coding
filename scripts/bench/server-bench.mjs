#!/usr/bin/env node
// Server benchmark: starts the production bundle (apps/server/dist) on a throw-away database
// and measures sign-up cost, message write/read latency, search, WebSocket fan-out latency,
// CPU and memory. Run `npm run build` first.
//
//   node scripts/bench/server-bench.mjs            # defaults: 200 users, 20 000 messages
//   BENCH_USERS=100 BENCH_MESSAGES=5000 node scripts/bench/server-bench.mjs
//
// Rate limits are relaxed (NODE_ENV=test, RATE_LIMIT_MODE=relaxed) because all load comes
// from one IP; production limits would (deliberately) throttle this traffic.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.BENCH_PORT ?? 4400);
const BASE = `http://127.0.0.1:${PORT}`;
const N_USERS = Number(process.env.BENCH_USERS ?? 200);
const N_MESSAGES = Number(process.env.BENCH_MESSAGES ?? 20000);
const FANOUT_SENDERS = Number(process.env.BENCH_SENDERS ?? 20);
const FANOUT_SECONDS = Number(process.env.BENCH_SECONDS ?? 30);
const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'CreatorNetwork', Origin: BASE };
const results = { conditions: {}, phases: {} };

/* ------------------------------------------------------------------ helpers */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function stats(values) {
  if (values.length === 0) return { n: 0 };
  const s = [...values].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    n: s.length,
    mean: round(mean, 2),
    p50: round(pct(50), 2),
    p95: round(pct(95), 2),
    p99: round(pct(99), 2),
    max: round(s[s.length - 1], 2),
  };
}

function procSample(pid) {
  const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
  const rssKb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
  const ticks = Number(stat[11]) + Number(stat[12]); // utime + stime (fields 14 and 15)
  return { rssMb: round(rssKb / 1024), cpuSec: ticks / 100, at: performance.now() };
}

function cpuPercent(a, b) {
  return round(((b.cpuSec - a.cpuSec) / ((b.at - a.at) / 1000)) * 100);
}

async function request(method, url, { cookie, body } = {}) {
  if (method !== 'GET' && body === undefined) body = {}; // JSON content type requires a body
  const t0 = performance.now();
  const res = await fetch(BASE + url, {
    method,
    headers: { ...HEADERS, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const ms = performance.now() - t0;
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text.slice(0, 200)}`);
  return { ms, body: text ? JSON.parse(text) : null, setCookie: res.headers.getSetCookie() };
}

/** Runs `total` calls of fn(i) with at most `concurrency` in flight; returns latencies (ms). */
async function pool(total, concurrency, fn) {
  const latencies = [];
  let next = 0;
  const t0 = performance.now();
  async function worker() {
    while (next < total) {
      const i = next++;
      const t = performance.now();
      await fn(i);
      latencies.push(performance.now() - t);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  const seconds = (performance.now() - t0) / 1000;
  return { latency: stats(latencies), seconds: round(seconds, 2), perSecond: round(total / seconds) };
}

const WORDS =
  'bass kick snare synth pad arp chord melody mix master stem loop sample vocal reverb delay compressor sidechain tempo groove swing verse chorus bridge drop intro outro demo release label artwork cover sketch palette shader sprite level boss soundtrack ambience foley texture tape vinyl analog modular patch oscillator filter envelope lfo saturation warmth punch clarity stereo mono headroom loudness dynamics feedback session collab deadline premiere playlist radio festival tour merch canvas brush gradient lighting render rig animation storyboard dialogue cutscene jam prototype build playtest'.split(
    ' ',
  );
const sentence = (i) =>
  Array.from({ length: 8 + (i % 13) }, (_, k) => WORDS[(i * 7 + k * 13) % WORDS.length]).join(' ');

/* -------------------------------------------------------------- the server */

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-bench-'));
const env = {
  ...process.env,
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: String(PORT),
  APP_ORIGIN: BASE,
  DATA_DIR: path.join(dataRoot, 'data'),
  BACKUP_DIR: path.join(dataRoot, 'backups'),
  BACKUP_INTERVAL_HOURS: '0',
  RATE_LIMIT_MODE: 'relaxed',
  MAIL_TRANSPORT: 'disabled',
  LOG_LEVEL: 'warn',
};
if (!fs.existsSync(path.join(root, 'apps/server/dist/main.js'))) {
  console.error('Build first: npm run build');
  process.exit(1);
}
// An administrator, only to read the server's own memory figures from /api/admin/overview.
const ADMIN_PASSWORD = 'bench-admin-passphrase-77';
const admin = spawnSync(
  process.execPath,
  [
    'apps/server/dist/cli.js',
    'create-admin',
    '--username',
    'bench.admin',
    '--email',
    'bench.admin@bench.test',
    '--display-name',
    'Bench Admin',
  ],
  { cwd: root, env, input: `${ADMIN_PASSWORD}\n${ADMIN_PASSWORD}\n`, encoding: 'utf8' },
);
if (admin.status !== 0) throw new Error(admin.stderr || admin.stdout);
const t0 = performance.now();
const server = spawn(process.execPath, ['--max-semi-space-size=16', 'apps/server/dist/main.js'], {
  cwd: root,
  env,
  stdio: ['ignore', 'inherit', 'inherit'],
});
const cleanup = () => {
  server.kill('SIGTERM');
  fs.rmSync(dataRoot, { recursive: true, force: true });
};
process.on('exit', cleanup);
for (;;) {
  try {
    if ((await fetch(`${BASE}/api/health/ready`)).ok) break;
  } catch {
    /* not up yet */
  }
  await sleep(50);
}
const pid = server.pid;
const adminLogin = await request('POST', '/api/auth/login', {
  body: { login: 'bench.admin', password: ADMIN_PASSWORD },
});
const adminCookie = adminLogin.setCookie.map((c) => c.split(';')[0]).join('; ');
/** Server-reported heap: the minimum of a few samples approximates live (post-GC) heap. */
async function heapUsedMb(samples = 5) {
  let min = Infinity;
  for (let i = 0; i < samples; i++) {
    const { body } = await request('GET', '/api/admin/overview', { cookie: adminCookie });
    min = Math.min(min, body.runtime.heapUsedMb);
    await sleep(400);
  }
  return min;
}
results.conditions = {
  date: new Date().toISOString(),
  node: process.version,
  cpus: `${os.cpus().length} × ${os.cpus()[0]?.model ?? 'cpu'}`,
  memoryGb: round(os.totalmem() / 1024 ** 3),
  platform: `${os.platform()} ${os.release()}`,
  users: N_USERS,
  messages: N_MESSAGES,
  note: 'Load generator and server share the same machine; rate limits relaxed.',
};
results.phases.startup = { msToReady: round(performance.now() - t0), ...procSample(pid) };
console.log('server ready', results.phases.startup);

/* ------------------------------------------------------------ 1. sign-ups */

const users = [];
const signup = await pool(N_USERS, 8, async (i) => {
  const username = `bench${String(i).padStart(4, '0')}`;
  const res = await request('POST', '/api/auth/register', {
    body: { username, email: `${username}@bench.test`, password: 'bench-passphrase-1234', displayName: `Bench ${i}` },
  });
  const cookie = res.setCookie.map((c) => c.split(';')[0]).join('; ');
  users[i] = { id: res.body.user.id, username, cookie };
});
results.phases.signup = { ...signup, note: 'POST /api/auth/register (Argon2id 19 MiB, 2 passes), concurrency 8' };
console.log('sign-up', results.phases.signup);

/* ----------------------------------------------- 2. community + memberships */

const owner = users[0];
const { body: created } = await request('POST', '/api/communities', {
  cookie: owner.cookie,
  body: { name: 'Benchmark Collective', template: 'blank', visibility: 'private' },
});
const community = created.community;
const channelId = community.channels[0].id;
const { body: inv } = await request('POST', `/api/communities/${community.id}/invites`, {
  cookie: owner.cookie,
  body: { maxUses: null, expiresInHours: 24 },
});
await pool(N_USERS - 1, 16, async (i) =>
  request('POST', `/api/invites/${inv.invite.code}/accept`, { cookie: users[i + 1].cookie }),
);

/* --------------------------------------------------------- 3. message writes */

const seedIds = [];
const writes = await pool(N_MESSAGES, 16, async (i) => {
  const u = users[i % users.length];
  const res = await request('POST', `/api/channels/${channelId}/messages`, {
    cookie: u.cookie,
    body: { content: sentence(i), nonce: `seed-${i}-${u.username}` },
  });
  if (i % 1000 === 0) seedIds.push(res.body.message.id);
});
results.phases.writeHttp = {
  ...writes,
  note: `POST /api/channels/:id/messages, ${N_MESSAGES} messages, concurrency 16`,
};
console.log('writes', results.phases.writeHttp);
results.phases.afterSeed = procSample(pid);

/* ------------------------------------------------------------------ 4. reads */

const pick = (i) => users[(i * 31) % users.length];
const mid = seedIds[Math.floor(seedIds.length / 2)];
const reads = {};
reads.health = await pool(2000, 10, () => request('GET', '/api/health'));
reads.latestPage = await pool(2000, 10, (i) =>
  request('GET', `/api/channels/${channelId}/messages?limit=50`, { cookie: pick(i).cookie }),
);
reads.deepPage = await pool(2000, 10, (i) =>
  request('GET', `/api/channels/${channelId}/messages?limit=50&before=${mid}`, { cookie: pick(i).cookie }),
);
reads.bootstrap = await pool(1000, 10, (i) => request('GET', '/api/me/bootstrap', { cookie: pick(i).cookie }));
reads.search = await pool(1000, 10, (i) =>
  request(
    'GET',
    `/api/search/messages?q=${encodeURIComponent(WORDS[i % WORDS.length] + ' ' + WORDS[(i * 3) % WORDS.length])}`,
    { cookie: pick(i).cookie },
  ),
);
results.phases.reads = reads;
console.log(
  'reads',
  Object.fromEntries(
    Object.entries(reads).map(([k, v]) => [
      k,
      { rps: v.perSecond, p50: v.latency.p50, p95: v.latency.p95, p99: v.latency.p99 },
    ]),
  ),
);

/* --------------------------------------------------------- 5. real-time fan-out */

async function connectAll(cookies, concurrency = 25) {
  const sockets = [];
  const connect = await pool(cookies.length, concurrency, async (i) => {
    const s = io(BASE, {
      transports: ['websocket'],
      extraHeaders: { cookie: cookies[i], origin: BASE },
      reconnection: false,
      forceNew: true,
    });
    await new Promise((resolve, reject) => {
      s.once('connect', resolve);
      s.once('connect_error', reject);
    });
    sockets.push(s);
  });
  return { sockets, connect };
}

async function fanout(label, sockets, senders, seconds) {
  const deliveries = [];
  for (const s of sockets) {
    s.on('message:new', (m) => {
      const match = /^fanout:(\d+(?:\.\d+)?)/.exec(m.content);
      if (match) deliveries.push(performance.timeOrigin + performance.now() - Number(match[1]));
    });
  }
  const acks = [];
  let sent = 0;
  let failed = 0;
  const before = procSample(pid);
  const endAt = performance.now() + seconds * 1000;
  // Each sender sends one message per second (the per-connection send limit is 10 burst / 1 per second).
  await Promise.all(
    senders.map(async (s, k) => {
      await sleep((k / senders.length) * 1000);
      while (performance.now() < endAt) {
        const ts = performance.timeOrigin + performance.now();
        const t = performance.now();
        const ack = await new Promise((resolve) =>
          s.emit(
            'message:send',
            { channelId, content: `fanout:${ts} ${sentence(sent)}`, nonce: `fan-${label}-${k}-${sent}` },
            resolve,
          ),
        );
        if (ack?.ok) acks.push(performance.now() - t);
        else failed++;
        sent++;
        await sleep(Math.max(0, 1000 - (performance.now() - t)));
      }
    }),
  );
  await sleep(1500); // let the last deliveries arrive
  const after = procSample(pid);
  for (const s of sockets) s.off('message:new');
  const expected = (sent - failed) * sockets.length;
  return {
    sockets: sockets.length,
    messagesSent: sent,
    sendFailures: failed,
    deliveries: deliveries.length,
    expectedDeliveries: expected,
    deliveriesPerSecond: round(deliveries.length / seconds),
    ackLatencyMs: stats(acks),
    deliveryLatencyMs: stats(deliveries),
    serverCpuPercent: cpuPercent(before, after),
    serverRssMb: after.rssMb,
  };
}

const idleBefore = procSample(pid);
const heapBefore = await heapUsedMb();
const one = await connectAll(users.map((u) => u.cookie));
await sleep(2000);
const idleOne = procSample(pid);
const heapOne = await heapUsedMb();
results.phases.sockets1 = {
  connect: one.connect,
  rssBeforeMb: idleBefore.rssMb,
  rssAfterMb: idleOne.rssMb,
  heapBeforeMb: heapBefore,
  heapAfterMb: heapOne,
  heapPerSocketKb: round(((heapOne - heapBefore) * 1024) / one.sockets.length),
};
console.log('sockets x1', results.phases.sockets1);
results.phases.fanout1 = await fanout('a', one.sockets, one.sockets.slice(0, FANOUT_SENDERS), FANOUT_SECONDS);
console.log('fan-out (1 socket/user)', results.phases.fanout1);

// Many tabs: 4 more connections per user (5 per user in total).
const extraCookies = users.flatMap((u) => [u.cookie, u.cookie, u.cookie, u.cookie]);
const more = await connectAll(extraCookies);
await sleep(2000);
const idleMany = procSample(pid);
const heapMany = await heapUsedMb();
const all = [...one.sockets, ...more.sockets];
results.phases.sockets5 = {
  sockets: all.length,
  connect: more.connect,
  rssMb: idleMany.rssMb,
  heapUsedMb: heapMany,
  heapPerSocketKb: round(((heapMany - heapBefore) * 1024) / all.length),
};
console.log('sockets x5', results.phases.sockets5);
results.phases.fanout5 = await fanout(
  'b',
  all,
  one.sockets.slice(0, Math.max(1, FANOUT_SENDERS / 2)),
  Math.max(10, FANOUT_SECONDS / 2),
);
console.log('fan-out (5 sockets/user)', results.phases.fanout5);
for (const s of all) s.disconnect();

/* ------------------------------------------------------------------ 6. disk */

const dbFile = path.join(env.DATA_DIR, 'creator-network.sqlite');
const size = (f) => (fs.existsSync(f) ? fs.statSync(f).size : 0);
results.phases.disk = {
  dbMb: round((size(dbFile) + size(`${dbFile}-wal`)) / 1024 / 1024, 2),
  messagesStored: N_MESSAGES + (results.phases.fanout1.messagesSent ?? 0) + (results.phases.fanout5.messagesSent ?? 0),
};
results.phases.final = procSample(pid);
console.log('disk', results.phases.disk);

const outDir = path.join(root, 'reports', 'raw');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `server-bench-${Date.now()}.json`);
fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`\nResults written to ${path.relative(root, outFile)}`);
process.exit(0);
