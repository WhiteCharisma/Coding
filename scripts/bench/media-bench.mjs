#!/usr/bin/env node
// Browser-side media benchmark on a throttled connection (Chromium + CDP network emulation).
//
// Sender: file chosen → upload request starts → upload finished → message visible, plus
// main-thread long tasks and JS heap growth while the file is prepared.
// Viewer: channel opened with a cold cache → each image visible, and bytes transferred.
//
//   BASE=http://127.0.0.1:4180 FILES=/path/to/files node scripts/bench/media-bench.mjs
//   DOWN_MBIT=50 UP_MBIT=10 RTT_MS=30   (network profile; defaults shown)
//   LABEL=baseline                      (writes reports/raw/media-<label>.json)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('@playwright/test');
const BASE = process.env.BASE ?? 'http://127.0.0.1:4180';
const FILES = process.env.FILES;
const LABEL = process.env.LABEL ?? 'run';
const DOWN = Number(process.env.DOWN_MBIT ?? 50);
const UP = Number(process.env.UP_MBIT ?? 10);
const RTT = Number(process.env.RTT_MS ?? 30);
if (!FILES) throw new Error('Set FILES to a directory of test files');
const H = { 'X-Requested-With': 'CreatorNetwork', Origin: BASE };
const round = (v) => (v == null ? null : Math.round(v));

async function throttle(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: RTT,
    downloadThroughput: (DOWN * 1e6) / 8,
    uploadThroughput: (UP * 1e6) / 8,
  });
  await cdp.send('Performance.enable');
  return cdp;
}

const heapMb = async (cdp) => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return (metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / 1024 / 1024;
};

/** Records long tasks and image load times in the page. */
const instrument = () => {
  window.__longTasks = [];
  window.__imgLoads = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__longTasks.push({ start: e.startTime, duration: e.duration });
  }).observe({ type: 'longtask', buffered: true });
  document.addEventListener(
    'load',
    (e) => {
      const el = e.target;
      if (el instanceof HTMLImageElement && el.closest('[data-message-id]')) {
        const entry = performance.getEntriesByName(el.currentSrc).at(-1);
        window.__imgLoads.push({ src: el.currentSrc, t: performance.now(), bytes: entry?.encodedBodySize ?? null });
      }
    },
    true,
  );
};

const browser = await chromium.launch();
const sender = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const user = `media${Date.now().toString(36)}`;
let r = await sender.request.post(`${BASE}/api/auth/register`, {
  headers: H,
  data: {
    username: user,
    email: `${user}@example.test`,
    password: 'media-bench-passphrase-3',
    displayName: 'Media Bench',
  },
});
if (!r.ok()) throw new Error(`register ${r.status()}`);
await sender.request.post(`${BASE}/api/me/onboarding/complete`, { headers: H, data: {} });
r = await sender.request.post(`${BASE}/api/communities`, {
  headers: H,
  data: { name: 'Media Bench', template: 'blank', visibility: 'private' },
});
const { community } = await r.json();
const channel = community.channels[0];
const channelUrl = `${BASE}/c/${community.id}/${channel.id}`;

await sender.addInitScript(instrument);
const page = await sender.newPage();
const cdp = await throttle(sender, page);
await page.goto(channelUrl);
await page.getByTestId('composer-input').waitFor();

const files = fs
  .readdirSync(FILES)
  .filter((f) => /\.(jpg|png|wav)$/.test(f))
  .sort((a, b) => fs.statSync(path.join(FILES, a)).size - fs.statSync(path.join(FILES, b)).size);

const senderResults = [];
for (const name of files) {
  const file = path.join(FILES, name);
  const heapBefore = await heapMb(cdp);
  const longBefore = await page.evaluate(() => window.__longTasks.length);
  let heapPeak = heapBefore;
  const sampler = setInterval(async () => {
    try {
      heapPeak = Math.max(heapPeak, await heapMb(cdp));
    } catch {
      /* page busy */
    }
  }, 50);
  const t0 = Date.now();
  const reqStarted = page.waitForRequest((q) => q.url().includes('/attachments') && q.method() === 'POST', {
    timeout: 300_000,
  });
  const reqDone = page.waitForResponse((q) => q.url().includes('/attachments') && q.request().method() === 'POST', {
    timeout: 300_000,
  });
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await reqStarted;
  const tStart = Date.now();
  // Send as soon as the button allows it (current app: immediately; older versions: after upload).
  const send = page.getByTestId('composer-send');
  await send.waitFor();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="composer-send"]')?.hasAttribute('disabled'),
    null,
    {
      timeout: 300_000,
    },
  );
  await send.click();
  const lastRow = page.locator('[data-message-id], [data-pending-nonce]').last();
  await lastRow
    .locator('img, [role="slider"], a[href*="download=1"], [role="status"]')
    .first()
    .waitFor({ timeout: 300_000 });
  const tFirstVisible = Date.now();
  const resp = await reqDone;
  const tDone = Date.now();
  await page
    .locator('[data-pending-nonce]')
    .first()
    .waitFor({ state: 'detached', timeout: 300_000 })
    .catch(() => {});
  await page
    .locator('[data-message-id]')
    .last()
    .locator('img, [role="slider"], a[href*="download=1"]')
    .first()
    .waitFor();
  const tVisible = Date.now();
  clearInterval(sampler);
  const longTasks = await page.evaluate((n) => window.__longTasks.slice(n), longBefore);
  const row = {
    file: name,
    sizeMb: Math.round((fs.statSync(file).size / 1024 / 1024) * 100) / 100,
    status: resp.status(),
    prepareMs: tStart - t0,
    uploadMs: tDone - tStart,
    firstVisibleToSenderMs: tFirstVisible - t0,
    confirmedMs: tVisible - t0,
    longTaskMs: round(longTasks.reduce((s, x) => s + x.duration, 0)),
    heapGrowthMb: round(heapPeak - heapBefore),
  };
  senderResults.push(row);
  console.log('sender', JSON.stringify(row));
}

// Viewer: same account in a fresh context (cold cache), channel opened on the same profile.
const viewer = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  storageState: await sender.storageState(),
});
await viewer.addInitScript(instrument);
const vpage = await viewer.newPage();
await throttle(viewer, vpage);
const tNav = Date.now();
await vpage.goto(channelUrl);
const imageCount = files.filter((f) => /\.(jpg|png)$/.test(f)).length;
await vpage
  .locator('[data-message-id] img')
  .nth(imageCount - 1)
  .waitFor({ timeout: 120_000 });
await vpage.waitForFunction((n) => window.__imgLoads.length >= n, imageCount, { timeout: 120_000 });
const loads = await vpage.evaluate(() => window.__imgLoads);
const viewerResults = loads.map((l) => ({
  image: l.src.split('/').slice(-2).join('/'),
  visibleAfterMs: round(l.t),
  kb: l.bytes == null ? null : round(l.bytes / 1024),
}));
for (const v of viewerResults) console.log('viewer', JSON.stringify(v));
console.log('viewer wall time to last image', Date.now() - tNav, 'ms');

await browser.close();
const out = path.resolve('reports/raw');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, `media-${LABEL}.json`),
  JSON.stringify(
    { base: BASE, network: { downMbit: DOWN, upMbit: UP, rttMs: RTT }, sender: senderResults, viewer: viewerResults },
    null,
    2,
  ),
);
