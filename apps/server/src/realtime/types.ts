import type { PresenceStatus, ServerToClientEvents } from '@creator-network/shared';

type EventName = keyof ServerToClientEvents;
type EventPayload<E extends EventName> = Parameters<ServerToClientEvents[E]>;

/**
 * What services may ask of the real-time layer. Services never touch Socket.IO
 * directly; this keeps business logic testable and lets the CLI run without a
 * socket server (see NoopRealtime).
 */
export interface Realtime {
  toChannel<E extends EventName>(channelId: string, event: E, ...payload: EventPayload<E>): void;
  toUser<E extends EventName>(userId: string, event: E, ...payload: EventPayload<E>): void;
  toCommunity<E extends EventName>(communityId: string, event: E, ...payload: EventPayload<E>): void;
  /** Recompute which channel rooms a user's sockets belong to (after permission/membership changes). */
  syncUserRooms(userId: string): void;
  /** Same as syncUserRooms for every connected member of a community. */
  syncCommunity(communityId: string): void;
  disconnectUser(userId: string, reason?: string): void;
  disconnectSession(sessionId: string): void;
  presenceOf(userId: string): PresenceStatus;
  /** Re-read a user's presence preference (e.g. switched to invisible) and broadcast changes. */
  refreshPresence(userId: string): void;
  connectedSocketCount(): number;
}

export class NoopRealtime implements Realtime {
  toChannel(): void {}
  toUser(): void {}
  toCommunity(): void {}
  syncUserRooms(): void {}
  syncCommunity(): void {}
  disconnectUser(): void {}
  disconnectSession(): void {}
  presenceOf(): PresenceStatus {
    return 'offline';
  }
  refreshPresence(): void {}
  connectedSocketCount(): number {
    return 0;
  }
}
