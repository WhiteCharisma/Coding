// Shared between the E2E server launcher (serve.mjs) and the Playwright tests.
import fs from 'node:fs';
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

/** Stereo test tone for the fake microphone: 440 Hz on the left, 1320 Hz on the right (48 kHz, 16-bit). */
export const STEREO_TONE = { left: 440, right: 1320 };

export function stereoToneFile() {
  const file = path.join(os.tmpdir(), 'creator-network-e2e-stereo-tone.wav');
  if (fs.existsSync(file)) return file;
  const rate = 48000;
  const frames = rate * 2;
  const data = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * STEREO_TONE.left * t) * 0.5 * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * STEREO_TONE.right * t) * 0.5 * 32767), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(2, 22); // stereo
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
  return file;
}
