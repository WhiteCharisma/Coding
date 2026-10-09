/**
 * Socket.IO client: connects with the session cookie, feeds server events into
 * the stores, and re-synchronises from the REST API after every reconnect.
 */
import type {
  BootstrapDTO,
  ClientToServerEvents,
  CommunityDTO,
  DmChannelDTO,
  NotificationDTO,
  SelfUser,
  ServerToClientEvents,
} from '@creator-network/shared';
import { io, type Socket } from 'socket.io-client';
import { t } from '../i18n';
import { useChat } from '../stores/chat';
import { useMessages } from '../stores/messages';
import { useSession } from '../stores/session';
import { useUi } from '../stores/ui';
import { useVoice } from '../stores/voice';
import { toast } from '../components/ui/toast';
import { api, ApiError } from './api';
import { playSound } from './sounds';
import { navigateTo } from './navigator';
import { queryClient } from './queryClient';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ClientSocket | null = null;
let connectedBefore = false;
let idleTimer: number | null = null;
let isIdle = false;
const readTimers = new Map<string, number>();

function self(): SelfUser | null {
  return useSession.getState().user;
}

/** True when the user is looking at the newest messages of this channel. */
/** The live connection (voice signalling uses it). */
export function getSocket(): ClientSocket | null {
  return socket;
}

export function isViewing(channelId: string): boolean {
  return (
    useChat.getState().activeChannelId === channelId &&
    document.visibilityState === 'visible' &&
    useUi.getState().atBottom
  );
}

async function checkSession(): Promise<void> {
  try {
    await api.get('/api/auth/session', { quiet401: true });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) useSession.getState().signedOut('expired');
  }
}

async function refreshCommunity(communityId: string): Promise<void> {
  try {
    const { community } = await api.get<{ community: CommunityDTO }>(`/api/communities/${communityId}`);
    useChat.getState().upsertCommunity(community);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) useChat.getState().removeCommunity(communityId);
  }
}

async function refreshDm(channelId: string): Promise<void> {
  try {
    const { dm } = await api.get<{ dm: DmChannelDTO }>(`/api/dms/${channelId}`);
    useChat.getState().upsertDm(dm);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      useChat.getState().removeDm(channelId);
      useMessages.getState().dropChannel(channelId);
    }
  }
}

async function refreshNotificationCount(): Promise<void> {
  try {
    const res = await api.get<{ unread: number }>('/api/notifications?limit=1');
    useChat.getState().setUnreadNotifications(res.unread);
  } catch {
    /* ignore */
  }
}

/** Full re-synchronisation after a reconnect: persisted state is the source of truth. */
export async function resync(): Promise<void> {
  try {
    const b = await api.get<BootstrapDTO>('/api/me/bootstrap');
    useChat.getState().applyBootstrap(b);
    useSession.getState().setUser(b.user);
    const active = useChat.getState().activeChannelId;
    useMessages.getState().markStale(active);
    if (active) await useMessages.getState().catchUp(active);
    void queryClient.invalidateQueries();
    queryDmPresence();
  } catch {
    /* next reconnect will retry */
  }
}

function queryDmPresence(): void {
  const me = self();
  if (!socket?.connected || !me) return;
  const ids = new Set<string>();
  for (const d of Object.values(useChat.getState().dms))
    for (const p of d.participants) if (p.id !== me.id) ids.add(p.id);
  if (ids.size === 0) return;
  socket.emit('presence:query', { userIds: [...ids].slice(0, 500) }, (res) => useChat.getState().mergePresence(res));
}

export function queryPresence(userIds: string[]): void {
  if (!socket?.connected || userIds.length === 0) return;
  socket.emit('presence:query', { userIds: userIds.slice(0, 500) }, (res) => useChat.getState().mergePresence(res));
}

/** Debounced read acknowledgement for the newest visible message. */
export function markRead(channelId: string, messageId: string): void {
  const unread = useChat.getState().unreads[channelId];
  if (unread && unread.unread === 0 && unread.lastReadId && unread.lastReadId >= messageId) return;
  useChat.getState().markReadLocal(channelId, messageId);
  const existing = readTimers.get(channelId);
  if (existing) window.clearTimeout(existing);
  readTimers.set(
    channelId,
    window.setTimeout(() => {
      readTimers.delete(channelId);
      if (socket?.connected) socket.emit('channel:read', { channelId, messageId });
      else void api.post(`/api/channels/${channelId}/read`, { messageId }).catch(() => undefined);
    }, 400),
  );
}

export function emitTyping(channelId: string, started: boolean): void {
  if (socket?.connected) socket.emit(started ? 'typing:start' : 'typing:stop', { channelId });
}

function notificationToast(n: NotificationDTO): void {
  const me = self();
  if (!me || me.presence === 'dnd') return;
  if (n.channelId && isViewing(n.channelId)) return;
  const actor = n.actor?.displayName ?? '';
  let text: string | null = null;
  if (n.type === 'mention') text = t('notifications.types.mention', { actor, channel: n.channelName ?? '' });
  else if (n.type === 'reply') text = t('notifications.types.reply', { actor, channel: n.channelName ?? '' });
  else if (n.type === 'invite') text = t('notifications.types.invite', { actor, community: n.communityName ?? '' });
  else if (n.type === 'dm' && n.count === 1) text = t('notifications.types.dm', { actor, count: 1 });
  if (!text) return;
  playSound('notification');
  const target = n.channelId
    ? n.communityId
      ? `/c/${n.communityId}/${n.channelId}`
      : `/dm/${n.channelId}`
    : '/notifications';
  toast.info(text, {
    label: t('common.actions.open'),
    onClick: () => navigateTo(n.messageId && n.communityId ? `${target}?m=${n.messageId}` : target),
  });
}

