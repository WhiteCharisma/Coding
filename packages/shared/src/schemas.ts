import { z } from 'zod';
import {
  CHANNEL_NAME_PATTERN,
  COMMUNITY_TAGS,
  COMMUNITY_TEMPLATES,
  DISCIPLINES,
  DM_POLICIES,
  LIMITS,
  NOTIFICATION_PREF_KEYS,
  PLATFORM_ROLES,
  PRESENCE_PREFERENCES,
  REGISTRATION_MODES,
  REPORT_REASONS,
  USERNAME_PATTERN,
} from './constants';
import { ALL_PERMISSIONS, CHANNEL_PERMISSIONS } from './permissions';

/** Identifiers are 26-character ULIDs (Crockford base32). */
export const idSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, { error: 'Invalid identifier' });

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(LIMITS.usernameMin, { error: `Username must be at least ${LIMITS.usernameMin} characters` })
  .max(LIMITS.usernameMax, { error: `Username must be at most ${LIMITS.usernameMax} characters` })
  .regex(USERNAME_PATTERN, {
    error: 'Use lowercase letters, numbers, dots, dashes or underscores (start and end with a letter or number)',
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: 'Enter a valid email address' }));

export const passwordSchema = z
  .string()
  .min(LIMITS.passwordMin, { error: `Password must be at least ${LIMITS.passwordMin} characters` })
  .max(LIMITS.passwordMax, { error: `Password must be at most ${LIMITS.passwordMax} characters` });

/** Strips control characters (except newlines and tabs) that have no place in user text. */
export function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '');
}

const singleLine = (max: number) =>
  z
    .string()
    .transform((v) => stripControlChars(v).replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max));

const multiLine = (max: number) =>
  z
    .string()
    .transform((v) => stripControlChars(v).replace(/\r\n?/g, '\n').trim())
    .pipe(z.string().max(max));

export const displayNameSchema = singleLine(LIMITS.displayNameMax).pipe(
  z.string().min(1, { error: 'Display name is required' }),
);

export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.username || url.password) return false;
    return url.hostname.includes('.') && url.hostname.length <= 253;
  } catch {
    return false;
  }
}

export const httpUrlSchema = z
  .string()
  .trim()
  .max(300)
  .refine(isSafeHttpUrl, { error: 'Enter a full http(s) address, e.g. https://example.com' });

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ Auth */

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  inviteCode: z.string().trim().max(64).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  login: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(LIMITS.passwordMax),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(LIMITS.passwordMax),
  newPassword: passwordSchema,
});
export const changeEmailSchema = z.object({
  password: z.string().min(1).max(LIMITS.passwordMax),
  email: emailSchema,
});
export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(LIMITS.passwordMax),
  deleteMessages: z.boolean().default(false),
});

/* --------------------------------------------------------------- Profile */

export const profileLinkSchema = z.object({
  label: singleLine(40).pipe(z.string().min(1)),
  url: httpUrlSchema,
});

export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema,
    headline: singleLine(LIMITS.headlineMax),
    bio: multiLine(LIMITS.bioMax),
    disciplines: z.array(z.enum(DISCIPLINES)).max(LIMITS.disciplinesMax),
    location: singleLine(LIMITS.locationMax),
    timezone: z
      .string()
      .max(64)
      .refine((v) => v === '' || isValidTimeZone(v), { error: 'Unknown time zone' }),
    links: z.array(profileLinkSchema).max(LIMITS.profileLinksMax),
    currentProjects: multiLine(LIMITS.projectsMax),
    bannerHue: z.number().int().min(0).max(360).nullable(),
  })
  .partial();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const notificationPrefsSchema = z
  .object(
    Object.fromEntries(NOTIFICATION_PREF_KEYS.map((k) => [k, z.boolean()])) as Record<
      (typeof NOTIFICATION_PREF_KEYS)[number],
      z.ZodBoolean
    >,
  )
  .partial();

export const updatePreferencesSchema = z
  .object({
    presence: z.enum(PRESENCE_PREFERENCES),
    dmPolicy: z.enum(DM_POLICIES),
    notificationPrefs: notificationPrefsSchema,
    mutedCommunityIds: z.array(idSchema).max(200),
  })
  .partial();

/* ------------------------------------------------------------ Communities */

