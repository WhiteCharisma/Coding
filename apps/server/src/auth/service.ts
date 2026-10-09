import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
  RESERVED_USERNAMES,
  type changeEmailSchema,
  type changePasswordSchema,
  type RegisterInput,
} from '@creator-network/shared';
import type { z } from 'zod';
import { audit } from '../audit';
import type { AppContext } from '../context';
import { newId } from '../db/ids';
import {
  channelParticipants,
  channels,
  communities,
  communityMembers,
  emailTokens,
  invites,
  messages,
  notifications,
  readStates,
  registrationInvites,
  uploads,
  userBlocks,
  users,
} from '../db/schema';
import { randomToken, sha256 } from '../lib/crypto';
import { AppError, badRequest, conflict, forbidden, tooMany, unavailable } from '../lib/errors';
import { hashPassword, isCommonPassword, needsRehash, verifyAgainstDummy, verifyPassword } from '../lib/password';
import type { UserRow } from '../users/dto';
import { revokeUserSessions } from './sessions';

const VERIFY_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/* ------------------------------------------------------- Login throttling */

interface FailureRecord {
  count: number;
  firstAt: number;
  lockedUntil: number;
}
const LOCK_THRESHOLD = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const failures = new Map<string, FailureRecord>();

function checkLock(key: string): void {
  const rec = failures.get(key);
  if (rec && rec.lockedUntil > Date.now()) {
    throw tooMany(
      'Too many failed sign-in attempts. Try again in a few minutes or reset your password.',
      'login_locked',
    );
  }
}

function recordFailure(key: string): void {
  const now = Date.now();
  let rec = failures.get(key);
  if (!rec || now - rec.firstAt > LOCK_WINDOW_MS) rec = { count: 0, firstAt: now, lockedUntil: 0 };
  rec.count++;
  if (rec.count >= LOCK_THRESHOLD) rec.lockedUntil = now + LOCK_DURATION_MS;
  failures.set(key, rec);
  // Bound memory: drop stale entries opportunistically.
  if (failures.size > 10_000) {
    for (const [k, v] of failures) if (now - v.firstAt > LOCK_WINDOW_MS && v.lockedUntil < now) failures.delete(k);
  }
}

export function resetLoginThrottle(): void {
  failures.clear();
}

/* ------------------------------------------------------------ Validation */

function assertPasswordAcceptable(password: string, username: string, email: string): void {
  const lower = password.toLowerCase();
  if (isCommonPassword(password) || lower === username || lower === email || lower.includes(username)) {
    throw badRequest(
      'Choose a less predictable password.',
      { issues: [{ path: 'password', message: 'Too common or contains your username' }] },
      'weak_password',
    );
  }
}

function normaliseInviteCode(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const trimmed = code.trim();
  // Accept full invite links as well as bare codes.
  const match = /(?:\/invite\/)?([A-Za-z0-9]{6,32})\/?$/.exec(trimmed);
  return match?.[1];
}

/** Checks a code against registration invites and community invites (either unlocks invite-only signup). */
function findUsableInvite(ctx: AppContext, code: string): { kind: 'registration' | 'community'; code: string } | null {
  const now = Date.now();
  const reg = ctx.db.select().from(registrationInvites).where(eq(registrationInvites.code, code)).get();
  if (
    reg &&
    !reg.revokedAt &&
    (reg.expiresAt === null || reg.expiresAt > now) &&
    (reg.maxUses === null || reg.uses < reg.maxUses)
  ) {
    return { kind: 'registration', code };
  }
  const inv = ctx.db.select().from(invites).where(eq(invites.code, code)).get();
  if (
    inv &&
    !inv.revokedAt &&
    !inv.targetUserId &&
    (inv.expiresAt === null || inv.expiresAt > now) &&
    (inv.maxUses === null || inv.uses < inv.maxUses)
  ) {
    return { kind: 'community', code };
  }
  return null;
}

/* ---------------------------------------------------------- Registration */