function trackActivity(): void {
  const reset = () => {
    if (idleTimer) window.clearTimeout(idleTimer);
    if (isIdle) {
      isIdle = false;
      socket?.emit('presence:set', { status: 'online' });
    }
    idleTimer = window.setTimeout(() => {
      isIdle = true;
      socket?.emit('presence:set', { status: 'idle' });
    }, 5 * 60_000);
  };
  for (const ev of ['pointerdown', 'keydown', 'focus']) window.addEventListener(ev, reset, { passive: true });
  reset();
}

export function startRealtime(): void {
  if (socket) return;
  const s: ClientSocket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 10_000,
  });
  socket = s;
  useChat.getState().setConnection('connecting');
  useMessages.getState().setTransport({
    isConnected: () => s.connected,
    send: (payload) => s.timeout(12_000).emitWithAck('message:send', payload),
  });

  s.on('connect', () => {
    useChat.getState().setConnection('connected');
    if (connectedBefore) {
      void resync().then(() => useMessages.getState().flush());
    } else {
      queryDmPresence();
    }
    connectedBefore = true;
    useMessages.getState().flush();
    // Voice: list the rooms in use and resume a call that was interrupted.
    useVoice.getState().onReconnect();
  });
  s.on('disconnect', (reason) => {
    useChat.getState().setConnection(navigator.onLine ? 'reconnecting' : 'offline');
    useVoice.getState().onDisconnect();
    if (reason === 'io server disconnect') void checkSession().then(() => s.connect());
  });
  s.on('connect_error', (err) => {
    if (err.message === 'unauthorized') void checkSession();
    useChat.getState().setConnection(navigator.onLine ? 'reconnecting' : 'offline');
  });

  s.on('message:new', (m) => {
    const me = self();
    if (!me) return;
    useMessages.getState().receive(m);
    const viewing = isViewing(m.channelId);
    // A soft chime for someone else's message in the conversation you are reading (not in DND).
    if (viewing && m.author?.id !== me.id && me.presence !== 'dnd') playSound('receive');
    useChat.getState().onMessage(m, me.id, me.username, viewing);
    if (viewing) markRead(m.channelId, m.id);
  });
  s.on('message:update', (m) => useMessages.getState().update(m));
  s.on('message:delete', ({ id, channelId }) => useMessages.getState().remove(channelId, id));
  s.on('reaction:update', (ev) => {
    const me = self();
    if (me) useMessages.getState().reaction(ev, me.id);
  });
  s.on('typing:start', ({ channelId, userId, displayName }) => {
    if (userId !== self()?.id) useChat.getState().setTyping(channelId, userId, displayName);
  });
  s.on('typing:stop', ({ channelId, userId }) => useChat.getState().setTyping(channelId, userId, null));
  s.on('presence:update', ({ userId, status }) => useChat.getState().setPresence(userId, status));
  s.on('read:update', ({ channelId, lastReadId }) => useChat.getState().markReadLocal(channelId, lastReadId));
  s.on('notification:new', (n) => {
    if (n.count === 1 && !n.readAt) useChat.getState().setUnreadNotifications((c) => c + 1);
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    notificationToast(n);
  });
  s.on('notification:read', () => {
    void refreshNotificationCount();
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  });
  s.on('community:update', ({ communityId }) => {
    void refreshCommunity(communityId);
    void queryClient.invalidateQueries({ queryKey: ['community', communityId] });
  });
  s.on('community:remove', ({ communityId, reason }) => {
    const c = useChat.getState().communities[communityId];
    if (!c) return;
    for (const ch of c.channels) useMessages.getState().dropChannel(ch.id);
    useChat.getState().removeCommunity(communityId);
    if (reason !== 'left') toast.info(t(`community.join.${reason}`, { name: c.name }));
    if (window.location.pathname.startsWith(`/c/${communityId}`)) navigateTo('/home');
  });
  s.on('dm:update', ({ channelId }) => void refreshDm(channelId));
  s.on('user:update', ({ userId }) => {
    const me = self();
    if (me && userId === me.id) {
      void api
        .get<{ user: SelfUser }>('/api/auth/session')
        .then((r) => useSession.getState().setUser(r.user))
        .catch(() => undefined);
    } else {
      // Blocks change DM permissions on both sides.
      for (const d of Object.values(useChat.getState().dms))
        if (d.participants.some((p) => p.id === userId)) void refreshDm(d.id);
    }
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  });
  s.on('session:revoked', () => useSession.getState().signedOut('expired'));
  s.on('voice:room', (room) => useVoice.getState().onRoom(room));
  s.on('voice:signal', (payload) => useVoice.getState().onSignal(payload));
  s.on('voice:ended', (payload) => useVoice.getState().onEnded(payload));

  window.addEventListener('online', () => {
    if (!s.connected) s.connect();
  });
  window.addEventListener('offline', () => useChat.getState().setConnection('offline'));
  trackActivity();
}

export function stopRealtime(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  connectedBefore = false;
}
