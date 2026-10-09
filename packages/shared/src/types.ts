import type {
  CommunityTag,
  Discipline,
  DmPolicy,
  NotificationPrefKey,
  NotificationType,
  PlatformRole,
  PresencePreference,
  PresenceStatus,
  RegistrationMode,
  ReportReason,
  UploadKind,
} from './constants';

/** Timestamps are milliseconds since the Unix epoch. */
export type Timestamp = number;

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string;
  isDemo: boolean;
  /** Deleted accounts are rendered as "Deleted user". */
  deleted: boolean;
}

export interface ProfileLink {
  label: string;
  url: string;
}

export interface UserProfile extends UserSummary {
  bio: string;
  disciplines: Discipline[];
  location: string;
  timezone: string;
  links: ProfileLink[];
  currentProjects: string;
  bannerHue: number | null;
  createdAt: Timestamp;
  platformRole: PlatformRole;
  mutualCommunities: { id: string; name: string; iconUrl: string | null }[];
  isBlocked: boolean;
  canMessage: boolean;
}

export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

export interface SelfUser extends UserSummary {
  email: string;
  emailVerified: boolean;
  bio: string;
  disciplines: Discipline[];
  location: string;
  timezone: string;
  links: ProfileLink[];
  currentProjects: string;
  bannerHue: number | null;
  platformRole: PlatformRole;
  presence: PresencePreference;
  dmPolicy: DmPolicy;
  notificationPrefs: NotificationPrefs;
  mutedCommunityIds: string[];
  onboardingCompleted: boolean;
  createdAt: Timestamp;
}

export interface PublicConfig {
  instanceName: string;
  welcomeMessage: string;
  registrationMode: RegistrationMode;
  emailEnabled: boolean;
  requireEmailVerification: boolean;
  maxUploadMb: number;
  communityCreation: 'everyone' | 'admins';
  appealContact: string;
  version: string;
  /** Voice rooms: whether they are on, how many people fit, the highest bitrate allowed. */
  voice: { enabled: boolean; maxParticipants: number; maxBitrate: number };
}

export interface SessionInfo {
  id: string;
  current: boolean;
  userAgent: string;
  ip: string;
  createdAt: Timestamp;
  lastSeenAt: Timestamp;
  expiresAt: Timestamp;
}

export interface RoleDTO {
  id: string;
  name: string;
  color: string | null;
  position: number;
  permissions: number;
  isDefault: boolean;
  hoist: boolean;
  memberCount?: number;
}

export interface OverwriteDTO {
  targetType: 'role' | 'member';
  targetId: string;
  allow: number;
  deny: number;
}

export interface CategoryDTO {
  id: string;
  name: string;
  position: number;
}

export type ChannelKind = 'text' | 'dm' | 'group_dm';

export interface ChannelDTO {
  id: string;
  kind: ChannelKind;
  communityId: string | null;
  categoryId: string | null;
  name: string;
  topic: string;
  position: number;
  isPrivate: boolean;
  lastMessageId: string | null;
  lastMessageAt: Timestamp | null;
  /** Effective permissions of the requesting user (UI hint only — enforced on server). */
  myPermissions: number;
}

export interface DmChannelDTO extends ChannelDTO {
  ownerId: string | null;
  participants: UserSummary[];
  lastMessagePreview: string | null;
}

export interface CommunitySummary {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  visibility: 'public' | 'private';
  tags: CommunityTag[];
  memberCount: number;
  isDemo: boolean;
  createdAt: Timestamp;
}

export interface CommunityDTO extends CommunitySummary {
  ownerId: string;
  categories: CategoryDTO[];
  channels: ChannelDTO[];
  roles: RoleDTO[];
  myRoleIds: string[];
  myPermissions: number;
  everyoneRoleId: string;
}

export interface MemberDTO {
  user: UserSummary;
  roleIds: string[];
  joinedAt: Timestamp;
  presence: PresenceStatus;
}

export interface UnreadState {
  channelId: string;
  lastReadId: string | null;
  unread: number;
  mentions: number;
}

export interface BootstrapDTO {
  user: SelfUser;
  config: PublicConfig;
  communities: CommunityDTO[];
  dms: DmChannelDTO[];
  unreads: UnreadState[];
  unreadNotifications: number;
}

export interface AttachmentDTO {
  id: string;
  kind: UploadKind;
  name: string;
  mime: string;
  size: number;
  url: string;
  /** Small WebP version for showing images in the chat (null: show `url` as it is). */
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  waveform: number[] | null;
}

export interface ReactionDTO {
  emoji: string;
  count: number;
  me: boolean;
}

export interface MessageReplyDTO {
  id: string;
  author: UserSummary | null;
  content: string;
  deleted: boolean;
  attachmentCount: number;
}

export interface MessageDTO {
  id: string;
  channelId: string;
  author: UserSummary | null;
  content: string;
  kind: 'default' | 'system';
  replyTo: MessageReplyDTO | null;
  attachments: AttachmentDTO[];
  reactions: ReactionDTO[];
  mentions: { id: string; username: string }[];
  mentionEveryone: boolean;
  editedAt: Timestamp | null;
  deletedAt: Timestamp | null;
  pinnedAt: Timestamp | null;
  createdAt: Timestamp;
  nonce: string | null;
}

