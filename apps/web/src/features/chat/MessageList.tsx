import type { MessageDTO, SelfUser } from '@creator-network/shared';
import { ArrowDown, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import { formatDayLabel, isSameDay } from '../../lib/format';
import { EMPTY_CHANNEL, useMessages, type PendingMessage } from '../../stores/messages';
import { displayAttachment, useUploads, type UploadJob } from '../../stores/uploads';
import { useSession } from '../../stores/session';
import { useUi } from '../../stores/ui';
import { useChat } from '../../stores/chat';
import { Button } from '../../components/ui/button';
import { MessageSkeleton } from '../../components/ui/skeleton';
import { Spinner } from '../../components/ui/spinner';
import { Message, type MessageContext } from './Message';

const GROUP_WINDOW_MS = 7 * 60 * 1000;
const EMPTY_PENDING: PendingMessage[] = [];

function DaySeparator({ time }: { time: number }) {
  return (
    <div
      role="separator"
      className="relative my-4 flex items-center px-4"
      aria-label={formatDayLabel(time, { today: t('common.labels.today'), yesterday: t('common.labels.yesterday') })}
    >
      <div className="h-px flex-1 bg-linear-to-r from-transparent to-line" />
      <span className="glass mx-3 rounded-full bg-elevated px-3 py-0.5 text-[11px] font-semibold tracking-wide text-fg-muted uppercase shadow-none">
        {formatDayLabel(time, { today: t('common.labels.today'), yesterday: t('common.labels.yesterday') })}
      </span>
      <div className="h-px flex-1 bg-linear-to-l from-transparent to-line" />
    </div>
  );
}

function NewDivider() {
  return (
    <div role="separator" className="relative my-2 flex items-center pr-4 pl-4" aria-label={t('chat.list.newMessages')}>
      <div className="h-px flex-1 bg-linear-to-r from-transparent to-danger/70" />
      <span className="gloss ml-2 rounded-full border border-danger/40 bg-danger px-2 py-px text-[10px] font-bold tracking-wider text-danger-fg uppercase shadow-sm">
        {t('chat.list.newMessages')}
      </span>
    </div>
  );
}

/** Shows an unconfirmed message with the same component (and grouping) as a confirmed one. */
function pendingAsMessage(p: PendingMessage, self: SelfUser, jobs: Record<string, UploadJob>): MessageDTO {
  return {
    id: `pending-${p.nonce}`,
    channelId: p.channelId,
    author: {
      id: self.id,
      username: self.username,
      displayName: self.displayName,
      avatarUrl: self.avatarUrl,
      headline: self.headline,
      isDemo: self.isDemo,
      deleted: false,
    },
    content: p.content,
    kind: 'default',
    replyTo: p.replyTo,
    // Files still uploading show with their local preview and progress.
    attachments: [
      ...p.attachments,
      ...(p.uploadKeys ?? []).flatMap((k) => (jobs[k] ? [displayAttachment(jobs[k])] : [])),
    ],
    reactions: [],
    mentions: [],
    mentionEveryone: false,
    editedAt: null,
    deletedAt: null,
    pinnedAt: null,
    createdAt: p.createdAt,
    nonce: p.nonce,
  };
}

/** Same key before and after confirmation, so React keeps the row's DOM node (no flash, no jump). */
const rowKey = (m: MessageDTO, selfId: string) => (m.nonce && m.author?.id === selfId ? `n:${m.nonce}` : m.id);

interface MessageListProps {
  channelId: string;
  ctx: MessageContext;
  beginning: ReactNode;
}

export function MessageList({ channelId, ctx, beginning }: MessageListProps) {
  const state = useMessages((s) => s.byChannel[channelId] ?? EMPTY_CHANNEL);
  const pending = useMessages((s) => s.pending[channelId] ?? EMPTY_PENDING);
  const setAtBottom = useUi((s) => s.setAtBottom);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  const snapshot = useRef({ scrollHeight: 0, scrollTop: 0, atBottom: true });
  const [showJump, setShowJump] = useState(false);
  const initialScrollDone = useRef(false);
  // The first visible message and its distance from the top of the viewport. Restoring it
  // after the message window changes (older page prepended, newest or oldest messages
  // trimmed, edits above the viewport) keeps what the reader is looking at in place.
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const anchorFrame = useRef(0);

  const captureAnchor = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    let row = document
      .elementFromPoint(box.left + Math.min(96, box.width / 2), box.top + 4)
      ?.closest<HTMLElement>('[data-message-id]');
    if (!row || !el.contains(row)) {
      row =
        [...el.querySelectorAll<HTMLElement>('[data-message-id]')].find(
          (r) => r.getBoundingClientRect().bottom > box.top,
        ) ?? null;
    }
    anchor.current = row?.dataset.messageId
      ? { id: row.dataset.messageId, offset: row.getBoundingClientRect().top - box.top }
      : null;
  }, []);

  // "New messages" marker: the read position when the channel was opened (does not move while reading).
  const [lastReadAtOpen] = useState<string | null>(() => {
    const u = useChat.getState().unreads[channelId];
    return u && u.unread > 0 ? u.lastReadId : null;
  });

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 80;
    snapshot.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop, atBottom };
    setAtBottom(atBottom && !useMessages.getState().byChannel[channelId]?.hasMoreAfter);
    setShowJump(distance > 600 || !!useMessages.getState().byChannel[channelId]?.hasMoreAfter);
    if (!anchorFrame.current) {
      anchorFrame.current = requestAnimationFrame(() => {
        anchorFrame.current = 0;
        captureAnchor();
      });
    }
  }, [channelId, setAtBottom, captureAnchor]);

  useEffect(() => () => cancelAnimationFrame(anchorFrame.current), []);

  // Keep the reader's place when the message window changes above or below the viewport.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    if (!el || !a || !initialScrollDone.current) return;
    if (snapshot.current.atBottom && !state.hasMoreAfter) return; // stick-to-bottom handles this
    const row = el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(a.id)}"]`);
    if (!row) return;
    const delta = row.getBoundingClientRect().top - el.getBoundingClientRect().top - a.offset;
    if (Math.abs(delta) > 0.5) el.scrollTop += delta;
  }, [state.messages, state.hasMoreAfter]);

  // Stick to the bottom when new messages arrive while already at the bottom.
  const lastId = state.messages[state.messages.length - 1]?.id;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || state.status !== 'ready') return;
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      if (state.highlightId) return; // handled below
      el.scrollTop = el.scrollHeight;
    } else if (snapshot.current.atBottom && !state.hasMoreAfter) {
      el.scrollTop = el.scrollHeight;
    }
    onScroll();
  }, [lastId, pending.length, state.status, state.hasMoreAfter, state.highlightId, onScroll]);

  // Scroll to a highlighted (jumped-to) message.
  useEffect(() => {
    if (!state.highlightId || state.status !== 'ready') return;
    const node = document.getElementById(`message-${state.highlightId}`);
    node?.scrollIntoView({ block: 'center' });
    const timer = window.setTimeout(() => useMessages.getState().clearHighlight(channelId), 2600);
    return () => window.clearTimeout(timer);
  }, [state.highlightId, state.status, channelId]);

  // Infinite scroll in both directions.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target === topSentinel.current) {
            captureAnchor();
            void useMessages.getState().loadOlder(channelId);
          } else if (e.target === bottomSentinel.current) {
            captureAnchor();
            void useMessages.getState().loadNewer(channelId);
          }
        }
      },
      { root, rootMargin: '400px 0px' },
    );
    if (topSentinel.current) io.observe(topSentinel.current);
    if (bottomSentinel.current) io.observe(bottomSentinel.current);
    return () => io.disconnect();
  }, [channelId, state.status, captureAnchor]);

  const jumpToPresent = async () => {
    if (state.hasMoreAfter) await useMessages.getState().loadLatest(channelId);
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
      snapshot.current.atBottom = true;
    }
  };

  const self = useSession((s) => s.user);
  // Re-evaluated when an upload finishes or fails (progress is shown by the tiles themselves).
  const uploadsSettled = useUploads((s) => s.settled);
  const rows = useMemo(() => {
    const jobs = useUploads.getState().jobs;
    const out: ReactNode[] = [];
    let prev: MessageDTO | null = null;
    let dividerPlaced = false;
    const lastRead = lastReadAtOpen;
    const confirmedNonces = new Set<string>();
    const push = (m: MessageDTO, pendingItem: PendingMessage | null) => {
      const newDay = !prev || !isSameDay(prev.createdAt, m.createdAt);
      const showDivider =
        !pendingItem && !dividerPlaced && lastRead !== null && m.id > lastRead && m.author?.id !== ctx.selfId;
      if (newDay) out.push(<DaySeparator key={`d-${rowKey(m, ctx.selfId)}`} time={m.createdAt} />);
      if (showDivider) {
        out.push(<NewDivider key="new-divider" />);
        dividerPlaced = true;
      }
      const compact =
        !!prev &&
        !newDay &&
        !showDivider &&
        !m.replyTo &&
        prev.author?.id === m.author?.id &&
        m.createdAt - prev.createdAt < GROUP_WINDOW_MS &&
        prev.kind === m.kind;
      out.push(
        <Message
          key={rowKey(m, ctx.selfId)}
          message={m}
          compact={compact}
          highlighted={state.highlightId === m.id}
          ctx={ctx}
          pending={
            pendingItem
              ? {
                  status: pendingItem.status,
                  error: pendingItem.error,
                  onRetry: () => useMessages.getState().retry(channelId, pendingItem.nonce),
                  onDiscard: () => useMessages.getState().discard(channelId, pendingItem.nonce),
                }
              : undefined
          }
        />,
      );
      prev = m;
    };
    for (const m of state.messages) {
      if (m.deletedAt) continue;
      if (m.nonce && m.author?.id === ctx.selfId) confirmedNonces.add(m.nonce);
      push(m, null);
    }
    // Unsent messages follow the newest loaded message (not shown while reading older history).
    if (!state.hasMoreAfter && self) {
      for (const p of pending) if (!confirmedNonces.has(p.nonce)) push(pendingAsMessage(p, self, jobs), p);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uploadsSettled re-reads the uploads store
  }, [
    state.messages,
    state.hasMoreAfter,
    state.highlightId,
    pending,
    self,
    ctx,
    lastReadAtOpen,
    channelId,
    uploadsSettled,
  ]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-area h-full [overflow-anchor:none]"
        data-testid="message-list"
        aria-busy={state.status === 'loading'}
      >
        <div className="flex min-h-full flex-col justify-end pb-3">
          <div ref={topSentinel} aria-hidden className="h-px" />
          {state.status === 'loading' && state.messages.length === 0 && <MessageSkeleton />}
          {state.status === 'error' && state.messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-fg-muted">{state.error ?? t('chat.list.loadFailed')}</p>
              <Button size="sm" onClick={() => void useMessages.getState().loadLatest(channelId)}>
                <RotateCcw /> {t('common.actions.retry')}
              </Button>
            </div>
          )}
          {state.status === 'ready' && !state.hasMoreBefore && beginning}
          <div role="log" aria-live="polite" aria-relevant="additions" aria-label={t('chat.list.label')}>
            {rows}
          </div>
          <div ref={bottomSentinel} aria-hidden className="h-px" />
        </div>
      </div>
      {/* Loading indicators float over the list so they never shift the messages being read. */}
      {state.loadingOlder && (
        <div
          className="pointer-events-none absolute inset-x-0 top-2 flex justify-center"
          role="status"
          aria-label={t('chat.list.loadingOlder')}
        >
          <span className="glass rounded-full bg-overlay p-1.5">
            <Spinner className="text-fg-muted" />
          </span>
        </div>
      )}
      {state.loadingNewer && (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center" role="status">
          <span className="glass rounded-full bg-overlay p-1.5">
            <Spinner className="text-fg-muted" />
          </span>
        </div>
      )}
      {showJump && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            className="pointer-events-auto rounded-full shadow-lg animate-rise-in"
            onClick={() => void jumpToPresent()}
          >
            <ArrowDown /> {t('chat.list.jumpToPresent')}
          </Button>
        </div>
      )}
    </div>
  );
}
