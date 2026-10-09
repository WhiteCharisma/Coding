import type {
  BootstrapDTO,
  ChannelDTO,
  CommunityDTO,
  DmChannelDTO,
  MessageDTO,
  PresenceStatus,
  UnreadState,
} from '@creator-network/shared';
import { create } from 'zustand';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';
export type AnyChannel = ChannelDTO | DmChannelDTO;

export interface TypingEntry {
  name: string;
  until: number;
}

interface ChatState {
  ready: boolean;
  communities: Record<string, CommunityDTO>;
  communityOrder: string[];
  dms: Record<string, DmChannelDTO>;
  /** channelId → channel (community channels and DMs) */
  channels: Record<string, AnyChannel>;
  unreads: Record<string, UnreadState>;
  presence: Record<string, PresenceStatus>;
  typing: Record<string, Record<string, TypingEntry>>;
  unreadNotifications: number;
  connection: ConnectionState;
  /** Channel currently on screen (used to decide whether a new message is "unread"). */
  activeChannelId: string | null;

  applyBootstrap: (b: BootstrapDTO) => void;
  upsertCommunity: (c: CommunityDTO) => void;
  removeCommunity: (id: string) => void;
  upsertDm: (d: DmChannelDTO) => void;
  removeDm: (id: string) => void;
  setActiveChannel: (id: string | null) => void;
  onMessage: (m: MessageDTO, selfId: string, selfUsername: string, viewing: boolean) => void;
  markReadLocal: (channelId: string, messageId: string) => void;
  setPresence: (userId: string, status: PresenceStatus) => void;
  mergePresence: (entries: Record<string, PresenceStatus>) => void;
  setTyping: (channelId: string, userId: string, name: string | null) => void;
  setUnreadNotifications: (n: number | ((n: number) => number)) => void;
  setConnection: (c: ConnectionState) => void;
  reset: () => void;
}

function indexChannels(communities: Record<string, CommunityDTO>, dms: Record<string, DmChannelDTO>): Record<string, AnyChannel> {
  const out: Record<string, AnyChannel> = {};
  for (const c of Object.values(communities)) for (const ch of c.channels) out[ch.id] = ch;
  for (const d of Object.values(dms)) out[d.id] = d;
  return out;
}

const sortCommunities = (c: Record<string, CommunityDTO>) => Object.values(c).sort((a, b) => a.name.localeCompare(b.name)).map((x) => x.id);

const initial = {
  ready: false,
  communities: {},
  communityOrder: [],
  dms: {},
  channels: {},
  unreads: {},
  presence: {},
  typing: {},
  unreadNotifications: 0,
  connection: 'connecting' as ConnectionState,
  activeChannelId: null,
};

