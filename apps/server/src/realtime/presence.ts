import type { PresencePreference, PresenceStatus } from '@creator-network/shared';

interface Entry {
  sockets: Map<string, 'online' | 'idle'>;
  preference: PresencePreference;
  published: PresenceStatus;
}

/**
 * In-memory presence. Never persisted: a restart simply makes everyone
 * reconnect. A short grace period avoids "offline/online" flicker when a page
 * reloads or a connection briefly drops.
 */
export class PresenceTracker {
  private readonly entries = new Map<string, Entry>();
  private readonly offlineTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly publish: (userId: string, status: PresenceStatus) => void,
    private readonly graceMs = 5000,
  ) {}

  /**
   * What everyone has been told. During the grace period after a user's last connection closed
   * (a page reload), that is still their last status: answering "offline" there would show the
   * reloading user as offline, and nothing would correct it once their new connection arrives.
   */
  status(userId: string): PresenceStatus {
    return this.entries.get(userId)?.published ?? 'offline';
  }

  private compute(e: Entry): PresenceStatus {
    if (e.sockets.size === 0 || e.preference === 'invisible') return 'offline';
    if (e.preference === 'dnd') return 'dnd';
    if (e.preference === 'idle') return 'idle';
    for (const s of e.sockets.values()) if (s === 'online') return 'online';
    return 'idle';
  }

  private update(userId: string, e: Entry): void {
    const next = this.compute(e);
    if (next !== e.published) {
      e.published = next;
      this.publish(userId, next);
    }
  }

  connect(userId: string, socketId: string, preference: PresencePreference): void {
    const timer = this.offlineTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.offlineTimers.delete(userId);
    }
    let e = this.entries.get(userId);
    if (!e) {
      e = { sockets: new Map(), preference, published: 'offline' };
      this.entries.set(userId, e);
    }
    e.preference = preference;
    e.sockets.set(socketId, 'online');
    this.update(userId, e);
  }

  disconnect(userId: string, socketId: string): void {
    const e = this.entries.get(userId);
    if (!e) return;
    e.sockets.delete(socketId);
    if (e.sockets.size > 0) {
      this.update(userId, e);
      return;
    }
    const timer = setTimeout(() => {
      this.offlineTimers.delete(userId);
      const current = this.entries.get(userId);
      if (current && current.sockets.size === 0) {
        this.entries.delete(userId);
        if (current.published !== 'offline') this.publish(userId, 'offline');
      }
    }, this.graceMs);
    timer.unref();
    this.offlineTimers.set(userId, timer);
  }

  setActivity(userId: string, socketId: string, activity: 'online' | 'idle'): void {
    const e = this.entries.get(userId);
    if (!e || !e.sockets.has(socketId)) return;
    e.sockets.set(socketId, activity);
    this.update(userId, e);
  }

  setPreference(userId: string, preference: PresencePreference): void {
    const e = this.entries.get(userId);
    if (!e) return;
    e.preference = preference;
    this.update(userId, e);
  }

  onlineCount(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.sockets.size > 0) n++;
    return n;
  }

  clear(): void {
    for (const t of this.offlineTimers.values()) clearTimeout(t);
    this.offlineTimers.clear();
    this.entries.clear();
  }
}
