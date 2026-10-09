import type { Server as HttpServer } from 'node:http';
import { eq } from 'drizzle-orm';
import { Server, type Socket } from 'socket.io';
import {
  idSchema,
  sendMessageSchema,
  type ClientToServerEvents,
  type PresenceStatus,
  type SendAck,
  type ServerToClientEvents,
} from '@creator-network/shared';
import { z } from 'zod';
import { validateSessionToken } from '../auth/sessions';
import { computeUserChannelPermissions } from '../communities/access';
import type { AppContext } from '../context';
import { channelParticipants, communityMembers, sessions, users } from '../db/schema';
import { AppError } from '../lib/errors';
import { parseCookieHeader, TokenBucket } from '../lib/rate';
import { markRead, sendMessage } from '../messages/service';
import type { UserRow } from '../users/dto';
import { PresenceTracker } from './presence';
import { VoiceRooms } from './voice';
import type { Realtime } from './types';

interface SocketData {
  userId: string;
  sessionId: string;
  sessionExpiresAt: number;
  displayName: string;
  buckets: {
    send: TokenBucket;
    typing: TokenBucket;
    read: TokenBucket;
    misc: TokenBucket;
    voice: TokenBucket;
    voiceJoin: TokenBucket;
  };
  lastTyping: Map<string, number>;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const TYPING_MIN_INTERVAL_MS = 2500;
/** Concurrent connections per account (tabs and devices); bounds what one account can hold open. */
export const MAX_SOCKETS_PER_USER = 20;
const SLOW_CONSUMER_PACKETS = 2000;
const presenceQuerySchema = z.object({ userIds: z.array(idSchema).max(500) });
const channelPayload = z.object({ channelId: idSchema });
const readPayload = z.object({ channelId: idSchema, messageId: idSchema });
const activityPayload = z.object({ status: z.enum(['online', 'idle']) });

/**
 * Socket.IO gateway. Responsibilities:
 *  - authenticate the handshake with the session cookie and check Origin;
 *  - put each socket in the rooms it is authorised for (decided by the server);
 *  - handle client events with validation, permission checks and rate limits;
 *  - track presence and typing (ephemeral, in memory only).
 */
export class SocketGateway implements Realtime {
  readonly io: IO;
  private readonly presence: PresenceTracker;
  private readonly socketsByUser = new Map<string, Set<ClientSocket>>();
  private readonly sweeper: NodeJS.Timeout;
  readonly voice: VoiceRooms;

  constructor(
    private readonly ctx: AppContext,
    httpServer: HttpServer,
  ) {
    this.io = new Server(httpServer, {
      path: '/socket.io',
      serveClient: false,
      maxHttpBufferSize: 64 * 1024,
      pingInterval: 25_000,
      pingTimeout: 20_000,
      connectTimeout: 15_000,
      allowRequest: (req, callback) => {
        // Browsers always send Origin on WebSocket handshakes and cross-origin requests;
        // rejecting unknown origins blocks cross-site WebSocket hijacking.
        const origin = req.headers.origin;
        if (origin && !ctx.config.allowedOrigins.includes(origin)) {
          callback('origin not allowed', false);
          return;
        }
        callback(null, true);
      },
    });
    this.presence = new PresenceTracker((userId, status) => this.publishPresence(userId, status));
    this.voice = new VoiceRooms(ctx, {
      toChannel: (channelId, room) => this.io.to(`channel:${channelId}`).emit('voice:room', room),
      toSocket: (socketId, event, payload) =>
        (this.io.to(socketId).emit as (e: string, p: unknown) => boolean)(event, payload),
    });

    this.io.use((socket, next) => {
      const cookies = parseCookieHeader(socket.request.headers.cookie);
      const auth = validateSessionToken(ctx, cookies[ctx.config.sessionCookieName]);
      if (!auth) {
        next(new Error('unauthorized'));
        return;
      }
      if ((this.socketsByUser.get(auth.user.id)?.size ?? 0) >= MAX_SOCKETS_PER_USER) {
        next(new Error('too_many_connections'));
        return;
      }
      socket.data = {
        userId: auth.user.id,
        sessionId: auth.session.id,
        sessionExpiresAt: auth.session.expiresAt,
        displayName: auth.user.displayName,
        buckets: {
          send: new TokenBucket(10, 1),
          typing: new TokenBucket(5, 0.5),
          read: new TokenBucket(20, 5),
          misc: new TokenBucket(20, 2),
          // Joining a room with N people exchanges a few dozen ICE candidates per person.
          voice: new TokenBucket(400, 80),
          voiceJoin: new TokenBucket(6, 0.5),
        },
        lastTyping: new Map(),
      };
      next();
    });

    this.io.on('connection', (socket) => this.onConnection(socket));

    this.sweeper = setInterval(() => this.sweepSlowConsumers(), 15_000);
    this.sweeper.unref();
  }

