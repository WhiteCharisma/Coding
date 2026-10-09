import type { MessageDTO } from '@creator-network/shared';
import { AlertCircle, ArrowDown, Clock, RotateCcw, Trash2 } from 'lucide-react';
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { formatDayLabel, isSameDay } from '../../lib/format';
import { formatMessage } from '../../lib/markdown';
import { EMPTY_CHANNEL, useMessages, type PendingMessage } from '../../stores/messages';
import { useSession } from '../../stores/session';
import { useUi } from '../../stores/ui';
import { useChat } from '../../stores/chat';
import { Button } from '../../components/ui/button';
import { MessageSkeleton } from '../../components/ui/skeleton';
import { Spinner } from '../../components/ui/spinner';
import { UserAvatar } from '../../components/user/UserAvatar';
import { Attachments } from './Attachments';
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
      <div className="h-px flex-1 bg-line-subtle" />
      <span className="mx-3 font-mono text-[11px] font-medium tracking-wide text-fg-muted uppercase">
        {formatDayLabel(time, { today: t('common.labels.today'), yesterday: t('common.labels.yesterday') })}
      </span>
      <div className="h-px flex-1 bg-line-subtle" />
    </div>
  );
}

function NewDivider() {
  return (
    <div role="separator" className="relative my-2 flex items-center pr-4 pl-4" aria-label={t('chat.list.newMessages')}>
      <div className="h-px flex-1 bg-danger/60" />
      <span className="ml-2 rounded-sm bg-danger px-1.5 py-px text-[10px] font-bold tracking-wider text-white uppercase">
        {t('chat.list.newMessages')}
      </span>
    </div>
  );
}

const PendingRow = memo(function PendingRow({
  p,
  onRetry,
  onDiscard,
}: {
  p: PendingMessage;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const user = useSession((s) => s.user);
  const formatted = useMemo(
    () => formatMessage(p.content, { mentions: new Set(), selfUsername: user?.username ?? '' }),
    [p.content, user?.username],
  );
  if (!user) return null;
  return (
    <div className="px-4 pt-1 pb-0.5" data-pending-nonce={p.nonce}>
      <div className="flex gap-3">
        <div className="w-10 shrink-0">
          <UserAvatar
            name={user.displayName}
            src={user.avatarUrl}
            size="lg"
            className={cn(p.status !== 'failed' && 'opacity-70')}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fg">{user.displayName}</p>
          {p.content && (
            <div
              className={cn(
                'text-base break-words whitespace-pre-wrap [overflow-wrap:anywhere]',
                p.status === 'failed' ? 'text-fg-2' : 'text-fg-muted',
              )}
            >
              {formatted}
            </div>
          )}
          {p.attachments.length > 0 && <Attachments items={p.attachments} />}
          <div className="mt-1 flex items-center gap-2 text-xs" role="status">
            {p.status === 'failed' ? (
              <>
                <AlertCircle className="size-3.5 text-danger" />
                <span className="text-danger">{p.error ?? t('chat.message.failed')}</span>
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1 font-semibold text-accent-text hover:underline"
                >
                  <RotateCcw className="size-3" /> {t('chat.message.retry')}
                </button>
                <button
                  type="button"
                  onClick={onDiscard}
                  className="inline-flex items-center gap-1 text-fg-muted hover:text-danger"
                >
                  <Trash2 className="size-3" /> {t('chat.message.discard')}
                </button>
              </>
            ) : p.status === 'sending' ? (
              <>
                <Spinner className="size-3 text-fg-muted" />
                <span className="text-fg-muted">{t('chat.message.pending')}</span>
              </>
            ) : (
              <>
                <Clock className="size-3.5 text-warning" />
                <span className="text-fg-muted">{t('chat.message.queued')}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

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
  }, [channelId, setAtBottom]);

  // Keep the viewport anchored when older messages are prepended.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || state.prependSeq === 0) return;
    const { scrollHeight, scrollTop } = snapshot.current;
    el.scrollTop = el.scrollHeight - (scrollHeight - scrollTop);
  }, [state.prependSeq]);

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
            const el = scrollRef.current;
            if (el) snapshot.current = { ...snapshot.current, scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
            void useMessages.getState().loadOlder(channelId);
          } else if (e.target === bottomSentinel.current) {
            void useMessages.getState().loadNewer(channelId);
          }
        }
      },
      { root, rootMargin: '400px 0px' },
    );
    if (topSentinel.current) io.observe(topSentinel.current);
    if (bottomSentinel.current) io.observe(bottomSentinel.current);
    return () => io.disconnect();
  }, [channelId, state.status]);

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

  const rows = useMemo(() => {
    const out: ReactNode[] = [];
    let prev: MessageDTO | null = null;
    let dividerPlaced = false;
    const lastRead = lastReadAtOpen;
    for (const m of state.messages) {
      if (m.deletedAt) continue;
      const newDay = !prev || !isSameDay(prev.createdAt, m.createdAt);
      const showDivider = !dividerPlaced && lastRead !== null && m.id > lastRead && m.author?.id !== ctx.selfId;
      if (newDay) out.push(<DaySeparator key={`d-${m.id}`} time={m.createdAt} />);
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
      out.push(<Message key={m.id} message={m} compact={compact} highlighted={state.highlightId === m.id} ctx={ctx} />);
      prev = m;
    }
    return out;
  }, [state.messages, state.highlightId, ctx, lastReadAtOpen]);

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
          {state.loadingOlder && (
            <div className="flex justify-center py-3" role="status" aria-label={t('chat.list.loadingOlder')}>
              <Spinner className="text-fg-muted" />
            </div>
          )}
          <div role="log" aria-live="polite" aria-relevant="additions" aria-label={t('chat.list.label')}>
            {rows}
            {!state.hasMoreAfter &&
              pending.map((p) => (
                <Fragment key={p.nonce}>
                  <PendingRow
                    p={p}
                    onRetry={() => useMessages.getState().retry(channelId, p.nonce)}
                    onDiscard={() => useMessages.getState().discard(channelId, p.nonce)}
                  />
                </Fragment>
              ))}
          </div>
          {state.loadingNewer && (
            <div className="flex justify-center py-3">
              <Spinner className="text-fg-muted" />
            </div>
          )}
          <div ref={bottomSentinel} aria-hidden className="h-px" />
        </div>
      </div>
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
