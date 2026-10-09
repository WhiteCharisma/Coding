/**
 * Message state per channel + the outbox for unsent messages.
 *
 * Delivery guarantees (see docs/ARCHITECTURE.md → Message durability):
 *  - Every message gets a client nonce. The outbox is persisted to localStorage
 *    so a reload or crash does not lose unsent text.
 *  - Messages are sent one at a time per channel (keeps order) over the socket
 *    with an acknowledgement. Unacknowledged sends are retried with the SAME
 *    nonce; the server returns the already-stored message, so retries never
 *    duplicate.
 *  - Real-time events and acks are merged by message id / nonce, so receiving
 *    a message twice (broadcast + ack) shows it once.
 *  - After a reconnect, history is fetched from the server (`after=<last id>`):
 *    persisted history, not socket buffers, is the source of truth.
 */
import type {
  AttachmentDTO,
  MessageDTO,
  MessagePage,
  MessageReplyDTO,
  ReactionEvent,
  SendAck,
} from '@creator-network/shared';
import { create } from 'zustand';
import { api, errorMessage } from '../lib/api';
import { createNonce } from '../lib/format';

export type PendingStatus = 'sending' | 'queued' | 'failed';

export interface PendingMessage {
  nonce: string;
  channelId: string;
  content: string;
  replyToId: string | null;
  replyTo: MessageReplyDTO | null;
  attachments: AttachmentDTO[];
  createdAt: number;
  status: PendingStatus;
  attempts: number;
  error?: string;
}

export interface ChannelMessages {
  messages: MessageDTO[];
  hasMoreBefore: boolean;
  /** True while showing an older window that does not reach the newest message. */
  hasMoreAfter: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  loadingOlder: boolean;
  loadingNewer: boolean;
  stale: boolean;
  highlightId: string | null;
  /** Incremented whenever older messages are prepended (lets the list preserve scroll position). */
  prependSeq: number;
}

export interface SendPayload {
  channelId: string;
  content: string;
  nonce: string;
  replyToId: string | null;
  attachmentIds: string[];
}

export interface Transport {
  isConnected(): boolean;
  send(payload: SendPayload): Promise<SendAck>;
}

const PAGE = 50;
const MAX_WINDOW = 600;
const MAX_LOADED_CHANNELS = 25;

const emptyChannel = (): ChannelMessages => ({
  messages: [],
  hasMoreBefore: true,
  hasMoreAfter: false,
  status: 'idle',
  loadingOlder: false,
  loadingNewer: false,
  stale: false,
  highlightId: null,
  prependSeq: 0,
});

/* ----------------------------------------------------------- Pure helpers */