export const communityNameSchema = singleLine(LIMITS.communityNameMax).pipe(
  z.string().min(2, { error: 'Name must be at least 2 characters' }),
);

export const createCommunitySchema = z.object({
  name: communityNameSchema,
  description: multiLine(LIMITS.communityDescriptionMax).default(''),
  visibility: z.enum(['public', 'private']).default('private'),
  template: z.enum(COMMUNITY_TEMPLATES).default('blank'),
  tags: z.array(z.enum(COMMUNITY_TAGS)).max(LIMITS.communityTagsMax).default([]),
});

export const updateCommunitySchema = z
  .object({
    name: communityNameSchema,
    description: multiLine(LIMITS.communityDescriptionMax),
    visibility: z.enum(['public', 'private']),
    tags: z.array(z.enum(COMMUNITY_TAGS)).max(LIMITS.communityTagsMax),
  })
  .partial();

export const channelNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/\s+/g, '-').replace(/-{2,}/g, '-'))
  .pipe(
    z
      .string()
      .min(1, { error: 'Channel name is required' })
      .max(LIMITS.channelNameMax)
      .regex(CHANNEL_NAME_PATTERN, { error: 'Use lowercase letters, numbers, dashes or underscores' }),
  );

export const createCategorySchema = z.object({
  name: singleLine(LIMITS.categoryNameMax).pipe(z.string().min(1)),
});
export const updateCategorySchema = z
  .object({
    name: singleLine(LIMITS.categoryNameMax).pipe(z.string().min(1)),
    position: z.number().int().min(0).max(10_000),
  })
  .partial();

export const createChannelSchema = z.object({
  name: channelNameSchema,
  topic: multiLine(LIMITS.channelTopicMax).default(''),
  categoryId: idSchema.nullable().default(null),
  isPrivate: z.boolean().default(false),
  /** Roles granted access when the channel is private. */
  allowedRoleIds: z.array(idSchema).max(LIMITS.rolesPerCommunity).default([]),
});

export const updateChannelSchema = z
  .object({
    name: channelNameSchema,
    topic: multiLine(LIMITS.channelTopicMax),
    categoryId: idSchema.nullable(),
    position: z.number().int().min(0).max(10_000),
  })
  .partial();

export const channelOverwriteSchema = z.object({
  targetType: z.enum(['role', 'member']),
  targetId: idSchema,
  allow: z
    .number()
    .int()
    .min(0)
    .refine((v) => (v & ~CHANNEL_PERMISSIONS) === 0, { error: 'Only channel permissions can be overridden' }),
  deny: z
    .number()
    .int()
    .min(0)
    .refine((v) => (v & ~CHANNEL_PERMISSIONS) === 0, { error: 'Only channel permissions can be overridden' }),
});

export const roleColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: 'Use a hex color like #f0b45a' });

export const createRoleSchema = z.object({
  name: singleLine(LIMITS.roleNameMax).pipe(z.string().min(1)),
  color: roleColorSchema.nullable().default(null),
  permissions: z
    .number()
    .int()
    .min(0)
    .refine((v) => (v & ~ALL_PERMISSIONS) === 0, { error: 'Unknown permission bits' })
    .default(0),
  hoist: z.boolean().default(false),
});

export const updateRoleSchema = z
  .object({
    name: singleLine(LIMITS.roleNameMax).pipe(z.string().min(1)),
    color: roleColorSchema.nullable(),
    permissions: z
      .number()
      .int()
      .min(0)
      .refine((v) => (v & ~ALL_PERMISSIONS) === 0, { error: 'Unknown permission bits' }),
    hoist: z.boolean(),
  })
  .partial();

export const moveRoleSchema = z.object({ direction: z.enum(['up', 'down']) });

export const setMemberRolesSchema = z.object({
  roleIds: z.array(idSchema).max(LIMITS.rolesPerCommunity),
});

export const createInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(10_000).nullable().default(null),
  /** null = never expires. */
  expiresInHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .nullable()
    .default(24 * 7),
  targetUsername: usernameSchema.optional(),
});

export const moderationReasonSchema = z.object({
  reason: multiLine(LIMITS.reasonMax).default(''),
});

export const transferOwnershipSchema = z.object({
  userId: idSchema,
  password: z.string().min(1).max(LIMITS.passwordMax),
});

export const deleteCommunitySchema = z.object({
  password: z.string().min(1).max(LIMITS.passwordMax),
  confirmName: z.string().max(LIMITS.communityNameMax + 10),
});

