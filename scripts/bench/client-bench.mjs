#!/usr/bin/env node
// Browser benchmark (Chromium via Playwright). Run `npm run build` first.
//
//   node scripts/bench/client-bench.mjs
//
// Part A — page load of /welcome through PAGE_URL (default: the local Docker stack behind
//          Caddy, http://localhost:8080, which compresses responses like production).
//          Skipped if that URL is not reachable.
// Part B — a channel with BENCH_HISTORY messages on a throw-away server started by this
//          script: time to first messages, scrolling back through history (rendered rows,
//          DOM size, JS heap, scroll stability) and optimistic send latency.
//          BENCH_MOTION=calm|reduced runs it with that motion setting (default: full motion,
//          i.e. with the animated wallpaper).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE_URL = process.env.PAGE_URL ?? 'http://localhost:8080';
const PORT = Number(process.env.BENCH_PORT ?? 4410);
const BASE = `http://127.0.0.1:${PORT}`;
const HISTORY = Number(process.env.BENCH_HISTORY ?? 3000);
const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'CreatorNetwork', Origin: BASE };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const results = {
  conditions: { date: new Date().toISOString(), cpus: `${os.cpus().length} × ${os.cpus()[0]?.model}`, chromium: '' },
  pageLoad: {},
  longChannel: {},
};

function stats(values) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return { n: 0 };
  const pct = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return { n: s.length, p50: round(pct(50)), p95: round(pct(95)), max: round(s.at(-1)) };
}

const browser = await chromium.launch();
results.conditions.chromium = browser.version();
results.conditions.motion = process.env.BENCH_MOTION ?? 'full';

/* ------------------------------------------------------------- A. page load */

async function measureLoad(url, throttled) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: throttled,
    hasTouch: throttled,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (throttled) {
    // Lighthouse-style mobile profile: 150 ms RTT, 1.6 Mbps down, 750 kbps up, 4× CPU slowdown.
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.getByRole('heading', { level: 1 }).waitFor();
  await sleep(500);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    const sum = (f) => res.filter(f).reduce((a, r) => a + r.transferSize, 0);
    return {
      ttfb: nav.responseStart,
      domContentLoaded: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      lcp: window.__lcp,
      transferKb: (nav.transferSize + sum(() => true)) / 1024,
      jsKb: sum((r) => r.name.endsWith('.js')) / 1024,
      cssKb: sum((r) => r.name.endsWith('.css')) / 1024,
      fontKb: sum((r) => r.name.endsWith('.woff2')) / 1024,
      requests: res.length + 1,
    };
  });
  await context.close();
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round(v)]));
}

let pageReachable;
try {
  pageReachable = (await fetch(`${PAGE_URL}/api/health`)).ok;
} catch {
  pageReachable = false;
}
if (pageReachable) {
  results.pageLoad.url = `${PAGE_URL}/welcome`;
  results.pageLoad.unthrottled = await measureLoad(`${PAGE_URL}/welcome`, false);
  results.pageLoad.mobileThrottled = await measureLoad(`${PAGE_URL}/welcome`, true);
  console.log('page load', results.pageLoad);
} else {
  console.log(`Part A skipped: ${PAGE_URL} is not reachable.`);
}

/* ------------------------------------------------------- B. long channel */

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-client-bench-'));
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
const server = spawn(process.execPath, ['--max-semi-space-size=16', 'apps/server/dist/main.js'], {
  cwd: root,
  env,
  stdio: ['ignore', 'ignore', 'inherit'],
});
process.on('exit', () => {
  server.kill('SIGTERM');
  fs.rmSync(dataRoot, { recursive: true, force: true });
});
for (;;) {
  try {
    if ((await fetch(`${BASE}/api/health/ready`)).ok) break;
  } catch {
    /* starting */
  }
  await sleep(50);
}

