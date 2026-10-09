/**
 * Message formatting: a deliberately small markdown subset rendered as React
 * elements (never via innerHTML), so user content cannot inject markup.
 *
 *   **bold**  *italic* / _italic_  ~~strike~~  `code`  ```code block```
 *   http(s) links (validated)  @mentions  @everyone / @here
 */
import { isSafeHttpUrl } from '@creator-network/shared';
import type { ReactNode } from 'react';

export interface FormatContext {
  /** Lowercased usernames that were resolved as mentions by the server. */
  mentions: Set<string>;
  selfUsername: string;
  onMentionClick?: (username: string) => void;
}

const INLINE_RE =
  /(\*\*(?=\S)[\s\S]*?\S\*\*)|(~~(?=\S)[\s\S]*?\S~~)|(\*(?=\S)[^*\n]*?\S\*)|(\b_(?=\S)[^_\n]*?\S_\b)|(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])|((?:^|(?<=[^A-Za-z0-9_@.]))@[a-z0-9](?:[a-z0-9_.-]{0,30}[a-z0-9])?(?![A-Za-z0-9_]))/gi;

function renderInline(text: string, ctx: FormatContext, keyPrefix: string, depth = 0): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (match[1] && depth < 3)
      out.push(
        <strong key={key} className="font-semibold text-fg">
          {renderInline(token.slice(2, -2), ctx, key, depth + 1)}
        </strong>,
      );
    else if (match[2] && depth < 3)
      out.push(
        <s key={key} className="text-fg-muted">
          {renderInline(token.slice(2, -2), ctx, key, depth + 1)}
        </s>,
      );
    else if ((match[3] || match[4]) && depth < 3)
      out.push(<em key={key}>{renderInline(token.slice(1, -1), ctx, key, depth + 1)}</em>);
    else if (match[5] && isSafeHttpUrl(token)) {
      const display = token.replace(/^https?:\/\//, '');
      out.push(
        <a
          key={key}
          href={token}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="break-words text-accent-text underline decoration-accent-text/40 underline-offset-2 hover:decoration-accent-text"
        >
          {display.length > 60 ? `${display.slice(0, 57)}…` : display}
        </a>,
      );
    } else if (match[6]) {
      const name = token.slice(1).toLowerCase();
      const isEveryone = name === 'everyone' || name === 'here';
      const resolved = isEveryone || ctx.mentions.has(name);
      if (resolved) {
        const self = isEveryone || name === ctx.selfUsername;
        out.push(
          <button
            key={key}
            type="button"
            onClick={isEveryone ? undefined : () => ctx.onMentionClick?.(name)}
            className={
              self
                ? 'rounded px-0.5 font-medium text-accent-text bg-accent-soft hover:underline'
                : 'rounded px-0.5 font-medium text-info bg-info-soft hover:underline'
            }
          >
            {token}
          </button>,
        );
      } else {
        out.push(token);
      }
    } else {
      out.push(token);
    }
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderTextBlock(text: string, ctx: FormatContext, keyPrefix: string): ReactNode[] {
  // Inline code first: its contents are never formatted.
  const parts = text.split(/(`[^`\n]+`)/g);
  return parts.flatMap((part, idx): ReactNode[] => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return [
        <code key={`${keyPrefix}-c${idx}`} className="rounded bg-code px-1 py-0.5 font-mono text-[0.86em] text-fg-2">
          {part.slice(1, -1)}
        </code>,
      ];
    }
    return renderInline(part, ctx, `${keyPrefix}-t${idx}`);
  });
}

export function formatMessage(content: string, ctx: FormatContext): ReactNode[] {
  const out: ReactNode[] = [];
  const segments = content.split(/(```[\s\S]*?```)/g);
  segments.forEach((seg, idx) => {
    if (seg.startsWith('```') && seg.endsWith('```') && seg.length >= 6) {
      const body = seg.slice(3, -3).replace(/^[a-z0-9+-]*\n/i, '');
      out.push(
        <pre
          key={`b${idx}`}
          className="my-1 max-w-full overflow-x-auto rounded-md border border-line-subtle bg-code px-3 py-2 font-mono text-[0.84em] leading-relaxed text-fg-2"
        >
          <code>{body.replace(/\n$/, '')}</code>
        </pre>,
      );
    } else if (seg) {
      out.push(...renderTextBlock(seg, ctx, `s${idx}`));
    }
  });
  return out;
}

/** Plain-text preview of message content (for notifications, replies, DM lists). */
export function stripFormatting(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Renders search highlights (\u0001…\u0002 markers from the server) safely. */
export function renderHighlight(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  // eslint-disable-next-line no-control-regex -- \u0001/\u0002 are the server's highlight delimiters
  const re = /\u0001([^\u0002]*)\u0002/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    out.push(
      <mark key={i++} className="rounded bg-accent-soft px-0.5 text-accent-text">
        {m[1]}
      </mark>,
    );
    last = start + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