/* --------------------------------------------------------------- Messages */

export const messageContentSchema = z
  .string()
  .transform((v) =>
    stripControlChars(v)
      .replace(/\r\n?/g, '\n')
      .replace(/^\n+|\s+$/g, ''),
  )
  .pipe(z.string().max(LIMITS.messageMax, { error: `Messages can be at most ${LIMITS.messageMax} characters` }));

export const nonceSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, { error: 'Invalid nonce' });

export const sendMessageSchema = z
  .object({
    content: messageContentSchema,
    nonce: nonceSchema,
    replyToId: idSchema.nullable().optional(),
    attachmentIds: z.array(idSchema).max(LIMITS.attachmentsPerMessage).default([]),
  })
  .refine((v) => v.content.length > 0 || v.attachmentIds.length > 0, {
    error: 'Message cannot be empty',
    path: ['content'],
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  content: messageContentSchema.pipe(z.string().min(1, { error: 'Message cannot be empty' })),
});

const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Component}|‍|️|⃣)+$/u;
const EMOJI_REQUIRED_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
export function isEmoji(value: string): boolean {
  return value.length > 0 && value.length <= 32 && EMOJI_RE.test(value) && EMOJI_REQUIRED_RE.test(value);
}
export const reactionSchema = z.object({
  emoji: z.string().refine(isEmoji, { error: 'Reactions must be a single emoji' }),
});

export const historyQuerySchema = z.object({
  before: idSchema.optional(),
  after: idSchema.optional(),
  around: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.messagePageMax).default(LIMITS.messagePageSize),
});

export const readStateSchema = z.object({ messageId: idSchema });

/* -------------------------------------------------------------------- DMs */

export const createDmSchema = z.object({
  userIds: z
    .array(idSchema)
    .min(1)
    .max(LIMITS.groupDmMax - 1),
  name: singleLine(LIMITS.channelNameMax).optional(),
});
export const updateGroupDmSchema = z.object({
  name: singleLine(LIMITS.channelNameMax),
});
export const addParticipantsSchema = z.object({
  userIds: z
    .array(idSchema)
    .min(1)
    .max(LIMITS.groupDmMax - 1),
});

/* ----------------------------------------------------------------- Search */

export const searchQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.searchQueryMax).default(''),
  communityId: idSchema.optional(),
  channelId: idSchema.optional(),
  author: usernameSchema.optional(),
  has: z.enum(['file', 'image', 'audio', 'link']).optional(),
  from: z.coerce.number().int().min(0).optional(),
  to: z.coerce.number().int().min(0).optional(),
  before: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

/* ------------------------------------------------------------- Moderation */

export const createReportSchema = z.object({
  targetType: z.enum(['message', 'user', 'community']),
  targetId: idSchema,
  reason: z.enum(REPORT_REASONS),
  details: multiLine(LIMITS.reportDetailsMax).default(''),
});

export const resolveReportSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
  note: multiLine(LIMITS.reasonMax).default(''),
  action: z.enum(['none', 'delete_message', 'warn_user', 'suspend_user']).default('none'),
  suspendDays: z.number().int().min(1).max(3650).nullable().optional(),
});

/* ------------------------------------------------------------------ Admin */

export const adminSuspendSchema = z.object({
  reason: multiLine(LIMITS.reasonMax).pipe(z.string().min(3, { error: 'Give a reason the user will see' })),
  /** null = indefinite */
  days: z.number().int().min(1).max(3650).nullable(),
});
export const adminSetRoleSchema = z.object({ role: z.enum(PLATFORM_ROLES) });

export const adminSettingsSchema = z
  .object({
    registrationMode: z.enum(REGISTRATION_MODES),
    requireEmailVerification: z.boolean(),
    maxUploadMb: z.number().int().min(1).max(100),
    communityCreation: z.enum(['everyone', 'admins']),
    appealContact: singleLine(200),
    instanceName: singleLine(40).pipe(z.string().min(2)),
    welcomeMessage: multiLine(300),
  })
  .partial();
export type AdminSettingsInput = z.infer<typeof adminSettingsSchema>;

export const platformInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(10_000).nullable().default(1),
  expiresInHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 90)
    .nullable()
    .default(24 * 7),
  note: singleLine(120).default(''),
});
