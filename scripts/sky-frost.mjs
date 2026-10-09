#!/usr/bin/env node
// Renders the soft part of the sky (--sky-frost in apps/web/src/app.css) to two small images that
// the glass panes show through their tint (docs/DESIGN.md → "Why panes have no live blur").
// Stretched to the window, a 320×200 picture of something this soft looks the same as the CSS
// gradients but costs a fraction to paint whenever a pane's content changes.
//
//   npm run build -w @creator-network/web && node scripts/sky-frost.mjs && npm run build
//
// Run it after changing the sky (--sky-frost, --sky-1…4, --cloud…). It reads the built
// stylesheet, so the web app must have been built once. Needs the Playwright Chromium.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(path.join(root, 'apps/server/package.json'))('sharp');
const dist = path.join(root, 'apps/web/dist/assets');
const out = path.join(root, 'apps/web/src/assets');
const WIDTH = 320;
const HEIGHT = 200;

const cssFile = fs.existsSync(dist) && fs.readdirSync(dist).find((f) => /^index-.*\.css$/.test(f));
if (!cssFile) {
  console.error('No built stylesheet in apps/web/dist/assets. Run "npm run build -w @creator-network/web" first.');
  process.exit(1);
}
const css = fs.readFileSync(path.join(dist, cssFile), 'utf8');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.setContent(
    `<!doctype html><html data-theme="${theme}"><head><style>${css}</style>` +
      '<style>html,body{margin:0}body::before{display:none}#sky{width:100vw;height:100vh;background:var(--sky-frost)}</style>' +
      '</head><body><div id="sky"></div></body></html>',
  );
  const png = await page.screenshot({ type: 'png' });
  const file = path.join(out, `sky-frost-${theme}.webp`);
  const webp = await sharp(png).webp({ quality: 82, effort: 6 }).toBuffer();
  fs.writeFileSync(file, webp);
  console.log(`${path.relative(root, file)}  ${WIDTH}×${HEIGHT}  ${webp.length} bytes`);
  await page.close();
}
await browser.close();
