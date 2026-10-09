import type { MessageDTO, SelfUser } from '@creator-network/shared';

/** Sortable id like the server's ULIDs (same length, lexicographic order = numeric order). */
export const idFor = (n: number) => `01${String(n).padStart(24, '0')}`;

export function message(n: number, patch: Partial<MessageDTO> = {}): MessageDTO {
  return {
    id: idFor(n),
    channelId: 'chan',
    author: {
      id: 'u1',
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      headline: '',
      isDemo: false,
      deleted: false,
    },
    content: `message ${n}`,
    kind: 'default',
    replyTo: null,
    attachments: [],
    reactions: [],
    mentions: [],
    mentionEveryone: false,
    editedAt: null,
    deletedAt: null,
    pinnedAt: null,
    createdAt: 1_700_000_000_000 + n * 1000,
    nonce: null,
    ...patch,
  };
}

/** Messages a..b inclusive, oldest first. */
export const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => message(a + i));

export function selfUser(patch: Partial<SelfUser> = {}): SelfUser {
  return {
    id: 'u1',
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    headline: '',
    isDemo: false,
    deleted: false,
    email: 'alice@example.test',
    emailVerified: true,
    bio: '',
    disciplines: [],
    location: '',
    timezone: 'UTC',
    links: [],
    currentProjects: '',
    bannerHue: null,
    platformRole: 'member',
    presence: 'online',
    dmPolicy: 'everyone',
    notificationPrefs: { dm: true, mention: true, reply: true, invite: true, community: true, moderation: true },
    mutedCommunityIds: [],
    onboardingCompleted: true,
    createdAt: 1_700_000_000_000,
    ...patch,
  };
}
