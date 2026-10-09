import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  CHANNEL_PERMISSIONS,
  Permission,
  computeBasePermissions,
  computeChannelPermissions,
  highestRolePosition,
  isPrivateChannel,
  type PermissionContext,
} from './permissions';

const everyone = { id: 'E', permissions: Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES, position: 0, isDefault: true };
const mod = { id: 'M', permissions: Permission.MANAGE_MESSAGES | Permission.KICK_MEMBERS, position: 2, isDefault: false };
const vip = { id: 'V', permissions: 0, position: 1, isDefault: false };
const ctx = (memberRoles = [] as (typeof mod)[], userId = 'U'): PermissionContext => ({ userId, ownerId: 'O', everyoneRole: everyone, memberRoles });

describe('permission resolution', () => {
  it('gives the owner every permission regardless of roles or overwrites', () => {
    const owner = ctx([], 'O');
    expect(computeBasePermissions(owner)).toBe(ALL_PERMISSIONS);
    expect(computeChannelPermissions(owner, [{ targetType: 'member', targetId: 'O', allow: 0, deny: CHANNEL_PERMISSIONS }])).toBe(ALL_PERMISSIONS);
  });

  it('combines @everyone with assigned roles', () => {
    const bits = computeBasePermissions(ctx([mod]));
    expect(bits & Permission.MANAGE_MESSAGES).toBeTruthy();
    expect(bits & Permission.SEND_MESSAGES).toBeTruthy();
    expect(bits & Permission.BAN_MEMBERS).toBe(0);
  });

  it('ADMINISTRATOR implies everything', () => {
    const admin = { id: 'A', permissions: Permission.ADMINISTRATOR, position: 3, isDefault: false };
    expect(computeChannelPermissions(ctx([admin]), [{ targetType: 'role', targetId: 'E', allow: 0, deny: Permission.VIEW_CHANNEL }])).toBe(ALL_PERMISSIONS);
  });

  it('applies overwrites in order: @everyone, then roles, then the member', () => {
    const privateChannel = [
      { targetType: 'role' as const, targetId: 'E', allow: 0, deny: Permission.VIEW_CHANNEL },
      { targetType: 'role' as const, targetId: 'V', allow: Permission.VIEW_CHANNEL, deny: 0 },
    ];
    expect(computeChannelPermissions(ctx([]), privateChannel) & Permission.VIEW_CHANNEL).toBe(0);
    expect(computeChannelPermissions(ctx([vip]), privateChannel) & Permission.VIEW_CHANNEL).toBeTruthy();
    const memberDeny = [...privateChannel, { targetType: 'member' as const, targetId: 'U', allow: 0, deny: Permission.VIEW_CHANNEL }];
    expect(computeChannelPermissions(ctx([vip]), memberDeny)).toBe(0);
    expect(isPrivateChannel('E', privateChannel)).toBe(true);
  });

  it('removes all channel permissions without VIEW_CHANNEL', () => {
    const bits = computeChannelPermissions(ctx([mod]), [{ targetType: 'role', targetId: 'E', allow: 0, deny: Permission.VIEW_CHANNEL }]);
    expect(bits & CHANNEL_PERMISSIONS).toBe(0);
    expect(bits & Permission.KICK_MEMBERS).toBeTruthy(); // community-level permissions are unaffected
  });

  it('ignores attempts to override non-channel permissions', () => {
    const bits = computeChannelPermissions(ctx([]), [{ targetType: 'role', targetId: 'E', allow: Permission.BAN_MEMBERS, deny: 0 }]);
    expect(bits & Permission.BAN_MEMBERS).toBe(0);
  });

  it('computes the highest role position', () => {
    expect(highestRolePosition(ctx([vip, mod]))).toBe(2);
    expect(highestRolePosition(ctx([], 'O'))).toBe(Number.POSITIVE_INFINITY);
  });
});
