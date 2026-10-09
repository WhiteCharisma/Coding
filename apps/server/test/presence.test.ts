import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresenceStatus } from '@creator-network/shared';
import { PresenceTracker } from '../src/realtime/presence';

describe('PresenceTracker', () => {
  let events: Array<[string, PresenceStatus]>;
  let tracker: PresenceTracker;
  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    tracker = new PresenceTracker((userId, status) => events.push([userId, status]), 5000);
  });
  afterEach(() => {
    tracker.clear();
    vi.useRealTimers();
  });

  it('keeps a reloading user online, for themselves and for everyone else', () => {
    tracker.connect('u1', 's1', 'online');
    tracker.disconnect('u1', 's1');
    // The new page asks for presence before its own connection is up.
    expect(tracker.status('u1')).toBe('online');
    tracker.connect('u1', 's2', 'online');
    expect(tracker.status('u1')).toBe('online');
    vi.advanceTimersByTime(10_000);
    expect(tracker.status('u1')).toBe('online');
    expect(events).toEqual([['u1', 'online']]);
  });

  it('goes offline once the grace period ends without a new connection', () => {
    tracker.connect('u1', 's1', 'online');
    tracker.disconnect('u1', 's1');
    vi.advanceTimersByTime(4999);
    expect(tracker.status('u1')).toBe('online');
    vi.advanceTimersByTime(1);
    expect(tracker.status('u1')).toBe('offline');
    expect(events).toEqual([
      ['u1', 'online'],
      ['u1', 'offline'],
    ]);
  });

  it('stays online while another tab is still connected', () => {
    tracker.connect('u1', 's1', 'online');
    tracker.connect('u1', 's2', 'online');
    tracker.disconnect('u1', 's1');
    vi.advanceTimersByTime(10_000);
    expect(tracker.status('u1')).toBe('online');
    expect(events).toEqual([['u1', 'online']]);
  });

  it('reports idle, do-not-disturb and invisible as everyone sees them', () => {
    tracker.connect('u1', 's1', 'online');
    tracker.setActivity('u1', 's1', 'idle');
    expect(tracker.status('u1')).toBe('idle');
    tracker.setPreference('u1', 'dnd');
    expect(tracker.status('u1')).toBe('dnd');
    tracker.setPreference('u1', 'invisible');
    expect(tracker.status('u1')).toBe('offline');
    expect(tracker.status('nobody')).toBe('offline');
  });
});