export const useChat = create<ChatState>((set, get) => ({
  ...initial,

  applyBootstrap: (b) => {
    const communities = Object.fromEntries(b.communities.map((c) => [c.id, c]));
    const dms = Object.fromEntries(b.dms.map((d) => [d.id, d]));
    set({
      ready: true,
      communities,
      communityOrder: sortCommunities(communities),
      dms,
      channels: indexChannels(communities, dms),
      unreads: Object.fromEntries(b.unreads.map((u) => [u.channelId, u])),
      unreadNotifications: b.unreadNotifications,
    });
  },

  upsertCommunity: (c) => {
    const communities = { ...get().communities, [c.id]: c };
    set({ communities, communityOrder: sortCommunities(communities), channels: indexChannels(communities, get().dms) });
  },

  removeCommunity: (id) => {
    const { [id]: _removed, ...communities } = get().communities;
    set({ communities, communityOrder: sortCommunities(communities), channels: indexChannels(communities, get().dms) });
  },

  upsertDm: (d) => {
    const dms = { ...get().dms, [d.id]: d };
    set({ dms, channels: indexChannels(get().communities, dms) });
  },

  removeDm: (id) => {
    const { [id]: _removed, ...dms } = get().dms;
    set({ dms, channels: indexChannels(get().communities, dms) });
  },

  setActiveChannel: (id) => set({ activeChannelId: id }),

  onMessage: (m, selfId, selfUsername, viewing) => {
    const state = get();
    const channel = state.channels[m.channelId];
    const patch: Partial<ChatState> = {};
    if (channel) {
      const updated = { ...channel, lastMessageId: m.id, lastMessageAt: m.createdAt };
      if (channel.kind === 'text' && channel.communityId) {
        const community = state.communities[channel.communityId];
        if (community) {
          const communities = {
            ...state.communities,
            [community.id]: { ...community, channels: community.channels.map((c) => (c.id === m.channelId ? (updated as ChannelDTO) : c)) },
          };
          patch.communities = communities;
          patch.channels = { ...state.channels, [m.channelId]: updated };
        }
      } else {
        const dm = { ...(channel as DmChannelDTO), lastMessageId: m.id, lastMessageAt: m.createdAt, lastMessagePreview: m.content.slice(0, 120) };
        patch.dms = { ...state.dms, [dm.id]: dm };
        patch.channels = { ...state.channels, [m.channelId]: dm };
      }
    }
    if (m.author?.id !== selfId && !viewing) {
      const current = state.unreads[m.channelId] ?? { channelId: m.channelId, lastReadId: null, unread: 0, mentions: 0 };
      const isDm = channel?.kind === 'dm' || channel?.kind === 'group_dm';
      const mentioned = isDm || m.mentionEveryone || m.mentions.some((x) => x.id === selfId || x.username === selfUsername);
      patch.unreads = {
        ...state.unreads,
        [m.channelId]: { ...current, unread: Math.min(current.unread + 1, 100), mentions: current.mentions + (mentioned ? 1 : 0) },
      };
    }
    // Typing stops when a message from that person arrives.
    if (m.author && state.typing[m.channelId]?.[m.author.id]) {
      const { [m.author.id]: _gone, ...rest } = state.typing[m.channelId] ?? {};
      patch.typing = { ...state.typing, [m.channelId]: rest };
    }
    set(patch);
  },

  markReadLocal: (channelId, messageId) => {
    const current = get().unreads[channelId];
    if (current && current.lastReadId && current.lastReadId >= messageId && current.unread === 0) return;
    set({ unreads: { ...get().unreads, [channelId]: { channelId, lastReadId: messageId, unread: 0, mentions: 0 } } });
  },

  setPresence: (userId, status) => {
    if (get().presence[userId] === status) return;
    set({ presence: { ...get().presence, [userId]: status } });
  },

  mergePresence: (entries) => set({ presence: { ...get().presence, ...entries } }),

  setTyping: (channelId, userId, name) => {
    const typing = { ...get().typing };
    const forChannel = { ...(typing[channelId] ?? {}) };
    if (name) forChannel[userId] = { name, until: Date.now() + 6000 };
    else delete forChannel[userId];
    typing[channelId] = forChannel;
    set({ typing });
  },

  setUnreadNotifications: (n) => set({ unreadNotifications: typeof n === 'function' ? n(get().unreadNotifications) : n }),
  setConnection: (connection) => set({ connection }),
  reset: () => set({ ...initial }),
}));

/** Sum of unread counts for a community's channels. */
export function communityUnread(c: CommunityDTO, unreads: Record<string, UnreadState>, muted: boolean): { unread: boolean; mentions: number } {
  let unread = false;
  let mentions = 0;
  for (const ch of c.channels) {
    const u = unreads[ch.id];
    if (!u) continue;
    if (u.unread > 0) unread = true;
    mentions += u.mentions;
  }
  return { unread: unread && !muted, mentions };
}

export function dmDisplayName(d: DmChannelDTO, selfId: string): string {
  if (d.name) return d.name;
  const others = d.participants.filter((p) => p.id !== selfId);
  if (others.length === 0) return d.participants[0]?.displayName ?? '—';
  return others.map((p) => p.displayName).join(', ');
}