let cookie = '';
async function call(method, url, body) {
  const res = await fetch(BASE + url, { method, headers: { ...HEADERS, cookie }, body: JSON.stringify(body ?? {}) });
  const set = res.headers.getSetCookie();
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
await call('POST', '/api/auth/register', {
  username: 'scroll.bench',
  email: 'scroll.bench@bench.test',
  password: 'scroll-bench-passphrase',
  displayName: 'Scroll Bench',
});
await call('POST', '/api/me/onboarding/complete');
const { community } = await call('POST', '/api/communities', { name: 'Long History', template: 'blank' });
const channelId = community.channels[0].id;
const lines = [
  'Bounced the stems, check the low end',
  'New arp idea in the WIP folder',
  'Mastering pass two is up',
  'Cover art sketch v3',
  'Who has a good reverb for snares?',
  'Release date moved to Friday',
];
let next = 0;
await Promise.all(
  Array.from({ length: 16 }, async () => {
    while (next < HISTORY) {
      const i = next++;
      await call('POST', `/api/channels/${channelId}/messages`, {
        content: `#${i} ${lines[i % lines.length]}${i % 7 === 0 ? '\nwith a second line for variety' : ''}`,
        nonce: `history-${String(i).padStart(6, '0')}`,
      });
    }
  }),
);

const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE });
const [name, value] = cookie.split('=');
await context.addCookies([{ name, value, url: BASE, httpOnly: true, sameSite: 'Lax' }]);
const page = await context.newPage();
if (process.env.BENCH_MOTION) {
  await page.addInitScript((motion) => localStorage.setItem('cn.motion', motion), process.env.BENCH_MOTION);
}
await page.addInitScript(() => {
  window.__longTasks = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__longTasks += e.duration;
  }).observe({ type: 'longtask', buffered: true });
});

const tOpen = performance.now();
await page.goto(`/c/${community.id}/${channelId}`);
await page.locator('[data-message-id]').last().waitFor();
results.longChannel.timeToMessagesMs = round(performance.now() - tOpen);
results.longChannel.history = HISTORY;

const sample = () =>
  page.evaluate(() => {
    const list = document.querySelector('[data-testid="message-list"]');
    const rows = list.querySelectorAll('[data-message-id]');
    const box = list.getBoundingClientRect();
    const first = [...rows].find((r) => r.getBoundingClientRect().bottom > box.top);
    return {
      rows: rows.length,
      domNodes: document.getElementsByTagName('*').length,
      heapMb: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
      firstId: rows[0]?.getAttribute('data-message-id') ?? null,
      anchorId: first?.getAttribute('data-message-id') ?? null,
      anchorTop: first ? first.getBoundingClientRect().top - box.top : null,
      longTasksMs: window.__longTasks,
    };
  });

// Pass 1 — timing: scroll to the top repeatedly; each step waits for the next older page.
const firstRowId = () =>
  page.evaluate(() => document.querySelector('[data-message-id]')?.getAttribute('data-message-id') ?? null);
const toTop = () =>
  page.evaluate(() => {
    document.querySelector('[data-testid="message-list"]').scrollTop = 0;
  });
const twoFrames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const steps = [];
const tScroll = performance.now();
for (let step = 0; step < 80; step++) {
  const before = await firstRowId();
  const t = performance.now();
  await toTop();
  try {
    await page.waitForFunction(
      (id) => document.querySelector('[data-message-id]')?.getAttribute('data-message-id') !== id,
      before,
      { timeout: 5000 },
    );
  } catch {
    break; // reached the beginning of the channel
  }
  await twoFrames();
  const after = await sample();
  steps.push({
    step,
    pageMs: round(performance.now() - t),
    rows: after.rows,
    domNodes: after.domNodes,
    heapMb: after.heapMb === null ? null : round(after.heapMb),
  });
}
const atStart = await sample();
results.longChannel.scrollBack = {
  pagesLoaded: steps.length,
  reachedBeginning: steps.length < 80,
  secondsTotal: round((performance.now() - tScroll) / 1000),
  pageMs: stats(steps.map((x) => x.pageMs)),
  maxRenderedRows: Math.max(...steps.map((x) => x.rows)),
  maxDomNodes: Math.max(...steps.map((x) => x.domNodes)),
  heapMbAtEnd: atStart.heapMb === null ? null : round(atStart.heapMb),
  longTasksMsTotal: round(atStart.longTasksMs),
  steps,
};
console.log('scroll back', { ...results.longChannel.scrollBack, steps: `${steps.length} steps` });