/** Inserts or replaces messages, keeping the list sorted by (time-sortable) id. */
export function mergeMessages(list: MessageDTO[], incoming: MessageDTO[], keepReactions = false): MessageDTO[] {
  if (incoming.length === 0) return list;
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) {
    const existing = byId.get(m.id);
    byId.set(m.id, existing && keepReactions ? { ...m, reactions: existing.reactions } : m);
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function applyReactionEvent(m: MessageDTO, ev: ReactionEvent, selfId: string): MessageDTO {
  const reactions = [...m.reactions];
  const idx = reactions.findIndex((r) => r.emoji === ev.emoji);
  const mine = ev.userId === selfId;
  if (idx >= 0) {
    const r = reactions[idx] as (typeof reactions)[number];
    const next = { ...r, count: ev.count, me: mine ? ev.added : r.me };
    if (next.count <= 0) reactions.splice(idx, 1);
    else reactions[idx] = next;
  } else if (ev.count > 0) {
    reactions.push({ emoji: ev.emoji, count: ev.count, me: mine && ev.added });
  }
  return { ...m, reactions };
}

/* --------------------------------------------------------------- Outbox */

let outboxKey: string | null = null;

function loadOutbox(): PendingMessage[] {
  if (!outboxKey) return [];
  try {
    const raw = localStorage.getItem(outboxKey);
    const list = raw ? (JSON.parse(raw) as PendingMessage[]) : [];
    // Anything that was mid-flight when the page closed is simply queued again (same nonce).
    return list.map((p) => ({ ...p, status: p.status === 'failed' ? 'failed' : 'queued' }));
  } catch {
    return [];
  }
}

function saveOutbox(pending: Record<string, PendingMessage[]>): void {
  if (!outboxKey) return;
  try {
    const all = Object.values(pending).flat();
    if (all.length === 0) localStorage.removeItem(outboxKey);
    else localStorage.setItem(outboxKey, JSON.stringify(all));
  } catch {
    /* storage full or unavailable: the in-memory queue still works */
  }
}

/* ---------------------------------------------------------------- Store */

interface MessagesState {
  byChannel: Record<string, ChannelMessages>;
  pending: Record<string, PendingMessage[]>;
  lru: string[];

  setUser: (userId: string | null) => void;
  setTransport: (t: Transport) => void;
  ensureLoaded: (channelId: string) => Promise<void>;
  loadLatest: (channelId: string) => Promise<void>;
  loadOlder: (channelId: string) => Promise<void>;
  loadNewer: (channelId: string) => Promise<void>;
  jumpTo: (channelId: string, messageId: string) => Promise<void>;
  clearHighlight: (channelId: string) => void;
  catchUp: (channelId: string) => Promise<void>;
  markStale: (exceptChannelId: string | null) => void;

  receive: (m: MessageDTO) => void;
  update: (m: MessageDTO) => void;
  remove: (channelId: string, id: string) => void;
  reaction: (ev: ReactionEvent, selfId: string) => void;
  dropChannel: (channelId: string) => void;

  send: (
    channelId: string,
    input: { content: string; replyTo: MessageReplyDTO | null; attachments: AttachmentDTO[] },
  ) => PendingMessage;
  retry: (channelId: string, nonce: string) => void;
  discard: (channelId: string, nonce: string) => void;
  flush: () => void;
  reset: () => void;
}

let transport: Transport | null = null;
const inflight = new Set<string>();
const retryTimers = new Map<string, number>();

export const useMessages = create<MessagesState>((set, get) => {
  const patchChannel = (
    channelId: string,
    patch: Partial<ChannelMessages> | ((c: ChannelMessages) => Partial<ChannelMessages>),
  ) => {
    const current = get().byChannel[channelId] ?? emptyChannel();
    const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
    set({ byChannel: { ...get().byChannel, [channelId]: next } });
  };

  const touch = (channelId: string) => {
    const lru = [channelId, ...get().lru.filter((id) => id !== channelId)];
    if (lru.length > MAX_LOADED_CHANNELS) {
      const evicted = lru.slice(MAX_LOADED_CHANNELS);
      const byChannel = { ...get().byChannel };
      for (const id of evicted) delete byChannel[id];
      set({ lru: lru.slice(0, MAX_LOADED_CHANNELS), byChannel });
    } else {
      set({ lru });
    }
  };

  const setPending = (channelId: string, list: PendingMessage[]) => {
    const pending = { ...get().pending, [channelId]: list };
    if (list.length === 0) delete pending[channelId];
    set({ pending });
    saveOutbox(pending);
  };

  const updatePending = (channelId: string, nonce: string, patch: Partial<PendingMessage>) => {
    const list = get().pending[channelId];
    if (!list) return;
    setPending(
      channelId,
      list.map((p) => (p.nonce === nonce ? { ...p, ...patch } : p)),
    );
  };

  const fetchPage = (channelId: string, query: string) =>
    api.get<MessagePage>(`/api/channels/${channelId}/messages${query}`);

  const sendNext = async (channelId: string): Promise<void> => {
    if (!transport || !transport.isConnected() || inflight.has(channelId)) return;
    // Strict order per channel: wait for the oldest unsent message (failed ones are skipped
    // until the user retries or discards them).
    const next = get().pending[channelId]?.find((p) => p.status !== 'failed');
    if (!next || next.status !== 'queued' || retryTimers.has(next.nonce)) return;
    inflight.add(channelId);
    updatePending(channelId, next.nonce, { status: 'sending', attempts: next.attempts + 1 });
    try {
      const ack = await transport.send({
        channelId,
        content: next.content,
        nonce: next.nonce,
        replyToId: next.replyToId,
        attachmentIds: next.attachments.map((a) => a.id),
      });
      if (ack.ok) {
        get().receive(ack.message);
      } else if (ack.error.retryable) {
        scheduleRetry(channelId, next.nonce, next.attempts + 1);
      } else {
        updatePending(channelId, next.nonce, { status: 'failed', error: ack.error.message });
      }
    } catch {
      // Timeout or disconnect: the server may or may not have stored it — the nonce makes a retry safe.
      scheduleRetry(channelId, next.nonce, next.attempts + 1);
    } finally {
      inflight.delete(channelId);
      void sendNext(channelId);
    }
  };

  const scheduleRetry = (channelId: string, nonce: string, attempts: number) => {
    updatePending(channelId, nonce, { status: 'queued' });
    const delay = Math.min(30_000, 800 * 2 ** Math.min(attempts, 6));
    const timer = window.setTimeout(() => {
      retryTimers.delete(nonce);
      void sendNext(channelId);
    }, delay);
    retryTimers.set(nonce, timer);
  };

  return {
    byChannel: {},
    pending: {},
    lru: [],

    setUser: (userId) => {
      outboxKey = userId ? `cn.outbox.v1.${userId}` : null;
      const restored = loadOutbox();
      const pending: Record<string, PendingMessage[]> = {};
      for (const p of restored) (pending[p.channelId] ??= []).push(p);
      set({ pending });
    },

    setTransport: (t) => {
      transport = t;
    },

    ensureLoaded: async (channelId) => {
      touch(channelId);
      const c = get().byChannel[channelId];
      if (!c || c.status === 'idle' || c.status === 'error') await get().loadLatest(channelId);
      else if (c.stale) await get().catchUp(channelId);
    },

    loadLatest: async (channelId) => {
      patchChannel(channelId, (c) => ({ status: c.messages.length ? c.status : 'loading', error: undefined }));
      try {
        const page = await fetchPage(channelId, `?limit=${PAGE}`);
        patchChannel(channelId, {
          messages: page.messages,
          hasMoreBefore: page.hasMoreBefore,
          hasMoreAfter: false,
          status: 'ready',
          stale: false,
        });
      } catch (err) {
        patchChannel(channelId, (c) => ({ status: c.messages.length ? 'ready' : 'error', error: errorMessage(err) }));
      }
    },

    loadOlder: async (channelId) => {
      const c = get().byChannel[channelId];
      if (!c || c.loadingOlder || !c.hasMoreBefore || c.status !== 'ready') return;
      const first = c.messages[0];
      if (!first) return;
      patchChannel(channelId, { loadingOlder: true });
      try {
        const page = await fetchPage(channelId, `?before=${first.id}&limit=${PAGE}`);
        patchChannel(channelId, (cur) => {
          let messages = mergeMessages(cur.messages, page.messages);
          let hasMoreAfter = cur.hasMoreAfter;
          // Keep the rendered window bounded while scrolling far back: drop the newest
          // messages (they are re-fetched when scrolling down or jumping to the present).
          if (messages.length > MAX_WINDOW) {
            messages = messages.slice(0, MAX_WINDOW);
            hasMoreAfter = true;
          }
          return {
            messages,
            hasMoreBefore: page.hasMoreBefore,
            hasMoreAfter,
            loadingOlder: false,
            prependSeq: cur.prependSeq + 1,
          };
        });
      } catch {
        patchChannel(channelId, { loadingOlder: false });
      }
    },

    loadNewer: async (channelId) => {
      const c = get().byChannel[channelId];
      if (!c || c.loadingNewer || !c.hasMoreAfter) return;
      const last = c.messages[c.messages.length - 1];
      if (!last) return;
      patchChannel(channelId, { loadingNewer: true });
      try {
        const page = await fetchPage(channelId, `?after=${last.id}&limit=${PAGE}`);
        patchChannel(channelId, (cur) => {
          let messages = mergeMessages(cur.messages, page.messages);
          let hasMoreBefore = cur.hasMoreBefore;
          if (messages.length > MAX_WINDOW) {
            messages = messages.slice(messages.length - MAX_WINDOW);
            hasMoreBefore = true;
          }
          return { messages, hasMoreBefore, hasMoreAfter: page.hasMoreAfter, loadingNewer: false };
        });
      } catch {
        patchChannel(channelId, { loadingNewer: false });
      }
    },

    jumpTo: async (channelId, messageId) => {
      touch(channelId);
      const c = get().byChannel[channelId];
      if (c?.status === 'ready' && c.messages.some((m) => m.id === messageId)) {
        patchChannel(channelId, { highlightId: messageId });
        return;
      }
      patchChannel(channelId, { status: 'loading' });
      try {
        const page = await fetchPage(channelId, `?around=${messageId}&limit=${PAGE}`);
        patchChannel(channelId, {
          messages: page.messages,
          hasMoreBefore: page.hasMoreBefore,
          hasMoreAfter: page.hasMoreAfter,
          status: 'ready',
          stale: false,
          highlightId: messageId,
        });
      } catch (err) {
        patchChannel(channelId, { status: 'error', error: errorMessage(err) });
      }
    },

    clearHighlight: (channelId) => patchChannel(channelId, { highlightId: null }),

    catchUp: async (channelId) => {
      const c = get().byChannel[channelId];
      if (!c || c.status !== 'ready') return;
      if (c.hasMoreAfter) {
        patchChannel(channelId, { stale: false });
        return;
      }
      const last = c.messages[c.messages.length - 1];
      try {
        if (last) {
          // 1) Fetch everything after the newest message we have — no gaps.
          let cursor = last.id;
          for (let i = 0; i < 10; i++) {
            const page = await fetchPage(channelId, `?after=${cursor}&limit=100`);
            patchChannel(channelId, (cur) => ({ messages: mergeMessages(cur.messages, page.messages) }));
            const newest = page.messages[page.messages.length - 1];
            if (!page.hasMoreAfter || !newest) break;
            cursor = newest.id;
            if (i === 9) {
              await get().loadLatest(channelId);
              return;
            }
          }
        }
        // 2) Refresh the newest page so edits, deletions and reactions made while offline appear.
        const latest = await fetchPage(channelId, `?limit=${PAGE}`);
        patchChannel(channelId, (cur) => ({ messages: mergeMessages(cur.messages, latest.messages), stale: false }));
      } catch {
        patchChannel(channelId, { stale: true });
      }
    },

    markStale: (exceptChannelId) => {
      const byChannel = { ...get().byChannel };
      for (const [id, c] of Object.entries(byChannel))
        if (id !== exceptChannelId) byChannel[id] = { ...c, stale: true };
      set({ byChannel });
    },

    receive: (m) => {
      const list = get().pending[m.channelId];
      if (m.nonce && list?.some((p) => p.nonce === m.nonce)) {
        setPending(
          m.channelId,
          list.filter((p) => p.nonce !== m.nonce),
        );
      }
      const c = get().byChannel[m.channelId];
      if (!c || c.status !== 'ready' || c.hasMoreAfter) return;
      patchChannel(m.channelId, (cur) => {
        let messages = mergeMessages(cur.messages, [m], true);
        let hasMoreBefore = cur.hasMoreBefore;
        if (messages.length > MAX_WINDOW) {
          messages = messages.slice(messages.length - MAX_WINDOW);
          hasMoreBefore = true;
        }
        return { messages, hasMoreBefore };
      });
    },

    update: (m) => {
      const c = get().byChannel[m.channelId];
      if (!c || !c.messages.some((x) => x.id === m.id)) return;
      patchChannel(m.channelId, (cur) => ({ messages: mergeMessages(cur.messages, [m], true) }));
    },

    remove: (channelId, id) => {
      const c = get().byChannel[channelId];
      if (!c) return;
      patchChannel(channelId, (cur) => ({
        messages: cur.messages.map((m) =>
          m.id === id
            ? {
                ...m,
                content: '',
                attachments: [],
                reactions: [],
                deletedAt: m.deletedAt ?? Date.now(),
                pinnedAt: null,
              }
            : m,
        ),
      }));
    },

    reaction: (ev, selfId) => {
      const c = get().byChannel[ev.channelId];
      if (!c) return;
      patchChannel(ev.channelId, (cur) => ({
        messages: cur.messages.map((m) => (m.id === ev.messageId ? applyReactionEvent(m, ev, selfId) : m)),
      }));
    },

    dropChannel: (channelId) => {
      const byChannel = { ...get().byChannel };
      delete byChannel[channelId];
      set({ byChannel, lru: get().lru.filter((id) => id !== channelId) });
      if (get().pending[channelId]) setPending(channelId, []);
    },

    send: (channelId, input) => {
      const p: PendingMessage = {
        nonce: createNonce(),
        channelId,
        content: input.content,
        replyToId: input.replyTo?.id ?? null,
        replyTo: input.replyTo,
        attachments: input.attachments,
        createdAt: Date.now(),
        status: 'queued',
        attempts: 0,
      };
      setPending(channelId, [...(get().pending[channelId] ?? []), p]);
      void sendNext(channelId);
      return p;
    },

    retry: (channelId, nonce) => {
      const timer = retryTimers.get(nonce);
      if (timer) {
        window.clearTimeout(timer);
        retryTimers.delete(nonce);
      }
      updatePending(channelId, nonce, { status: 'queued', error: undefined });
      void sendNext(channelId);
    },

    discard: (channelId, nonce) => {
      setPending(
        channelId,
        (get().pending[channelId] ?? []).filter((p) => p.nonce !== nonce),
      );
    },

    flush: () => {
      for (const channelId of Object.keys(get().pending)) void sendNext(channelId);
    },

    reset: () => {
      for (const t of retryTimers.values()) window.clearTimeout(t);
      retryTimers.clear();
      inflight.clear();
      set({ byChannel: {}, pending: {}, lru: [] });
    },
  };
});

export const EMPTY_CHANNEL: ChannelMessages = emptyChannel();
