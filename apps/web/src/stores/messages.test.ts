import type { MessagePage, SendAck } from '@creator-network/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idFor, message, range } from '../test/factories';

const get = vi.fn<(path: string) => Promise<MessagePage>>();
vi.mock('../lib/api', () => ({
  api: { get: (path: string) => get(path) },
  errorMessage: (e: unknown) => String(e),
}));

const { useMessages, mergeMessages } = await import('./messages');
const store = () => useMessages.getState();
const channel = () => store().byChannel['chan']!;

/** Fake history of messages 1..total served in pages like the API. */
function serveHistory(total: number) {
  get.mockImplementation(async (path: string) => {
    const q = new URLSearchParams(path.split('?')[1]);
    const limit = Number(q.get('limit') ?? 50);
    const before = q.get('before');
    const after = q.get('after');
    if (before) {
      const end = Number(before.slice(2)) - 1;
      const start = Math.max(1, end - limit + 1);
      return { messages: range(start, end), hasMoreBefore: start > 1, hasMoreAfter: true };
    }
    if (after) {
      const start = Number(after.slice(2)) + 1;
      const end = Math.min(total, start + limit - 1);
      return { messages: start <= end ? range(start, end) : [], hasMoreBefore: true, hasMoreAfter: end < total };
    }
    return {
      messages: range(Math.max(1, total - limit + 1), total),
      hasMoreBefore: total > limit,
      hasMoreAfter: false,
    };
  });
}

beforeEach(() => {
  store().reset();
  localStorage.clear(); // outbox entries must not leak between tests
  store().setUser('u1');
  get.mockReset();
});

afterEach(() => vi.useRealTimers());

describe('message window', () => {
  it('loads the newest page first', async () => {
    serveHistory(1000);
    await store().loadLatest('chan');
    expect(channel().messages).toHaveLength(50);
    expect(channel().messages.at(-1)?.id).toBe(idFor(1000));
    expect(channel().hasMoreBefore).toBe(true);
    expect(channel().hasMoreAfter).toBe(false);
  });

  it('keeps at most 600 messages while scrolling far back, dropping the newest', async () => {
    serveHistory(2000);
    await store().loadLatest('chan');
    for (let i = 0; i < 15; i++) await store().loadOlder('chan');
    const c = channel();
    expect(c.messages.length).toBe(600);
    expect(c.hasMoreAfter).toBe(true); // the newest messages must be fetched again
    expect(c.messages[0]?.id).toBe(idFor(2000 - 16 * 50 + 1));
    // Still strictly ordered, no duplicates.
    const ids = c.messages.map((m) => m.id);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pages back down to the present and drops the oldest instead', async () => {
    serveHistory(2000);
    await store().loadLatest('chan');
    for (let i = 0; i < 15; i++) await store().loadOlder('chan');
    for (let i = 0; i < 40 && channel().hasMoreAfter; i++) await store().loadNewer('chan');
    const c = channel();
    expect(c.hasMoreAfter).toBe(false);
    expect(c.messages.at(-1)?.id).toBe(idFor(2000));
    expect(c.messages.length).toBeLessThanOrEqual(600);
    expect(c.hasMoreBefore).toBe(true);
  });

  it('appends live messages only when the newest messages are loaded', async () => {
    serveHistory(100);
    await store().loadLatest('chan');
    store().receive(message(101));
    expect(channel().messages.at(-1)?.id).toBe(idFor(101));
    // Receiving the same message again (broadcast + ack) does not duplicate it.
    store().receive(message(101));
    expect(channel().messages.filter((m) => m.id === idFor(101))).toHaveLength(1);
  });

  it('merges by id and keeps chronological order', () => {
    const merged = mergeMessages(range(5, 8), [message(3), message(6, { content: 'edited' }), message(9)]);
    expect(merged.map((m) => m.id)).toEqual([3, 5, 6, 7, 8, 9].map(idFor));
    expect(merged.find((m) => m.id === idFor(6))?.content).toBe('edited');
  });
});

