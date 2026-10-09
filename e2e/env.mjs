// Shared between the E2E server launcher (serve.mjs) and the Playwright tests.
import os from 'node:os';
import path from 'node:path';

export const e2ePort = () => Number(process.env.E2E_PORT ?? 4173);
export const e2eDataRoot = () => path.join(os.tmpdir(), `creator-network-e2e-${e2ePort()}`);

/** Test-only administrator created in the throw-away E2E database (not a real credential). */
export const E2E_ADMIN = {
  username: 'e2e.admin',
  email: 'e2e.admin@example.test',
  displayName: 'E2E Admin',
  password: 'e2e-only-admin-passphrase-41',
};