export interface MessagePage {
  messages: MessageDTO[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  actor: UserSummary | null;
  communityId: string | null;
  communityName: string | null;
  channelId: string | null;
  channelName: string | null;
  messageId: string | null;
  /** Short text preview or structured info, depending on type. */
  data: Record<string, unknown>;
  count: number;
  readAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InviteDTO {
  code: string;
  communityId: string;
  inviter: UserSummary | null;
  maxUses: number | null;
  uses: number;
  expiresAt: Timestamp | null;
  revokedAt: Timestamp | null;
  createdAt: Timestamp;
  targetUser: UserSummary | null;
}

export interface InvitePreviewDTO {
  code: string;
  community: CommunitySummary;
  inviter: UserSummary | null;
  expiresAt: Timestamp | null;
  alreadyMember: boolean;
}

export interface AuditEventDTO {
  id: string;
  scope: 'platform' | 'community';
  communityId: string | null;
  actor: UserSummary | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: Timestamp;
}

export interface ReportDTO {
  id: string;
  reporter: UserSummary | null;
  targetType: 'message' | 'user' | 'community';
  targetId: string;
  reason: ReportReason;
  details: string;
  snapshot: Record<string, unknown>;
  status: 'open' | 'resolved' | 'dismissed';
  resolvedBy: UserSummary | null;
  resolutionNote: string;
  resolvedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface SearchResultDTO {
  message: MessageDTO;
  channelName: string;
  channelKind: ChannelKind;
  communityId: string | null;
  communityName: string | null;
  /** Content with matched terms wrapped in \u0001 … \u0002 markers (rendered safely by the client). */
  highlight: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/* ---------------------------------------------------------- Socket events */

export interface TypingEvent {
  channelId: string;
  userId: string;
  displayName: string;
}

export interface ReactionEvent {
  messageId: string;
  channelId: string;
  emoji: string;
  userId: string;
  added: boolean;
  count: number;
}

export interface PresenceEvent {
  userId: string;
  status: PresenceStatus;
}

export interface ReadStateEvent {
  channelId: string;
  lastReadId: string;
}

export type SendAck =
  { ok: true; message: MessageDTO } | { ok: false; error: { code: string; message: string; retryable: boolean } };

/* ------------------------------------------------------------------ Voice */

/** One person in a channel's voice room (a voice session; one per account at a time). */
export interface VoicePeerDTO {
  /** Random id of this voice session, used to address WebRTC signals. */
  peerId: string;
  user: UserSummary;
  muted: boolean;
  deafened: boolean;
  /** False while their connection to the server is being restored (media may continue). */
  connected: boolean;
  joinedAt: number;
}

export interface VoiceRoomDTO {
  channelId: string;
  peers: VoicePeerDTO[];
}

/** ICE server for RTCPeerConnection (STUN, or TURN with short-lived credentials). */
export interface IceServerDTO {
  urls: string[];
  username?: string;
  credential?: string;
}

export type VoiceJoinAck =
  | {
      ok: true;
      peerId: string;
      room: VoiceRoomDTO;
      iceServers: IceServerDTO[];
      /** Highest audio bitrate the server allows clients to request (bits per second). */
      maxBitrate: number;
      /** True when an earlier session of this device was resumed (connections kept). */
      resumed: boolean;
    }
  | { ok: false; error: { code: string; message: string } };

/** A WebRTC signalling message relayed between two peers of the same room. */
export type VoiceSignal =
  | { description: { type: 'offer' | 'answer'; sdp: string } }
  | {
      candidate: {
        candidate: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
        usernameFragment?: string | null;
      } | null;
    };

export interface ServerToClientEvents {
  'message:new': (message: MessageDTO) => void;
  'message:update': (message: MessageDTO) => void;
  'message:delete': (payload: { id: string; channelId: string }) => void;
  'reaction:update': (payload: ReactionEvent) => void;
  'typing:start': (payload: TypingEvent) => void;
  'typing:stop': (payload: { channelId: string; userId: string }) => void;
  'presence:update': (payload: PresenceEvent) => void;
  'read:update': (payload: ReadStateEvent) => void;
  'notification:new': (payload: NotificationDTO) => void;
  'notification:read': (payload: { ids: string[] | 'all' }) => void;
  /** Community structure/permissions changed: client should refetch bootstrap data for it. */
  'community:update': (payload: { communityId: string }) => void;
  'community:remove': (payload: { communityId: string; reason: 'left' | 'kicked' | 'banned' | 'deleted' }) => void;
  'dm:update': (payload: { channelId: string }) => void;
  'user:update': (payload: { userId: string }) => void;
  'session:revoked': () => void;
  /** Who is in a channel's voice room (sent to everyone who can see the channel). */
  'voice:room': (room: VoiceRoomDTO) => void;
  'voice:signal': (payload: { channelId: string; from: string; signal: VoiceSignal }) => void;
  /** Your voice session ended without you leaving: joined on another device, or access lost. */
  'voice:ended': (payload: { channelId: string; reason: 'elsewhere' | 'removed' | 'disabled' }) => void;
}

export interface ClientToServerEvents {
  'message:send': (
    payload: { channelId: string; content: string; nonce: string; replyToId?: string | null; attachmentIds?: string[] },
    ack: (res: SendAck) => void,
  ) => void;
  'typing:start': (payload: { channelId: string }) => void;
  'typing:stop': (payload: { channelId: string }) => void;
  'channel:read': (payload: { channelId: string; messageId: string }) => void;
  'presence:set': (payload: { status: 'online' | 'idle' }) => void;
  'presence:query': (payload: { userIds: string[] }, ack: (res: Record<string, PresenceStatus>) => void) => void;
  'voice:join': (payload: { channelId: string; resumePeerId?: string }, ack: (res: VoiceJoinAck) => void) => void;
  'voice:leave': (payload: { channelId: string }) => void;
  'voice:signal': (payload: { channelId: string; to: string; signal: VoiceSignal }) => void;
  'voice:state': (payload: { channelId: string; muted: boolean; deafened: boolean }) => void;
  /** Active voice rooms in the channels you can see. */
  'voice:rooms': (payload: Record<string, never>, ack: (rooms: VoiceRoomDTO[]) => void) => void;
}
