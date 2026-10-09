#!/usr/bin/env node
// File transfer benchmark: upload and download timings per file type, server memory while
// transferring. Talks HTTP like the browser does (session cookie, CSRF header).
//
//   BASE=http://127.0.0.1:4180 FILES=/path/to/files SERVER_PID=1234 node scripts/bench/transfer-bench.mjs
//
// BASE        server or proxy to test (default http://127.0.0.1:4180, the E2E server)
// FILES       directory with the test files (any of: *.jpg, *.png, *.wav, *.zip)
// SERVER_PID  optional: Node process to sample RSS from (/proc/<pid>/status) during transfers
// RUNS        repetitions per file (default 3); results are medians
// LABEL       name for the JSON written to reports/raw/transfer-<label>.json
// ADMIN_LOGIN / ADMIN_PASSWORD  optional (test servers only): raise the instance upload limit to
//             100 MB first, so large files can be measured
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const BASE = process.env.BASE ?? 'http://127.0.0.1:4180';
const FILES = process.env.FILES;
const RUNS = Number(process.env.RUNS ?? 3);
const PID = process.env.SERVER_PID;
const LABEL = process.env.LABEL ?? 'run';
if (!FILES) throw new Error('Set FILES to a directory of test files');

const H = { 'X-Requested-With': 'CreatorNetwork', Origin: BASE };
let cookie = '';

async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...H, cookie, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie();
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  return res;
}

