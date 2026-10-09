/** Limits shared by client-side validation and server-side enforcement. */
export const LIMITS = {
  usernameMin: 3,
  usernameMax: 32,
  displayNameMax: 48,
  passwordMin: 10,
  passwordMax: 128,
  bioMax: 600,
  headlineMax: 80,
  projectsMax: 280,
  locationMax: 64,
  profileLinksMax: 5,
  disciplinesMax: 8,
  messageMax: 4000,
  messagePageSize: 50,
  messagePageMax: 100,
  attachmentsPerMessage: 4,
  communityNameMax: 60,
  communityDescriptionMax: 500,
  communityTagsMax: 5,
  channelNameMax: 40,
  channelTopicMax: 300,
  categoryNameMax: 40,
  roleNameMax: 32,
  rolesPerCommunity: 50,
  channelsPerCommunity: 200,
  groupDmMax: 10,
  reportDetailsMax: 1000,
  reasonMax: 500,
  searchQueryMax: 200,
  waveformPeaks: 96,
  /** Longest SDP accepted in voice signalling (audio-only SDPs are a few kB). */
  voiceSdpMax: 32_000,
  voiceCandidateMax: 2_000,
} as const;

export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?$/;
export const CHANNEL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-_]*[a-z0-9])?$/;

/** Creative disciplines users can pick during onboarding / profile editing. */
export const DISCIPLINES = [
  'music-production',
  'mixing-mastering',
  'composition',
  'songwriting',
  'vocals',
  'instrumentalist',
  'sound-design',
  'game-audio',
  'game-development',
  'illustration',
  'character-design',
  'animation',
  '3d-art',
  'visual-design',
  'video-film',
  'label-management',
  'a-and-r',
  'audio-engineering',
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const COMMUNITY_TAGS = [
  'music',
  'production',
  'label',
  'game-dev',
  'game-audio',
  'illustration',
  'animation',
  '3d',
  'design',
  'collective',
  'education',
  'feedback',
] as const;
export type CommunityTag = (typeof COMMUNITY_TAGS)[number];

export const COMMUNITY_TEMPLATES = [
  'blank',
  'music-collective',
  'record-label',
  'game-studio',
  'art-collective',
] as const;
export type CommunityTemplate = (typeof COMMUNITY_TEMPLATES)[number];

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'sexual-content',
  'violence',
  'impersonation',
  'copyright',
  'scam',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const NOTIFICATION_TYPES = ['dm', 'mention', 'reply', 'invite', 'community', 'moderation', 'system'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Preference keys a user can toggle. 'system' notices cannot be disabled. */
export const NOTIFICATION_PREF_KEYS = ['dm', 'mention', 'reply', 'invite', 'community', 'moderation'] as const;
export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];

export const PRESENCE_STATUSES = ['online', 'idle', 'dnd', 'offline'] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];
/** What a user can choose; "invisible" appears as offline to others. */
export const PRESENCE_PREFERENCES = ['online', 'idle', 'dnd', 'invisible'] as const;
export type PresencePreference = (typeof PRESENCE_PREFERENCES)[number];

export const DM_POLICIES = ['everyone', 'communities', 'nobody'] as const;
export type DmPolicy = (typeof DM_POLICIES)[number];

export const REGISTRATION_MODES = ['open', 'invite', 'closed'] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export const PLATFORM_ROLES = ['member', 'moderator', 'admin'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/**
 * Curated reaction palette. A full emoji database would add ~200 KB to the
 * client bundle; the server still accepts any single emoji sequence.
 */
export const REACTION_EMOJI = [
  '🔥',
  '❤️',
  '👏',
  '🙌',
  '😂',
  '😮',
  '😢',
  '🤯',
  '👍',
  '👎',
  '💯',
  '✨',
  '🎧',
  '🎹',
  '🎸',
  '🥁',
  '🎤',
  '🎚️',
  '🎛️',
  '🎶',
  '🎵',
  '🎨',
  '🖌️',
  '🎮',
  '🕹️',
  '🚀',
  '💡',
  '👀',
  '🙏',
  '🤝',
  '✅',
  '❓',
] as const;

/** Accepted upload MIME types (validated from file signatures on the server). */
export const UPLOAD_MIME_GROUPS = {
  image: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  audio: [
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/flac',
    'audio/x-flac',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/midi',
  ],
  video: ['video/mp4', 'video/webm'],
  document: ['application/pdf', 'application/zip', 'text/plain'],
} as const;

export type UploadKind = keyof typeof UPLOAD_MIME_GROUPS;

export function uploadKindForMime(mime: string): UploadKind | null {
  for (const [kind, list] of Object.entries(UPLOAD_MIME_GROUPS) as [UploadKind, readonly string[]][]) {
    if (list.includes(mime)) return kind;
  }
  return null;
}

/** Usernames nobody can register (impersonation and mention safety). */
export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'everyone',
  'here',
  'support',
  'help',
  'moderator',
  'mod',
  'mods',
  'staff',
  'official',
  'security',
  'deleted',
  'deleted-user',
  'null',
  'undefined',
  'api',
  'www',
  'mail',
  'noreply',
  'no-reply',
  'creator-network',
  'settings',
  'invite',
  'login',
  'register',
  'me',
  'you',
  'owner',
]);