describe('outbox', () => {
  it('sends one message at a time per channel, in order, and clears acknowledged ones', async () => {
    serveHistory(10);
    await store().loadLatest('chan');
    const sent: string[] = [];
    let release: (() => void) | null = null;
    store().setTransport({
      isConnected: () => true,
      send: (p) =>
        new Promise<SendAck>((resolve) => {
          sent.push(p.content);
          release = () =>
            resolve({ ok: true, message: message(100 + sent.length, { content: p.content, nonce: p.nonce }) });
        }),
    });
    store().send('chan', { content: 'first', replyTo: null, attachments: [] });
    store().send('chan', { content: 'second', replyTo: null, attachments: [] });
    store().send('chan', { content: 'third', replyTo: null, attachments: [] });
    await Promise.resolve();
    expect(sent).toEqual(['first']); // the second waits for the first acknowledgement
    for (let i = 0; i < 3; i++) {
      (release as unknown as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(sent).toEqual(['first', 'second', 'third']);
    expect(store().pending['chan'] ?? []).toHaveLength(0);
    expect(
      channel()
        .messages.slice(-3)
        .map((m) => m.content),
    ).toEqual(['first', 'second', 'third']);
  });

  it('retries a failed send with the same nonce and keeps the text across reloads', async () => {
    vi.useFakeTimers();
    const nonces: string[] = [];
    let fail = true;
    store().setTransport({
      isConnected: () => true,
      send: async (p) => {
        nonces.push(p.nonce);
        if (fail) throw new Error('timeout');
        return { ok: true, message: message(500, { content: p.content, nonce: p.nonce }) };
      },
    });
    const p = store().send('chan', { content: 'important', replyTo: null, attachments: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(nonces).toHaveLength(1);
    // Persisted for crash/reload safety.
    expect(localStorage.getItem('cn.outbox.v1.u1')).toContain('important');
    fail = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(nonces.length).toBeGreaterThanOrEqual(2);
    expect(new Set(nonces)).toEqual(new Set([p.nonce]));
    expect(store().pending['chan'] ?? []).toHaveLength(0);
  });

  it('replaces an unsent message with the confirmed one in a single update', async () => {
    serveHistory(5);
    await store().loadLatest('chan');
    let release: ((ack: SendAck) => void) | null = null;
    store().setTransport({
      isConnected: () => true,
      send: () => new Promise<SendAck>((resolve) => (release = resolve)),
    });
    const p = store().send('chan', { content: 'hi\n\n', replyTo: null, attachments: [] });
    expect(p.content).toBe('hi'); // normalised like the server, so the text does not change on confirmation
    await Promise.resolve();
    const seen: [pending: number, messages: number][] = [];
    const unsubscribe = useMessages.subscribe((s) =>
      seen.push([(s.pending['chan'] ?? []).length, s.byChannel['chan']?.messages.length ?? 0]),
    );
    (release as unknown as (ack: SendAck) => void)({
      ok: true,
      message: message(100, { content: 'hi', nonce: p.nonce }),
    });
    await new Promise((r) => setTimeout(r, 0));
    unsubscribe();
    // Never a frame with both copies (a duplicate) or with neither (a flash and a jump).
    expect(seen).toEqual([[0, 6]]);
  });

  it('keeps unsent messages when the session ends on its own, for the next sign-in', () => {
    store().setTransport({ isConnected: () => false, send: () => new Promise<SendAck>(() => undefined) });
    store().send('chan', { content: 'typed while offline', replyTo: null, attachments: [] });
    // Session expired: the app tears down without discarding.
    store().reset();
    store().setUser(null);
    expect(store().pending).toEqual({});
    store().setUser('u1');
    expect(store().pending['chan']?.map((p) => [p.content, p.status])).toEqual([['typed while offline', 'queued']]);
  });

  it('deletes unsent messages from the device on an explicit sign-out', () => {
    store().setTransport({ isConnected: () => false, send: () => new Promise<SendAck>(() => undefined) });
    store().send('chan', { content: 'private draft', replyTo: null, attachments: [] });
    expect(localStorage.getItem('cn.outbox.v1.u1')).toContain('private draft');
    store().discardOutbox();
    expect(localStorage.getItem('cn.outbox.v1.u1')).toBeNull();
    expect(store().pending).toEqual({});
  });
});
