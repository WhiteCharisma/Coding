import { describe, expect, it } from 'vitest';
import { t, tMaybe } from '.';

describe('t()', () => {
  it('interpolates variables', () => {
    expect(t('auth.invite.by', { name: 'Mara' })).toBe('Invited by Mara');
  });

  it('chooses plural forms', () => {
    expect(t('common.labels.members', { count: 1 })).toBe('1 member');
    expect(t('common.labels.members', { count: 3 })).toBe('3 members');
  });

  it('resolves leaf keys that contain dots (audit action names)', () => {
    expect(t('community.audit.member.joined' as never, { target: 'bob' })).toBe('bob joined');
    expect(tMaybe('admin.audit.actions.user.warned', { target: 'eve' })).toBe('warned eve');
  });

  it('returns null / the key for unknown keys instead of crashing', () => {
    expect(tMaybe('admin.audit.actions.no.such.action')).toBeNull();
    expect(t('nope.missing' as never)).toBe('nope.missing');
  });
});
