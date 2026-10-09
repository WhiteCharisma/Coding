/**
 * Community permission model.
 *
 * Permissions are stored as integer bitfields (fits in 31 bits so JavaScript
 * bitwise operators are safe). The SERVER is the only authority: the web client
 * uses these helpers purely to decide which controls to show.
 *
 * Resolution order (see computeChannelPermissions):
 *   1. Community owner           → everything.
 *   2. Base = @everyone role | all roles of the member.
 *   3. ADMINISTRATOR in base     → everything.
 *   4. Channel overwrites: @everyone, then all member roles combined, then member-specific.
 *   5. Without VIEW_CHANNEL, no channel permission applies.
 */

export const Permission = {
  VIEW_CHANNEL: 1 << 0,
  SEND_MESSAGES: 1 << 1,
  ATTACH_FILES: 1 << 2,
  ADD_REACTIONS: 1 << 3,
  MENTION_EVERYONE: 1 << 4,
  /** Delete other members' messages, pin and unpin messages. */
  MANAGE_MESSAGES: 1 << 5,
  /** Create, edit, reorder and delete channels/categories and their permission overwrites. */
  MANAGE_CHANNELS: 1 << 6,
  CREATE_INVITES: 1 << 7,
  /** View and revoke invitations created by anyone. */
  MANAGE_INVITES: 1 << 8,
  KICK_MEMBERS: 1 << 9,
  BAN_MEMBERS: 1 << 10,
  /** Create/edit roles below your highest role and assign them. */
  MANAGE_ROLES: 1 << 11,
  /** Edit community name, description, icon and visibility. */
  MANAGE_COMMUNITY: 1 << 12,
  VIEW_AUDIT_LOG: 1 << 13,
  ADMINISTRATOR: 1 << 14,
} as const;

export type PermissionName = keyof typeof Permission;

export const ALL_PERMISSIONS = Object.values(Permission).reduce((acc, bit) => acc | bit, 0);

/** Permissions that can be overridden per channel. */
export const CHANNEL_PERMISSIONS =
  Permission.VIEW_CHANNEL |
  Permission.SEND_MESSAGES |
  Permission.ATTACH_FILES |
  Permission.ADD_REACTIONS |
  Permission.MENTION_EVERYONE |
  Permission.MANAGE_MESSAGES;

/** Defaults for the implicit @everyone role of a new community. */
export const DEFAULT_EVERYONE_PERMISSIONS =
  Permission.VIEW_CHANNEL |
  Permission.SEND_MESSAGES |
  Permission.ATTACH_FILES |
  Permission.ADD_REACTIONS |
  Permission.CREATE_INVITES;

/** Defaults for the "Moderator" role created with every community. */
export const DEFAULT_MODERATOR_PERMISSIONS =
  DEFAULT_EVERYONE_PERMISSIONS |
  Permission.MENTION_EVERYONE |
  Permission.MANAGE_MESSAGES |
  Permission.MANAGE_INVITES |
  Permission.KICK_MEMBERS |
  Permission.BAN_MEMBERS |
  Permission.VIEW_AUDIT_LOG;

/** Permissions every DM / group DM participant has. */
export const DM_PERMISSIONS =
  Permission.VIEW_CHANNEL |
  Permission.SEND_MESSAGES |
  Permission.ATTACH_FILES |
  Permission.ADD_REACTIONS;

export function hasPermission(bits: number, permission: number): boolean {
  if ((bits & Permission.ADMINISTRATOR) === Permission.ADMINISTRATOR) return true;
  return (bits & permission) === permission;
}

export function permissionNames(bits: number): PermissionName[] {
  return (Object.keys(Permission) as PermissionName[]).filter(
    (name) => (bits & Permission[name]) === Permission[name],
  );
}

export interface RoleLike {
  id: string;
  permissions: number;
  position: number;
  isDefault: boolean;
}

export interface OverwriteLike {
  targetType: 'role' | 'member';
  targetId: string;
  allow: number;
  deny: number;
}

export interface PermissionContext {
  userId: string;
  ownerId: string;
  /** The @everyone role of the community. */
  everyoneRole: RoleLike;
  /** Roles explicitly assigned to the member (excluding @everyone). */
  memberRoles: RoleLike[];
}

export function computeBasePermissions(ctx: PermissionContext): number {
  if (ctx.userId === ctx.ownerId) return ALL_PERMISSIONS;
  let bits = ctx.everyoneRole.permissions;
  for (const role of ctx.memberRoles) bits |= role.permissions;
  if ((bits & Permission.ADMINISTRATOR) === Permission.ADMINISTRATOR) return ALL_PERMISSIONS;
  return bits;
}

export function computeChannelPermissions(
  ctx: PermissionContext,
  overwrites: readonly OverwriteLike[],
): number {
  const base = computeBasePermissions(ctx);
  if (base === ALL_PERMISSIONS) return ALL_PERMISSIONS;

  let bits = base;

  const everyone = overwrites.find(
    (o) => o.targetType === 'role' && o.targetId === ctx.everyoneRole.id,
  );
  if (everyone) {
    bits &= ~(everyone.deny & CHANNEL_PERMISSIONS);
    bits |= everyone.allow & CHANNEL_PERMISSIONS;
  }

  const roleIds = new Set(ctx.memberRoles.map((r) => r.id));
  let roleAllow = 0;
  let roleDeny = 0;
  for (const o of overwrites) {
    if (o.targetType === 'role' && roleIds.has(o.targetId)) {
      roleAllow |= o.allow;
      roleDeny |= o.deny;
    }
  }
  bits &= ~(roleDeny & CHANNEL_PERMISSIONS);
  bits |= roleAllow & CHANNEL_PERMISSIONS;

  const member = overwrites.find((o) => o.targetType === 'member' && o.targetId === ctx.userId);
  if (member) {
    bits &= ~(member.deny & CHANNEL_PERMISSIONS);
    bits |= member.allow & CHANNEL_PERMISSIONS;
  }

  if ((bits & Permission.VIEW_CHANNEL) === 0) {
    // Without view access, no channel-scoped permission applies.
    bits &= ~CHANNEL_PERMISSIONS;
  }
  return bits;
}

/** Highest role position of a member (owner is treated as infinitely high). */
export function highestRolePosition(ctx: PermissionContext): number {
  if (ctx.userId === ctx.ownerId) return Number.POSITIVE_INFINITY;
  return ctx.memberRoles.reduce((max, r) => Math.max(max, r.position), 0);
}

/** A channel is "private" when @everyone is denied VIEW_CHANNEL. */
export function isPrivateChannel(
  everyoneRoleId: string,
  overwrites: readonly OverwriteLike[],
): boolean {
  const o = overwrites.find((x) => x.targetType === 'role' && x.targetId === everyoneRoleId);
  return !!o && (o.deny & Permission.VIEW_CHANNEL) === Permission.VIEW_CHANNEL;
}
