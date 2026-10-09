import type { PresenceStatus } from '@creator-network/shared';
import { useId } from 'react';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';

/** Online orb, idle crescent and busy orb (the offline ring is drawn separately). */
const SHAPES = {
  online: 'M6 .8a5.2 5.2 0 1 1 0 10.4A5.2 5.2 0 0 1 6 .8z',
  idle: 'M6 .8a5.2 5.2 0 1 0 5.2 5.2A4 4 0 0 1 6 .8z',
  dnd: 'M6 .8a5.2 5.2 0 1 1 0 10.4A5.2 5.2 0 0 1 6 .8z',
} as const;

/**
 * Presence indicator: a small glossy orb with a darker rim (visible on light and dark glass).
 * Each status has a distinct SHAPE as well as a colour (orb, crescent, barred orb, hollow ring),
 * so it never relies on colour alone.
 */
export function PresenceIcon({ status, className }: { status: PresenceStatus; className?: string }) {
  const gloss = `${useId().replace(/:/g, '')}-gloss`;
  const label = t(`common.presence.${status}`);
  return (
    <svg viewBox="0 0 12 12" className={cn('size-3', className)} role="img" aria-label={label}>
      <title>{label}</title>
      {status === 'offline' ? (
        <circle cx="6" cy="6" r="3.9" fill="none" strokeWidth="2.2" style={{ stroke: 'var(--presence-offline-rim)' }} />
      ) : (
        <>
          <defs>
            <linearGradient id={gloss} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--knob-hi)', stopOpacity: 0.85 }} />
              <stop offset="0.55" style={{ stopColor: 'var(--knob-hi)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path
            d={SHAPES[status]}
            strokeWidth="1"
            strokeLinejoin="round"
            style={{ fill: `var(--presence-${status})`, stroke: `var(--presence-${status}-rim)` }}
          />
          <path d={SHAPES[status]} fill={`url(#${gloss})`} transform="translate(6 6) scale(0.8) translate(-6 -6.6)" />
          {status === 'dnd' && (
            <rect x="3" y="5.1" width="6" height="1.8" rx="0.9" style={{ fill: 'var(--knob-hi)' }} />
          )}
        </>
      )}
    </svg>
  );
}