export async function register(ctx: AppContext, input: RegisterInput): Promise<UserRow> {
  const settings = ctx.settings.get();
  if (settings.registrationMode === 'closed') {
    throw forbidden('Registration is currently closed on this server.', 'registration_closed');
  }
  const inviteCode = normaliseInviteCode(input.inviteCode);
  let invite: ReturnType<typeof findUsableInvite> = null;
  if (settings.registrationMode === 'invite') {
    invite = inviteCode ? findUsableInvite(ctx, inviteCode) : null;
    if (!invite) throw forbidden('An invitation is required to join this server.', 'invite_required');
  }
  if (RESERVED_USERNAMES.has(input.username) || input.username.startsWith('deleted-')) {
    throw conflict('That username is not available.', 'username_taken');
  }
  assertPasswordAcceptable(input.password, input.username, input.email);

  const existing = ctx.db
    .select({ username: users.username, email: users.email })
    .from(users)
    .where(or(eq(users.username, input.username), eq(users.email, input.email)))
    .all();
  if (existing.some((u) => u.username === input.username)) {
    throw conflict('That username is already taken.', 'username_taken');
  }
  if (existing.some((u) => u.email === input.email)) {
    // Generic wording: do not confirm which accounts exist.
    throw conflict(
      'We could not create an account with these details. If you already have an account, sign in or reset your password.',
      'account_exists',
    );
  }

  const passwordHash = await hashPassword(input.password);
  const now = Date.now();
  const user: UserRow = {
    id: newId(now),
    username: input.username,
    email: input.email,
    emailVerifiedAt: null,
    passwordHash,
    displayName: input.displayName,
    avatarId: null,
    headline: '',
    bio: '',
    disciplines: [],
    location: '',
    timezone: '',
    links: [],
    currentProjects: '',
    bannerHue: null,
    platformRole: 'member',
    status: 'active',
    suspendedUntil: null,
    suspensionReason: null,
    presence: 'online',
    dmPolicy: 'everyone',
    notificationPrefs: {},
    mutedCommunityIds: [],
    onboardingCompletedAt: null,
    isDemo: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  try {
    ctx.db.transaction((tx) => {
      tx.insert(users).values(user).run();
      if (invite?.kind === 'registration') {
        tx.update(registrationInvites)
          .set({ uses: sqlIncrement(registrationInvites.uses) })
          .where(eq(registrationInvites.code, invite.code))
          .run();
      }
    });
  } catch (err) {
    // A concurrent registration may have taken the username/email between the check and the insert.
    if (err instanceof Error && /UNIQUE/.test(err.message)) {
      throw conflict('That username or email is not available.', 'username_taken');
    }
    throw err;
  }

  if (ctx.mailer.enabled) {
    sendVerificationEmail(ctx, user).catch((e: unknown) =>
      ctx.log.error({ err: e }, 'failed to send verification email'),
    );
  }
  return user;
}

function sqlIncrement(col: SQLiteColumn) {
  return sql`${col} + 1`;
}

/* ----------------------------------------------------------------- Login */

export interface LoginResult {
  user: UserRow;
}

export async function login(ctx: AppContext, loginValue: string, password: string): Promise<LoginResult> {
  const key = loginValue.toLowerCase();
  checkLock(key);
  const user = ctx.db
    .select()
    .from(users)
    .where(loginValue.includes('@') ? eq(users.email, key) : eq(users.username, key))
    .get();

  const invalid = () => new AppError(401, 'invalid_credentials', 'Incorrect username/email or password.');

  if (!user || user.status === 'deleted') {
    await verifyAgainstDummy(password);
    recordFailure(key);
    throw invalid();
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    recordFailure(key);
    throw invalid();
  }
  failures.delete(key);

  if (user.status === 'suspended') {
    const now = Date.now();
    if (user.suspendedUntil !== null && user.suspendedUntil <= now) {
      ctx.db
        .update(users)
        .set({ status: 'active', suspendedUntil: null, suspensionReason: null, updatedAt: now })
        .where(eq(users.id, user.id))
        .run();
      audit(ctx.db, {
        scope: 'platform',
        actorId: null,
        action: 'user.suspension_expired',
        targetType: 'user',
        targetId: user.id,
        targetLabel: user.username,
      });
      user.status = 'active';
    } else {
      // Only revealed after a correct password, so this does not enable enumeration.
      throw new AppError(403, 'account_suspended', 'This account is suspended.', {
        reason: user.suspensionReason ?? '',
        until: user.suspendedUntil,
        appealContact: ctx.settings.get().appealContact,
      });
    }
  }

  if (needsRehash(user.passwordHash)) {
    const passwordHash = await hashPassword(password);
    ctx.db.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
  }
  return { user };
}

/* ------------------------------------------------------ Email verification */

function issueToken(
  ctx: AppContext,
  userId: string,
  purpose: 'verify_email' | 'reset_password',
  email: string,
  ttl: number,
): string {
  const token = randomToken(32);
  const now = Date.now();
  ctx.db.transaction((tx) => {
    // Only the newest token of each purpose stays valid.
    tx.update(emailTokens)
      .set({ usedAt: now })
      .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt)))
      .run();
    tx.insert(emailTokens)
      .values({
        id: newId(now),
        userId,
        purpose,
        tokenHash: sha256(token),
        email,
        createdAt: now,
        expiresAt: now + ttl,
      })
      .run();
  });
  return token;
}

