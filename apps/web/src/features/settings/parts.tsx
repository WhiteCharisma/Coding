import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{title}</h1>
      {subtitle && <p className="mt-1 text-fg-muted">{subtitle}</p>}
    </header>
  );
}

/** A titled group of settings rendered as a quiet card. */
export function SettingsCard({
  title,
  description,
  children,
  tone = 'default',
  className,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
}) {
  return (
    <section
      className={cn(
        'p-4 sm:p-5',
        tone === 'danger' ? 'rounded-xl border border-danger/30 bg-danger-soft/40' : 'tile',
        className,
      )}
    >
      {title && <h2 className={cn('font-semibold', tone === 'danger' ? 'text-danger' : 'text-fg')}>{title}</h2>}
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      <div className={cn(title || description ? 'mt-4' : undefined)}>{children}</div>
    </section>
  );
}

/** Best-effort, human-friendly label for a session's user agent ("Firefox on Windows"). */
export function describeUserAgent(ua: string): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} · ${os}`;
  return browser ?? os ?? ua.slice(0, 60);
}
