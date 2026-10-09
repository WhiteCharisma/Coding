import { createHmac } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import {
  Permission,
  voiceJoinSchema,
  voiceLeaveSchema,
  voiceSignalSchema,
  voiceStateSchema,
  type IceServerDTO,
  type VoiceJoinAck,
  type VoicePeerDTO,
  type VoiceRoomDTO,
} from '@creator-network/shared';
import { getChannelAccess, requireChannelPermission } from '../communities/access';
import type { AppContext } from '../context';
import { newId } from '../db/ids';
import { users } from '../db/schema';
import { AppError } from '../lib/errors';
import { summaryColumns, toUserSummary } from '../users/dto';

/** What the voice rooms need from a connected socket. */
export interface VoiceSocket {
  id: string;
  data: { userId: string };
  join(room: string): unknown;
  leave(room: string): unknown;
}

/** How the voice rooms reach clients (implemented by the Socket.IO gateway). */
export interface VoiceTransport {
  toChannel(channelId: string, room: VoiceRoomDTO): void;
  toSocket(socketId: string, event: 'voice:signal' | 'voice:ended', payload: unknown): void;
}

interface Session {
  peerId: string;
  userId: string;
  channelId: string;
  /** Null while the person's connection to the server is being restored. */
  socketId: string | null;
  muted: boolean;
  deafened: boolean;
  joinedAt: number;
  grace: NodeJS.Timeout | null;
}

/** How long a voice session survives a lost server connection (WebRTC media keeps flowing). */
export const VOICE_RESUME_GRACE_MS = 20_000;

const voiceRoom = (channelId: string) => `voice:${channelId}`;

/**
 * Voice rooms: who is talking in which channel, and the relay of WebRTC signalling between them.
 * Media never passes through the server (peer to peer, see docs/VOICE.md); the server decides who
 * may join (same rule as writing in the channel), keeps one voice session per account, relays
 * signals only between members of the same room, and ends sessions that lose access.
 * State is in memory: a server restart empties the rooms and clients rejoin.
 */
export class VoiceRooms {
  private readonly rooms = new Map<string, Map<string, Session>>();
  private readonly byUser = new Map<string, Session>();
  private readonly bySocket = new Map<string, Session>();

  constructor(
    private readonly ctx: AppContext,
    private readonly transport: VoiceTransport,
  ) {}

  /* ---------------------------------------------------------------- Client events */

  join(socket: VoiceSocket, payload: unknown): VoiceJoinAck {
    const fail = (code: string, message: string): VoiceJoinAck => ({ ok: false, error: { code, message } });
    const voice = this.ctx.config.voice;
    if (!voice.enabled) return fail('voice_disabled', 'Voice is turned off on this server.');
    const parsed = voiceJoinSchema.safeParse(payload);
    if (!parsed.success) return fail('validation_failed', 'Invalid voice room.');
    const { channelId, resumePeerId } = parsed.data;
    const userId = socket.data.userId;
    try {
      requireChannelPermission(this.ctx.db, channelId, userId, Permission.SEND_MESSAGES);
    } catch (err) {
      if (err instanceof AppError) return fail(err.code, err.message);
      throw err;
    }

    const existing = this.byUser.get(userId);
    // Same device reconnecting within the grace period: keep the session (and the media).
    if (existing && resumePeerId && existing.peerId === resumePeerId && existing.channelId === channelId) {
      if (existing.grace) clearTimeout(existing.grace);
      existing.grace = null;
      if (existing.socketId) this.bySocket.delete(existing.socketId);
      existing.socketId = socket.id;
      this.bySocket.set(socket.id, existing);
      socket.join(voiceRoom(channelId));
      const room = this.publish(channelId);
      return this.joined(existing, room, true);
    }
    // One voice session per account: joining elsewhere ends the previous one.
    if (existing) {
      if (existing.socketId && existing.socketId !== socket.id) {
        this.transport.toSocket(existing.socketId, 'voice:ended', {
          channelId: existing.channelId,
          reason: 'elsewhere',
        });
      }
      this.end(existing);
    }
    const room = this.rooms.get(channelId);
    if ((room?.size ?? 0) >= voice.maxParticipants) {
      return fail('room_full', `This voice room is full (${voice.maxParticipants} people).`);
    }
    const session: Session = {
      peerId: newId(),
      userId,
      channelId,
      socketId: socket.id,
      muted: false,
      deafened: false,
      joinedAt: Date.now(),
      grace: null,
    };
    const members = room ?? new Map<string, Session>();
    members.set(session.peerId, session);
    this.rooms.set(channelId, members);
    this.byUser.set(userId, session);
    this.bySocket.set(socket.id, session);
    socket.join(voiceRoom(channelId));
    return this.joined(session, this.publish(channelId), false);
  }

  leave(socket: VoiceSocket, payload: unknown): void {
    const parsed = voiceLeaveSchema.safeParse(payload);
    const session = this.bySocket.get(socket.id);
    if (!parsed.success || !session || session.channelId !== parsed.data.channelId) return;
    socket.leave(voiceRoom(session.channelId));
    this.end(session);
  }

