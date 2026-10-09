import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** 256-bit random token, URL safe. Used for session cookies and email links. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Tokens are stored hashed so a database leak does not expose live credentials. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Human-shareable random code (invite links). 10 chars ≈ 57 bits of entropy. */
export function randomCode(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