export async function sendVerificationEmail(ctx: AppContext, user: UserRow): Promise<void> {
  if (!ctx.mailer.enabled) throw unavailable('Email delivery is not configured on this server.', 'email_unavailable');
  const token = issueToken(ctx, user.id, 'verify_email', user.email, VERIFY_TOKEN_TTL_MS);
  const link = `${ctx.config.appOrigin}/verify-email?token=${encodeURIComponent(token)}`;
  const name = ctx.settings.get().instanceName;
  await ctx.mailer.send({
    to: user.email,
    subject: `Confirm your email for ${name}`,
    text: `Hi ${user.displayName},\n\nConfirm your email address for ${name} by opening this link:\n\n${link}\n\nThe link expires in 48 hours. If you did not create an account, you can ignore this email.\n`,
  });
}

export function verifyEmail(ctx: AppContext, token: string): UserRow {
  const now = Date.now();
  const row = ctx.db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, sha256(token)), eq(emailTokens.purpose, 'verify_email')))
    .get();
  if (!row || row.usedAt !== null || row.expiresAt <= now) {
    throw badRequest('This verification link is invalid or has expired.', undefined, 'invalid_token');
  }
  const user = ctx.db.select().from(users).where(eq(users.id, row.userId)).get();
  if (!user || user.status === 'deleted' || user.email !== row.email) {
    throw badRequest('This verification link is invalid or has expired.', undefined, 'invalid_token');
  }
  ctx.db.transaction((tx) => {
    tx.update(emailTokens).set({ usedAt: now }).where(eq(emailTokens.id, row.id)).run();
    tx.update(users).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(users.id, user.id)).run();
  });
  return { ...user, emailVerifiedAt: now };
}

/* -------------------------------------------------------- Password reset */

const resetRequests = new Map<string, number[]>();

export async function requestPasswordReset(ctx: AppContext, email: string): Promise<void> {
  if (!ctx.mailer.enabled) {
    throw unavailable(
      'Password recovery by email is not available on this server. Contact an administrator.',
      'email_unavailable',
    );
  }
  // Per-address throttle (in addition to the per-IP route limit): 3 per hour.
  const now = Date.now();
  const recent = (resetRequests.get(email) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= 3) return; // Silently drop: response stays identical.
  recent.push(now);
  resetRequests.set(email, recent);

  const user = ctx.db.select().from(users).where(eq(users.email, email)).get();
  if (!user || user.status !== 'active') return; // Same response either way (no enumeration).
  const token = issueToken(ctx, user.id, 'reset_password', user.email, RESET_TOKEN_TTL_MS);
  const link = `${ctx.config.appOrigin}/reset-password?token=${encodeURIComponent(token)}`;
  const name = ctx.settings.get().instanceName;
  await ctx.mailer.send({
    to: user.email,
    subject: `Reset your ${name} password`,
    text: `Hi ${user.displayName},\n\nSomeone (hopefully you) asked to reset the password for your ${name} account.\nOpen this link to choose a new password:\n\n${link}\n\nThe link expires in 1 hour and can be used once. If you did not ask for this, ignore this email — your password stays the same.\n`,
  });
}

