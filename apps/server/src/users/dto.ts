import type { NotificationPrefs, SelfUser, UserSummary } from '@creator-network/shared';
import { NOTIFICATION_PREF_KEYS } from '@creator-network/shared';
import { users } from '../db/schema';

export type UserRow = typeof users.$inferSelect;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = Object.fromEntries(
  NOTIFICATION_PREF_KEYS.map((k) => [k, true]),
) as NotificationPrefs;

/** Files are always served through the authorising endpoint, never from a static path. */
export function fileUrl(id: string | null | undefined): string | null {
  return id ? `/api/files/${id}` : null;
}

export function toUserSummary(
  u: Pick<UserRow, 'id' | 'username' | 'displayName' | 'avatarId' | 'headline' | 'isDemo' | 'status'>,
): UserSummary {
  const deleted = u.status === 'deleted';
  return {
    id: u.id,
    username: deleted ? 'deleted-user' : u.username,
    displayName: deleted ? 'Deleted user' : u.displayName,
    avatarUrl: deleted ? null : fileUrl(u.avatarId),
    headline: deleted ? '' : u.headline,
    isDemo: u.isDemo,
    deleted,
  };
}

export function notificationPrefsOf(u: Pick<UserRow, 'notificationPrefs'>): NotificationPrefs {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...u.notificationPrefs };
}

export function toSelfUser(u: UserRow): SelfUser {
  return {
    ...toUserSummary(u),
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
    bio: u.bio,
    disciplines: u.disciplines,
    location: u.location,
    timezone: u.timezone,
    links: u.links,
    currentProjects: u.currentProjects,
    bannerHue: u.bannerHue,
    platformRole: u.platformRole,
    presence: u.presence,
    dmPolicy: u.dmPolicy,
    notificationPrefs: notificationPrefsOf(u),
    mutedCommunityIds: u.mutedCommunityIds,
    onboardingCompleted: u.onboardingCompletedAt !== null,
    createdAt: u.createdAt,
  };
}

/** Columns needed for UserSummary — select only these when listing many users. */
export const summaryColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarId: users.avatarId,
  headline: users.headline,
  isDemo: users.isDemo,
  status: users.status,
};
