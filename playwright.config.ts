import { defineConfig, devices } from '@playwright/test';
import { stereoToneFile } from './e2e/env.mjs';

const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;

// End-to-end tests run against the production build served by the real server
// (fresh temporary database per run). Set E2E_SKIP_BUILD=1 to reuse an existing build.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /(mobile|voice)\.spec\.ts/,
    },
    {
      // Real WebRTC between two browser contexts; the fake microphone plays a stereo test tone.
      name: 'voice',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${stereoToneFile()}`,
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
      testMatch: /voice\.spec\.ts/,
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: process.env.E2E_SKIP_BUILD ? 'node e2e/serve.mjs' : 'npm run build && node e2e/serve.mjs',
    url: `${baseURL}/api/health/ready`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