/** Admin tool for servers without email: returns a one-time reset link. */
export function createPasswordResetLink(ctx: AppContext, userId: string): string {
  const user = ctx.db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.status === 'deleted') throw badRequest('User not found');
  const token = issueToken(ctx, user.id, 'reset_password', user.email, RESET_TOKEN_TTL_MS);
  return `${ctx.config.appOrigin}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function resetPassword(ctx: AppContext, token: string, password: string): Promise<UserRow> {
  const now = Date.now();
  const row = ctx.db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, sha256(token)), eq(emailTokens.purpose, 'reset_password')))
    .get();
  if (!row || row.usedAt !== null || row.expiresAt <= now) {
    throw badRequest('This reset link is invalid or has expired. Request a new one.', undefined, 'invalid_token');
  }
  const user = ctx.db.select().from(users).where(eq(users.id, row.userId)).get();
  if (!user || user.status === 'deleted') {
    throw badRequest('This reset link is invalid or has expired. Request a new one.', undefined, 'invalid_token');
  }
  assertPasswordAcceptable(password, user.username, user.email);
  const passwordHash = await hashPassword(password);
  // Mark used first (single-use even under concurrent requests: the update is conditional).
  const claimed = ctx.db
    .update(emailTokens)
    .set({ usedAt: now })
    .where(and(eq(emailTokens.id, row.id), isNull(emailTokens.usedAt)))
    .run();
  if (claimed.changes !== 1) {
    throw badRequest('This reset link is invalid or has expired. Request a new one.', undefined, 'invalid_token');
  }
  ctx.db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id)).run();
  // Reset proves control of the email address.
  if (user.emailVerifiedAt === null && row.email === user.email) {
    ctx.db.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, user.id)).run();
  }
  audit(ctx.db, {
    scope: 'platform',
    actorId: user.id,
    action: 'user.password_reset',
    targetType: 'user',
    targetId: user.id,
    targetLabel: user.username,
  });
  failures.delete(user.username);
  failures.delete(user.email);
  return user;
}

/* -------------------------------------------------------- Account changes */

export async function changePassword(
  ctx: AppContext,
  user: UserRow,
  input: z.infer<typeof changePasswordSchema>,
): Promise<void> {
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError(400, 'invalid_password', 'Your current password is incorrect.');
  }
  assertPasswordAcceptable(input.newPassword, user.username, user.email);
  const passwordHash = await hashPassword(input.newPassword);
  ctx.db.update(users).set({ passwordHash, updatedAt: Date.now() }).where(eq(users.id, user.id)).run();
  audit(ctx.db, {
    scope: 'platform',
    actorId: user.id,
    action: 'user.password_changed',
    targetType: 'user',
    targetId: user.id,
    targetLabel: user.username,
  });
}

export async function changeEmail(
  ctx: AppContext,
  user: UserRow,
  input: z.infer<typeof changeEmailSchema>,
): Promise<UserRow> {
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw new AppError(400, 'invalid_password', 'Your password is incorrect.');
  }
  if (input.email === user.email) return user;
  const taken = ctx.db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get();
  if (taken) throw conflict('That email address cannot be used.', 'email_unavailable');
  const now = Date.now();
  ctx.db
    .update(users)
    .set({ email: input.email, emailVerifiedAt: null, updatedAt: now })
    .where(eq(users.id, user.id))
    .run();
  const updated = { ...user, email: input.email, emailVerifiedAt: null, updatedAt: now };
  if (ctx.mailer.enabled) {
    sendVerificationEmail(ctx, updated).catch((e: unknown) =>
      ctx.log.error({ err: e }, 'failed to send verification email'),
    );
  }
  return updated;
}

/**
 * Deletes (anonymises) an account. See docs/ARCHITECTURE.md → Data retention.
 */
export async function deleteAccount(
  ctx: AppContext,
  user: UserRow,
  password: string,
  deleteMessages: boolean,
): Promise<void> {
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw new AppError(400, 'invalid_password', 'Your password is incorrect.');
  }
  const owned = ctx.db
    .select({ id: communities.id, name: communities.name })
    .from(communities)
    .where(eq(communities.ownerId, user.id))
    .all();
  if (owned.length > 0) {
    throw new AppError(
      409,
      'owns_communities',
      'Transfer or delete the communities you own before deleting your account.',
      {
        communities: owned,
      },
    );
  }
  await anonymiseUser(ctx, user.id, { deleteMessages, actorId: user.id, action: 'user.self_deleted' });
}

export async function anonymiseUser(
  ctx: AppContext,
  userId: string,
  opts: { deleteMessages: boolean; actorId: string | null; action: string },
): Promise<void> {
  const user = ctx.db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.status === 'deleted') return;
  const now = Date.now();
  const tombstone = `deleted-${user.id.slice(-10).toLowerCase()}`;
  const placeholderHash = await hashPassword(randomToken(24));

  const groupDms = ctx.db
    .select({ channelId: channelParticipants.channelId })
    .from(channelParticipants)
    .innerJoin(channels, eq(channels.id, channelParticipants.channelId))
    .where(and(eq(channelParticipants.userId, user.id), eq(channels.kind, 'group_dm')))
    .all()
    .map((r) => r.channelId);

  const memberships = ctx.db
    .select({ communityId: communityMembers.communityId })
    .from(communityMembers)
    .where(eq(communityMembers.userId, user.id))
    .all()
    .map((m) => m.communityId);

  ctx.db.transaction((tx) => {
    tx.update(users)
      .set({
        username: tombstone,
        email: `${tombstone}@deleted.invalid`,
        emailVerifiedAt: null,
        passwordHash: placeholderHash,
        displayName: 'Deleted user',
        avatarId: null,
        headline: '',
        bio: '',
        disciplines: [],
        location: '',
        timezone: '',
        links: [],
        currentProjects: '',
        bannerHue: null,
        platformRole: 'member',
        status: 'deleted',
        suspendedUntil: null,
        suspensionReason: null,
        notificationPrefs: {},
        mutedCommunityIds: [],
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, user.id))
      .run();
    tx.update(uploads)
      .set({ status: 'deleted' })
      .where(and(eq(uploads.uploaderId, user.id), inArray(uploads.purpose, ['avatar'])))
      .run();
    tx.delete(communityMembers).where(eq(communityMembers.userId, user.id)).run();
    for (const communityId of memberships) {
      tx.update(communities)
        .set({ memberCount: sql`max(${communities.memberCount} - 1, 0)` })
        .where(eq(communities.id, communityId))
        .run();
    }
    if (groupDms.length > 0) {
      tx.delete(channelParticipants)
        .where(and(eq(channelParticipants.userId, user.id), inArray(channelParticipants.channelId, groupDms)))
        .run();
    }
    tx.delete(readStates).where(eq(readStates.userId, user.id)).run();
    tx.delete(notifications).where(eq(notifications.userId, user.id)).run();
    tx.delete(userBlocks)
      .where(or(eq(userBlocks.blockerId, user.id), eq(userBlocks.blockedId, user.id)))
      .run();
    tx.delete(emailTokens).where(eq(emailTokens.userId, user.id)).run();
    tx.delete(invites).where(eq(invites.targetUserId, user.id)).run();
    audit(tx, {
      scope: 'platform',
      actorId: opts.actorId,
      action: opts.action,
      targetType: 'user',
      targetId: user.id,
      targetLabel: user.username,
      metadata: { deleteMessages: opts.deleteMessages },
    });
  });

  // Sessions last: revoking also disconnects sockets.
  revokeUserSessions(ctx, user.id);

  if (opts.deleteMessages) {
    // Blank messages in small batches so the write lock is never held for long.
    for (;;) {
      const batch = ctx.db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.authorId, user.id), isNull(messages.deletedAt)))
        .limit(500)
        .all()
        .map((m) => m.id);
      if (batch.length === 0) break;
      ctx.db.transaction((tx) => {
        tx.update(messages)
          .set({ content: '', deletedAt: now, updatedAt: now, pinnedAt: null, pinnedBy: null })
          .where(inArray(messages.id, batch))
          .run();
        tx.update(uploads).set({ status: 'deleted' }).where(inArray(uploads.messageId, batch)).run();
      });
      await new Promise((r) => setImmediate(r));
    }
  }
  for (const communityId of memberships) ctx.realtime.syncCommunity(communityId);
}