  /* ------------------------------------------------------------ Lifecycle */

  private onConnection(socket: ClientSocket): void {
    const { userId, sessionId } = socket.data;
    let set = this.socketsByUser.get(userId);
    if (!set) {
      set = new Set();
      this.socketsByUser.set(userId, set);
    }
    set.add(socket);
    void socket.join([`user:${userId}`, `session:${sessionId}`]);
    this.applyRooms([socket], userId);

    const user = this.ctx.db.select({ presence: users.presence }).from(users).where(eq(users.id, userId)).get();
    this.presence.connect(userId, socket.id, user?.presence ?? 'online');

    socket.on('message:send', (payload, ack) => void this.handleSend(socket, payload, ack));
    socket.on('typing:start', (payload) => this.handleTyping(socket, payload, true));
    socket.on('typing:stop', (payload) => this.handleTyping(socket, payload, false));
    socket.on('channel:read', (payload) => this.handleRead(socket, payload));
    socket.on('presence:set', (payload) => {
      const parsed = activityPayload.safeParse(payload);
      if (parsed.success && socket.data.buckets.misc.take())
        this.presence.setActivity(userId, socket.id, parsed.data.status);
    });
    socket.on('presence:query', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const parsed = presenceQuerySchema.safeParse(payload);
      if (!parsed.success || !socket.data.buckets.misc.take()) {
        ack({});
        return;
      }
      const result: Record<string, PresenceStatus> = {};
      for (const id of parsed.data.userIds) result[id] = this.presence.status(id);
      ack(result);
    });

    socket.on('voice:join', (payload, ack) => {
      if (typeof ack !== 'function') return;
      if (!socket.data.buckets.voiceJoin.take()) {
        ack({ ok: false, error: { code: 'rate_limited', message: 'Please wait a moment before joining again.' } });
        return;
      }
      if (!this.ensureSession(socket)) {
        ack({ ok: false, error: { code: 'unauthorized', message: 'Your session has ended. Please sign in again.' } });
        return;
      }
      try {
        ack(this.voice.join(socket, payload));
      } catch (err) {
        this.ctx.log.error({ err }, 'voice:join failed');
        ack({ ok: false, error: { code: 'internal', message: 'Voice is unavailable right now. Please try again.' } });
      }
    });
    socket.on('voice:leave', (payload) => this.voice.leave(socket, payload));
    socket.on('voice:signal', (payload) => {
      if (socket.data.buckets.voice.take()) this.voice.signal(socket, payload);
    });
    socket.on('voice:state', (payload) => {
      if (socket.data.buckets.voice.take()) this.voice.setState(socket, payload);
    });
    socket.on('voice:rooms', (_payload, ack) => {
      if (typeof ack !== 'function') return;
      if (!socket.data.buckets.misc.take()) {
        ack([]);
        return;
      }
      ack(this.voice.roomsVisibleTo((channelId) => socket.rooms.has(`channel:${channelId}`)));
    });

    socket.on('disconnect', () => {
      this.voice.disconnected(socket.id);
      const sockets = this.socketsByUser.get(userId);
      sockets?.delete(socket);
      if (sockets && sockets.size === 0) this.socketsByUser.delete(userId);
      for (const channelId of socket.data.lastTyping.keys()) {
        socket.to(`channel:${channelId}`).emit('typing:stop', { channelId, userId });
      }
      this.presence.disconnect(userId, socket.id);
    });
  }