function rssMb() {
  if (!PID) return null;
  try {
    const m = /VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${PID}/status`, 'utf8'));
    return m ? Number(m[1]) / 1024 : null;
  } catch {
    return null;
  }
}

/** Runs fn while sampling the server's RSS every 20 ms; returns [result, peak RSS MB]. */
async function withRss(fn) {
  let peak = rssMb() ?? 0;
  const timer = setInterval(() => (peak = Math.max(peak, rssMb() ?? 0)), 20);
  try {
    return [await fn(), PID ? Math.round(peak) : null];
  } finally {
    clearInterval(timer);
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

if (process.env.ADMIN_LOGIN) {
  const login = await call('POST', '/api/auth/login', {
    login: process.env.ADMIN_LOGIN,
    password: process.env.ADMIN_PASSWORD,
  });
  if (!login.ok) throw new Error(`admin login failed: ${login.status}`);
  const r = await call('PATCH', '/api/admin/settings', { maxUploadMb: 100 });
  if (!r.ok) throw new Error(`raising the upload limit failed: ${r.status} ${await r.text()}`);
  await call('POST', '/api/auth/logout', {});
  cookie = '';
}

const user = `xfer${Date.now().toString(36)}`;
let res = await call('POST', '/api/auth/register', {
  username: user,
  email: `${user}@example.test`,
  password: 'transfer-bench-passphrase-7',
  displayName: 'Transfer Bench',
});
if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
await call('POST', '/api/me/onboarding/complete', {});
res = await call('POST', '/api/communities', { name: 'Transfer Bench', template: 'blank', visibility: 'private' });
const { community } = await res.json();
const channelId = community.channels[0].id;

const MIME = { '.jpg': 'image/jpeg', '.png': 'image/png', '.wav': 'audio/wav', '.zip': 'application/zip' };
const files = fs
  .readdirSync(FILES)
  .filter((f) => MIME[path.extname(f)])
  .sort((a, b) => fs.statSync(path.join(FILES, a)).size - fs.statSync(path.join(FILES, b)).size);

/** One request with curl; returns status, timings, body (unless discarded) and the server's own timing. */
async function curl(args, discardBody = false) {
  const marker = '\n@@CURL@@';
  const { stdout } = await run(
    'curl',
    [
      '-s',
      '-S',
      '-H',
      `cookie: ${cookie}`,
      '-H',
      'X-Requested-With: CreatorNetwork',
      '-H',
      `Origin: ${BASE}`,
      // Browsers do not send "Expect: 100-continue"; curl would for bodies over 1 MB.
      '-H',
      'Expect:',
      '-D',
      '-',
      '-o',
      discardBody ? '/dev/null' : '-',
      '-w',
      `${marker}%{http_code} %{time_total} %{time_starttransfer} %{size_download}`,
      ...args,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const at = stdout.lastIndexOf(marker);
  const [code, total, start, size] = stdout
    .slice(at + marker.length)
    .trim()
    .split(' ');
  const raw = stdout.slice(0, at);
  const headerEnd = raw.indexOf('\r\n\r\n');
  const headers = raw.slice(0, headerEnd);
  const timing = /server-timing:\s*([^\r\n]+)/i.exec(headers)?.[1] ?? '';
  const serverMs = timing
    ? timing.split(',').reduce((sum, part) => sum + Number(/dur=([\d.]+)/.exec(part)?.[1] ?? 0), 0)
    : null;
  return {
    status: Number(code),
    totalMs: Number(total) * 1000,
    ttfbMs: Number(start) * 1000,
    bytes: Number(size),
    body: discardBody ? '' : raw.slice(headerEnd + 4),
    serverMs,
  };
}

const results = [];
let nonce = 0;
for (const name of files) {
  const buf = fs.readFileSync(path.join(FILES, name));
  const mb = buf.length / 1024 / 1024;
  const up = [];
  const serverUp = [];
  const down = [];
  const ttfb = [];
  const preview = [];
  let peakUp = 0;
  let peakDown = 0;
  for (let i = 0; i < RUNS; i++) {
    // curl streams the file from disk like a browser does (Node's FormData encoder is the
    // bottleneck above ~50 MB/s and would hide the server's real speed).
    const [up1, rssU] = await withRss(() =>
      curl([
        '-X',
        'POST',
        '-F',
        `file=@${path.join(FILES, name)};type=${MIME[path.extname(name)]}`,
        `${BASE}/api/channels/${channelId}/attachments`,
      ]),
    );
    if (up1.status === 413) {
      console.log(JSON.stringify({ file: name, sizeMb: round(mb, 2), skipped: 'over the instance upload limit' }));
      break;
    }
    if (up1.status !== 201) throw new Error(`upload ${name}: ${up1.status} ${up1.body}`);
    up.push(up1.totalMs);
    serverUp.push(up1.serverMs);
    peakUp = Math.max(peakUp, rssU ?? 0);
    const att = JSON.parse(up1.body).attachment;
    // Attach it to a message, as the app does, so other members could download it.
    await call('POST', `/api/channels/${channelId}/messages`, {
      content: '',
      nonce: `xferbench${String(nonce++).padStart(6, '0')}`,
      attachmentIds: [att.id],
    });
    const [dl, rssD] = await withRss(() => curl([`${BASE}${att.url}`], true));
    if (dl.status !== 200) throw new Error(`download ${name}: ${dl.status}`);
    if (dl.bytes !== buf.length) throw new Error(`download size mismatch for ${name}: ${dl.bytes} != ${buf.length}`);
    down.push(dl.totalMs);
    ttfb.push(dl.ttfbMs);
    peakDown = Math.max(peakDown, rssD ?? 0);
    if (att.previewUrl) {
      const pv = await curl([`${BASE}${att.previewUrl}`], true);
      preview.push({ ms: pv.totalMs, ttfbMs: pv.ttfbMs, kb: pv.bytes / 1024, status: pv.status });
    }
  }
  if (!up.length) continue;
  const row = {
    file: name,
    sizeMb: round(mb, 2),
    uploadMs: round(median(up)),
    uploadMBps: round(mb / (median(up) / 1000)),
    uploadServerMs: serverUp.every((v) => v != null) ? round(median(serverUp)) : null,
    downloadMs: round(median(down)),
    downloadTtfbMs: round(median(ttfb)),
    downloadMBps: round(mb / (median(down) / 1000)),
    peakRssUploadMb: PID ? peakUp : null,
    peakRssDownloadMb: PID ? peakDown : null,
    preview: preview.length
      ? {
          ms: round(median(preview.map((p) => p.ms))),
          ttfbMs: round(median(preview.map((p) => p.ttfbMs))),
          kb: round(median(preview.map((p) => p.kb))),
        }
      : null,
  };
  results.push(row);
  console.log(JSON.stringify(row));
}

const out = path.resolve('reports/raw');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, `transfer-${LABEL}.json`),
  JSON.stringify({ base: BASE, runs: RUNS, at: new Date().toISOString(), results }, null, 2),
);