// Jump back to the newest message.
const tJump = performance.now();
await page.getByRole('button', { name: 'Jump to present' }).click();
await page.waitForFunction(
  (n) => [...document.querySelectorAll('[data-message-id]')].some((r) => r.textContent?.includes(`#${n - 1} `)),
  HISTORY,
);
results.longChannel.jumpToPresentMs = round(performance.now() - tJump);
await sleep(1500); // "Jump to present" scrolls smoothly; let it settle before the next pass

// Pass 2 — stability: delay older pages by 300 ms so the visible message can be recorded
// before the page arrives, then check it stays at the same position after prepending.
await page.route(/\/api\/channels\/[^/]+\/messages\?.*before=/, async (route) => {
  await sleep(300);
  await route.continue();
});
const jumps = [];
for (let step = 0; step < 15; step++) {
  const before = await firstRowId();
  await toTop();
  await sleep(120);
  const atTop = await sample();
  try {
    await page.waitForFunction(
      (id) => document.querySelector('[data-message-id]')?.getAttribute('data-message-id') !== id,
      before,
      { timeout: 5000 },
    );
  } catch {
    break;
  }
  await twoFrames();
  const offset = await page.evaluate((id) => {
    const list = document.querySelector('[data-testid="message-list"]');
    const row = list.querySelector(`[data-message-id="${id}"]`);
    return row ? row.getBoundingClientRect().top - list.getBoundingClientRect().top : null;
  }, atTop.anchorId);
  if (offset !== null && atTop.anchorTop !== null) jumps.push(Math.abs(offset - atTop.anchorTop));
}
await page.unroute(/\/api\/channels\/[^/]+\/messages\?.*before=/);
results.longChannel.scrollStability = {
  pagesChecked: jumps.length,
  maxShiftPx: round(Math.max(0, ...jumps)),
  shiftsOver2px: jumps.filter((j) => j > 2).length,
};
console.log('scroll stability', results.longChannel.scrollStability);

// Back to the present for the send test.
await page.getByRole('button', { name: 'Jump to present' }).click();
await page.waitForFunction(
  (n) => [...document.querySelectorAll('[data-message-id]')].some((r) => r.textContent?.includes(`#${n - 1} `)),
  HISTORY,
);

// Send latency, measured inside the page: Enter keydown → the text is in the message list
// (optimistic row), and → the server-confirmed row exists. Paced at 1 message per 1.2 s
// (the per-connection limit is a burst of 10, then 1 message per second).
const optimistic = [];
const confirmed = [];
for (let i = 0; i < 20; i++) {
  const text = `latency probe ${i} ${Date.now()}`;
  await page.getByTestId('composer-input').fill(text);
  const r = await page.evaluate(
    (txt) =>
      new Promise((resolve) => {
        const list = document.querySelector('[data-testid="message-list"]');
        const ta = document.querySelector('[data-testid="composer-input"]');
        let seen = null;
        const t0 = performance.now();
        const mo = new MutationObserver(() => {
          if (seen === null && list.textContent.includes(txt)) seen = performance.now() - t0;
          const ok = [...list.querySelectorAll('[data-message-id]')].some((row) => row.textContent.includes(txt));
          if (ok) {
            mo.disconnect();
            resolve({ optimistic: seen ?? performance.now() - t0, confirmed: performance.now() - t0 });
          }
        });
        mo.observe(list, { childList: true, subtree: true, characterData: true });
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      }),
    text,
  );
  optimistic.push(r.optimistic);
  confirmed.push(r.confirmed);
  await sleep(1200);
}
results.longChannel.sendOptimisticMs = stats(optimistic);
results.longChannel.sendConfirmedMs = stats(confirmed);
console.log('long channel', { ...results.longChannel, scrollBack: '(above)' });

await browser.close();
const outDir = path.join(root, 'reports', 'raw');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `client-bench-${Date.now()}.json`);
fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`\nResults written to ${path.relative(root, outFile)}`);
process.exit(0);