  /** Relays an SDP description or ICE candidate to another member of the same room only. */
  signal(socket: VoiceSocket, payload: unknown): void {
    const parsed = voiceSignalSchema.safeParse(payload);
    if (!parsed.success) return;
    const session = this.bySocket.get(socket.id);
    if (!session || session.channelId !== parsed.data.channelId) return;
    const target = this.rooms.get(session.channelId)?.get(parsed.data.to);
    if (!target?.socketId || target.peerId === session.peerId) return;
    this.transport.toSocket(target.socketId, 'voice:signal', {
      channelId: session.channelId,
      from: session.peerId,
      signal: parsed.data.signal,
    });
  }

  setState(socket: VoiceSocket, payload: unknown): void {
    const parsed = voiceStateSchema.safeParse(payload);
    const session = this.bySocket.get(socket.id);
    if (!parsed.success || !session || session.channelId !== parsed.data.channelId) return;
    if (session.muted === parsed.data.muted && session.deafened === parsed.data.deafened) return;
    session.muted = parsed.data.muted;
    session.deafened = parsed.data.deafened;
    this.publish(session.channelId);
  }

  /** Active rooms in the channels this socket may see (it is in their `channel:` rooms). */
  roomsVisibleTo(isInChannelRoom: (channelId: string) => boolean): VoiceRoomDTO[] {
    return [...this.rooms.keys()].filter(isInChannelRoom).map((id) => this.snapshot(id));
  }

  /** Keeps the session for a short while: the same device may reconnect and resume it. */
  disconnected(socketId: string): void {
    const session = this.bySocket.get(socketId);
    if (!session) return;
    this.bySocket.delete(socketId);
    session.socketId = null;
    session.grace = setTimeout(() => this.end(session), VOICE_RESUME_GRACE_MS);
    session.grace.unref();
    this.publish(session.channelId);
  }

  /** Ends a person's voice session if they may no longer speak in that channel. */
  revalidate(userId: string): void {
    const session = this.byUser.get(userId);
    if (!session) return;
    const access = getChannelAccess(this.ctx.db, session.channelId, userId);
    if (access && (access.permissions & Permission.SEND_MESSAGES) !== 0) return;
    this.endUser(userId, 'removed');
  }

  /** Ends a person's voice session now (account suspended, signed out everywhere, access lost). */
  endUser(userId: string, reason: 'removed' | 'disabled'): void {
    const session = this.byUser.get(userId);
    if (!session) return;
    if (session.socketId)
      this.transport.toSocket(session.socketId, 'voice:ended', { channelId: session.channelId, reason });
    this.end(session);
  }

  peerCount(): number {
    return this.byUser.size;
  }

  close(): void {
    for (const s of this.byUser.values()) if (s.grace) clearTimeout(s.grace);
    this.rooms.clear();
    this.byUser.clear();
    this.bySocket.clear();
  }

  /* ---------------------------------------------------------------- Internals */

  private end(session: Session): void {
    if (session.grace) clearTimeout(session.grace);
    session.grace = null;
    const room = this.rooms.get(session.channelId);
    room?.delete(session.peerId);
    if (room && room.size === 0) this.rooms.delete(session.channelId);
    if (this.byUser.get(session.userId) === session) this.byUser.delete(session.userId);
    if (session.socketId && this.bySocket.get(session.socketId) === session) this.bySocket.delete(session.socketId);
    this.publish(session.channelId);
  }

  private joined(session: Session, room: VoiceRoomDTO, resumed: boolean): VoiceJoinAck {
    return {
      ok: true,
      peerId: session.peerId,
      room,
      iceServers: this.iceServersFor(session.userId),
      maxBitrate: this.ctx.config.voice.maxBitrate,
      resumed,
    };
  }

  /** Sends the room to everyone who can see the channel (sidebars, the call itself). */
  private publish(channelId: string): VoiceRoomDTO {
    const room = this.snapshot(channelId);
    this.transport.toChannel(channelId, room);
    return room;
  }

  private snapshot(channelId: string): VoiceRoomDTO {
    const sessions = [...(this.rooms.get(channelId)?.values() ?? [])].sort((a, b) => a.joinedAt - b.joinedAt);
    if (sessions.length === 0) return { channelId, peers: [] };
    const rows = this.ctx.db
      .select(summaryColumns)
      .from(users)
      .where(
        inArray(
          users.id,
          sessions.map((s) => s.userId),
        ),
      )
      .all();
    const byId = new Map(rows.map((r) => [r.id, toUserSummary(r)]));
    const peers: VoicePeerDTO[] = [];
    for (const s of sessions) {
      const user = byId.get(s.userId);
      if (!user) continue;
      peers.push({
        peerId: s.peerId,
        user,
        muted: s.muted,
        deafened: s.deafened,
        connected: s.socketId !== null,
        joinedAt: s.joinedAt,
      });
    }
    return { channelId, peers };
  }

  /**
   * STUN as configured; TURN with short-lived credentials (coturn REST API: the username carries
   * the expiry, the password is an HMAC of it with the shared secret — the secret never leaves).
   */
  private iceServersFor(userId: string): IceServerDTO[] {
    const { stunUrls, turnUrls, turnSecret, turnTtlSeconds } = this.ctx.config.voice;
    const servers: IceServerDTO[] = [];
    if (stunUrls.length > 0) servers.push({ urls: stunUrls });
    if (turnUrls.length > 0 && turnSecret) {
      const username = `${Math.floor(Date.now() / 1000) + turnTtlSeconds}:${userId}`;
      const credential = createHmac('sha1', turnSecret).update(username).digest('base64');
      servers.push({ urls: turnUrls, username, credential });
    }
    return servers;
  }
}
