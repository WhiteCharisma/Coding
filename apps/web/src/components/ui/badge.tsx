import type { ReactNode } from 'react';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { Tooltip } from './tooltip';

const tones = {
  neutral: 'bg-active text-fg-2',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full px-2 text-2xs font-semibold tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Marks seeded demonstration content so it is never mistaken for real data. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Tooltip content={t('common.labels.demoHint')}>
      <span
        tabIndex={0}
        className={cn(
          'inline-flex h-4 items-center rounded border border-info/40 px-1 text-[10px] font-semibold tracking-wider text-info uppercase',
          className,
        )}
      >
        {t('common.labels.demo')}
      </span>
    </Tooltip>
  );
}

/** Unread / mention counter. */
export function CountBadge({
  count,
  tone = 'accent',
  className,
  label,
}: {
  count: number;
  tone?: 'accent' | 'danger';
  className?: string;
  label?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={label}
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 font-mono text-[10.5px] leading-none font-bold tabular-nums',
        tone === 'danger' ? 'bg-danger text-danger-fg' : 'bg-accent text-accent-fg',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-inset px-1.5 py-0.5 font-mono text-[10.5px] text-fg-muted">
      {children}
    </kbd>
  );
}
