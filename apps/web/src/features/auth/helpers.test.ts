import { describe, expect, it } from 'vitest';
import { parseInviteCode } from '../community/CreateJoinDialog';
import { passwordStrength } from './RegisterPage';

describe('passwordStrength', () => {
  it('grades by length and variety', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('short1!')).toBe(1);
    expect(passwordStrength('aaaaaaaaaaaa')).toBe(1);
    expect(passwordStrength('mellow-tape-hiss')).toBe(3);
    expect(passwordStrength('Abcdef1234')).toBe(2);
  });
});

describe('parseInviteCode', () => {
  it('accepts bare codes and full links', () => {
    expect(parseInviteCode('abc123XYZ')).toBe('abc123XYZ');
    expect(parseInviteCode('https://community.example.com/invite/abc123XYZ')).toBe('abc123XYZ');
    expect(parseInviteCode('  https://x.test/invite/abc123XYZ/  ')).toBe('abc123XYZ');
  });
  it('rejects junk', () => {
    expect(parseInviteCode('no')).toBeNull();
    expect(parseInviteCode('<script>')).toBeNull();
  });
});
