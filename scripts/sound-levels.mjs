#!/usr/bin/env node
// Measures the interface sounds (apps/web/src/lib/sound-recipes.ts): renders each recipe offline
// in Chromium (OfflineAudioContext, the browser's own Web Audio engine) and reports its length,
// peak and loudest 50 ms RMS, plus the LEVEL trim that brings it to the common target.
//
//   node scripts/sound-levels.mjs            # table
//   node scripts/sound-levels.mjs --json     # machine-readable
//
// Needs the Playwright Chromium (npx playwright install chromium).
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_RMS_DB = -24; // short-term loudness every sound is trimmed to, at LEVEL 1 × volume 100 %

const bundle = await build({
  entryPoints: [path.join(root, 'apps/web/src/lib/sound-recipes.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'CNSounds',
  target: 'es2022',
});

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><title>sound levels</title>');
await page.addScriptTag({ content: bundle.outputFiles[0].text });
const results = await page.evaluate(async (target) => {
  const { RECIPES, LEVEL } = globalThis.CNSounds;
  const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  const out = [];
  for (const name of Object.keys(RECIPES)) {
    const rate = 48000;
    const ctx = new globalThis.OfflineAudioContext(1, rate * 1.5, rate);
    const gain = ctx.createGain();
    gain.gain.value = LEVEL[name];
    gain.connect(ctx.destination);
    const length = RECIPES[name](ctx, gain, 0.01);
    const data = (await ctx.startRendering()).getChannelData(0);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    const win = Math.round(rate * 0.05);
    let sum = 0;
    let maxRms = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
      if (i >= win) sum -= data[i - win] * data[i - win];
      if (i >= win - 1) maxRms = Math.max(maxRms, Math.sqrt(Math.max(0, sum) / win));
    }
    const trim = LEVEL[name] * 10 ** ((target - db(maxRms)) / 20);
    out.push({
      name,
      lengthMs: Math.round(length * 1000),
      peakDb: +db(peak).toFixed(1),
      rmsDb: +db(maxRms).toFixed(1),
      level: LEVEL[name],
      suggestedLevel: +trim.toFixed(3),
    });
  }
  return out;
}, TARGET_RMS_DB);
await browser.close();

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log(`target short-term RMS ${TARGET_RMS_DB} dBFS\n`);
  console.log('sound          length   peak dBFS   50ms RMS dBFS   LEVEL   suggested');
  for (const r of results) {
    console.log(
      `${r.name.padEnd(14)} ${String(r.lengthMs).padStart(4)} ms ${String(r.peakDb).padStart(9)} ${String(r.rmsDb).padStart(13)} ${String(r.level).padStart(9)} ${String(r.suggestedLevel).padStart(10)}`,
    );
  }
}
