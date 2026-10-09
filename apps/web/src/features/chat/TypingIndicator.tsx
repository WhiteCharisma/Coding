import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { useChat, type TypingEntry } from '../../stores/chat';

const EMPTY: Record<string, TypingEntry> = {};

/** Ephemeral "X is typing…" line. Entries expire after a few seconds without updates. */
export function TypingIndicator({ channelId }: { channelId: string }) {
  const entries = useChat((s) => s.typing[channelId] ?? EMPTY);
  const [now, setNow] = useState(() => Date.now());
  const active = Object.values(entries).filter((e) => e.until > now);

  useEffect(() => {
    if (Object.keys(entries).length === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [entries]);

  const text =
    active.length === 0
      ? ''
      : active.length === 1
        ? t('chat.typing.one', { a: active[0]?.name ?? '' })
        : active.length === 2
          ? t('chat.typing.two', { a: active[0]?.name ?? '', b: active[1]?.name ?? '' })
          : t('chat.typing.many');

  return (
    <div className="flex h-5 items-center gap-2 px-5 text-xs text-fg-muted" aria-live="polite">
      {text && (
        <>
          <span className="flex gap-0.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1 rounded-full bg-fg-muted animate-typing"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
          <span className="truncate">{text}</span>
        </>
      )}
    </div>
  );
}