  /** Validates that the socket's session still exists; disconnects it otherwise. */
  private ensureSession(socket: ClientSocket): UserRow | null {
    const now = Date.now();
    if (now > socket.data.sessionExpiresAt) {
      const s = this.ctx.db.select().from(sessions).where(eq(sessions.id, socket.data.sessionId)).get();
      if (!s || s.expiresAt <= now) {
        socket.emit('session:revoked');
        socket.disconnect(true);
        return null;
      }
      socket.data.sessionExpiresAt = s.expiresAt;
    }
    const user = this.ctx.db.select().from(users).where(eq(users.id, socket.data.userId)).get();
    if (!user || user.status !== 'active') {
      socket.emit('session:revoked');
      socket.disconnect(true);
      return null;
    }
    return user;
  }

  /* ------------------------------------------------------------- Handlers */

  private async handleSend(socket: ClientSocket, payload: unknown, ack: unknown): Promise<void> {
    if (typeof ack !== 'function') return;
    const reply = ack as (res: SendAck) => void;
    const fail = (code: string, message: string, retryable: boolean) =>
      reply({ ok: false, error: { code, message, retryable } });
    try {
      if (!socket.data.buckets.send.take()) {
        fail('rate_limited', 'You are sending messages too quickly. Please wait a moment.', true);
        return;
      }
      const user = this.ensureSession(socket);
      if (!user) {
        fail('unauthorized', 'Your session has ended. Please sign in again.', false);
        return;
      }
      const body = (payload ?? {}) as Record<string, unknown>;
      const channel = idSchema.safeParse(body.channelId);
      const input = sendMessageSchema.safeParse(body);
      if (!channel.success || !input.success) {
        const msg = input.success ? 'Invalid channel.' : (input.error.issues[0]?.message ?? 'Invalid message.');
        fail('validation_failed', msg, false);
        return;
      }
      const result = sendMessage(this.ctx, user, channel.data, input.data);
      reply({ ok: true, message: result.message });
      if (socket.data.lastTyping.delete(channel.data)) {
        socket.to(`channel:${channel.data}`).emit('typing:stop', { channelId: channel.data, userId: user.id });
      }
    } catch (err) {
      if (err instanceof AppError) {
        fail(err.code, err.message, err.status >= 500 || err.status === 429);
      } else {
        this.ctx.log.error({ err }, 'message:send failed');
        fail('internal', 'The message could not be saved. It will be retried.', true);
      }
    }
  }

  private handleTyping(socket: ClientSocket, payload: unknown, started: boolean): void {
    const parsed = channelPayload.safeParse(payload);
    if (!parsed.success) return;
    const { channelId } = parsed.data;
    const room = `channel:${channelId}`;
    // Room membership is maintained by the server from permissions: it is the authorisation check.
    if (!socket.rooms.has(room)) return;
    const { userId, displayName, lastTyping } = socket.data;
    if (!started) {
      if (lastTyping.delete(channelId)) socket.to(room).emit('typing:stop', { channelId, userId });
      return;
    }
    const now = Date.now();
    const last = lastTyping.get(channelId) ?? 0;
    if (now - last < TYPING_MIN_INTERVAL_MS || !socket.data.buckets.typing.take()) return;
    lastTyping.set(channelId, now);
    socket.to(room).volatile.emit('typing:start', { channelId, userId, displayName });
  }

  private handleRead(socket: ClientSocket, payload: unknown): void {
    const parsed = readPayload.safeParse(payload);
    if (!parsed.success || !socket.data.buckets.read.take()) return;
    const user = this.ensureSession(socket);
    if (!user) return;
    try {
      markRead(this.ctx, user, parsed.data.channelId, parsed.data.messageId);
    } catch (err) {
      if (!(err instanceof AppError)) this.ctx.log.error({ err }, 'channel:read failed');
    }
  }

  /* --------------------------------------------------------------- Rooms */

  private applyRooms(sockets: Iterable<ClientSocket>, userId: string): void {
    const perms = computeUserChannelPermissions(this.ctx.db, userId);
    const wanted = new Set<string>([
      ...[...perms.channels.keys()].map((id) => `channel:${id}`),
      ...[...perms.communities.keys()].map((id) => `community:${id}`),
    ]);
    for (const socket of sockets) {
      for (const room of socket.rooms) {
        if ((room.startsWith('channel:') || room.startsWith('community:')) && !wanted.has(room))
          void socket.leave(room);
      }
      const missing = [...wanted].filter((r) => !socket.rooms.has(r));
      if (missing.length) void socket.join(missing);
    }
    // Permissions or memberships changed: a voice session may have lost its right to speak.
    this.voice.revalidate(userId);
  }

