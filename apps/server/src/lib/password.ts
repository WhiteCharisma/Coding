import argon2 from 'argon2';

/**
 * Argon2id password hashing (OWASP baseline: 19 MiB memory, 2 iterations, 1 lane).
 *
 * Each hash allocates `memoryCost` KiB, so concurrent hashing is capped to keep
 * memory bounded on a small VPS during login bursts.
 */
const MAX_CONCURRENT = 4;
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export interface PasswordParams {
  memoryCost: number;
  timeCost: number;
}

let params: PasswordParams = { memoryCost: 19456, timeCost: 2 };
let dummyHash: Promise<string> | null = null;

export function configurePasswordHashing(next: PasswordParams): void {
  params = next;
  dummyHash = null;
}

export function hashPassword(password: string): Promise<string> {
  return withSlot(() =>
    argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: params.memoryCost,
      timeCost: params.timeCost,
      parallelism: 1,
    }),
  );
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await withSlot(() => argon2.verify(hash, password));
  } catch {
    return false;
  }
}

/**
 * Performs a verification against a throwaway hash so that "unknown user"
 * takes about as long as "wrong password" (reduces account enumeration by timing).
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing-equalisation');
  await verifyPassword(await dummyHash, password);
}

/** True when a stored hash uses weaker parameters than the current configuration. */
export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, { memoryCost: params.memoryCost, timeCost: params.timeCost });
}

// A short list of extremely common passwords (NIST 800-63B recommends rejecting these).
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', '1234567890', '12345678910', 'qwertyuiop',
  'qwerty1234', 'qwerty12345', '1q2w3e4r5t', '1qaz2wsx3edc', 'iloveyou12', 'letmein123', 'welcome123',
  'admin12345', 'administrator', 'football12', 'baseball12', 'princess12', 'sunshine12', 'superman12',
  'trustno1234', 'abcdefghij', 'abc1234567', '0987654321', '1111111111', '0000000000', 'aaaaaaaaaa',
  'changeme123', 'password!', 'creatornetwork', 'musicproducer', 'qwertyqwerty', 'asdfghjkl1',
]);

export function isCommonPassword(password: string): boolean {
  const p = password.toLowerCase();
  return COMMON.has(p) || /^(.)\1+$/.test(p) || /^(?:0123456789|1234567890|abcdefghijklmnopqrstuvwxyz)/.test(p);
}