  syncUserRooms(userId: string): void {
    const sockets = this.socketsByUser.get(userId);
    if (sockets && sockets.size > 0) this.applyRooms(sockets, userId);
  }

  syncCommunity(communityId: string): void {
    const room = this.io.sockets.adapter.rooms.get(`community:${communityId}`);
    const userIds = new Set<string>();
    if (room) {
      for (const sid of room) {
        const s = this.io.sockets.sockets.get(sid);
        if (s) userIds.add(s.data.userId);
      }
    }
    for (const id of userIds) this.syncUserRooms(id);
  }

  /* --------------------------------------------------------------- Emits */

  toChannel<E extends keyof ServerToClientEvents>(
    channelId: string,
    event: E,
    ...payload: Parameters<ServerToClientEvents[E]>
  ): void {
    this.io.to(`channel:${channelId}`).emit(event, ...payload);
  }

  toUser<E extends keyof ServerToClientEvents>(
    userId: string,
    event: E,
    ...payload: Parameters<ServerToClientEvents[E]>
  ): void {
    this.io.to(`user:${userId}`).emit(event, ...payload);
  }

  toCommunity<E extends keyof ServerToClientEvents>(
    communityId: string,
    event: E,
    ...payload: Parameters<ServerToClientEvents[E]>
  ): void {
    this.io.to(`community:${communityId}`).emit(event, ...payload);
  }

  disconnectUser(userId: string): void {
    this.voice.endUser(userId, 'removed');
    this.io.to(`user:${userId}`).emit('session:revoked');
    this.io.in(`user:${userId}`).disconnectSockets(true);
  }

  disconnectSession(sessionId: string): void {
    this.io.to(`session:${sessionId}`).emit('session:revoked');
    this.io.in(`session:${sessionId}`).disconnectSockets(true);
  }

  /* ------------------------------------------------------------ Presence */

  presenceOf(userId: string): PresenceStatus {
    return this.presence.status(userId);
  }

  refreshPresence(userId: string): void {
    const user = this.ctx.db.select({ presence: users.presence }).from(users).where(eq(users.id, userId)).get();
    if (user) this.presence.setPreference(userId, user.presence);
  }

  private publishPresence(userId: string, status: PresenceStatus): void {
    const communities = this.ctx.db
      .select({ id: communityMembers.communityId })
      .from(communityMembers)
      .where(eq(communityMembers.userId, userId))
      .all()
      .map((r) => `community:${r.id}`);
    const dmChannels = this.ctx.db
      .select({ id: channelParticipants.channelId })
      .from(channelParticipants)
      .where(eq(channelParticipants.userId, userId))
      .all()
      .map((r) => `channel:${r.id}`);
    this.io.to([...communities, ...dmChannels, `user:${userId}`]).emit('presence:update', { userId, status });
  }

  connectedSocketCount(): number {
    return this.io.sockets.sockets.size;
  }

  voicePeerCount(): number {
    return this.voice.peerCount();
  }

  /** Disconnects clients that cannot keep up; they reconnect and catch up from history. */
  private sweepSlowConsumers(): void {
    for (const socket of this.io.sockets.sockets.values()) {
      const conn = socket.conn as unknown as { writeBuffer?: unknown[] };
      if ((conn.writeBuffer?.length ?? 0) > SLOW_CONSUMER_PACKETS) {
        this.ctx.log.warn({ userId: socket.data.userId }, 'disconnecting slow socket consumer');
        socket.disconnect(true);
      }
    }
  }

  /**
   * Disconnects all clients and stops the Socket.IO engine. The HTTP server
   * itself is closed by Fastify (`app.close()`), which also handles keep-alive
   * connections; `io.close()` would close it directly and wait for them.
   */
  async close(): Promise<void> {
    clearInterval(this.sweeper);
    this.voice.close();
    this.presence.clear();
    this.io.disconnectSockets(true);
    this.io.engine.close();
  }
}
