import { useId } from 'react';
import { cn } from '../../lib/cn';

/**
 * Brand mark: a glossy sky orb carrying a sound-wave ribbon — music, games and art moving
 * through one bright space. Colours come from the theme tokens, so it fits Daylight and Twilight.
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 40 40" className={cn('size-8', className)} aria-hidden>
      <defs>
        <radialGradient id={`${id}-orb`} cx="34%" cy="28%" r="78%">
          <stop offset="0%" style={{ stopColor: 'var(--knob-hi)' }} />
          <stop offset="22%" style={{ stopColor: 'var(--aqua)' }} />
          <stop offset="64%" style={{ stopColor: 'var(--accent)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--accent-lo)' }} />
        </radialGradient>
        <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--knob-hi)', stopOpacity: 0.9 }} />
          <stop offset="100%" style={{ stopColor: 'var(--knob-hi)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill={`url(#${id}-orb)`} />
      <circle
        cx="20"
        cy="20"
        r="17.4"
        fill="none"
        style={{ stroke: 'var(--knob-hi)' }}
        strokeOpacity="0.55"
        strokeWidth="1.2"
      />
      <path
        d="M6.5 23c3.2-6.4 6.6-6.4 9.8 0s6.6 6.4 9.8 0 5.2-5.6 7.4-2.4"
        fill="none"
        style={{ stroke: 'var(--knob-hi)' }}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M9 27.5c2.6-3.6 5.2-3.6 7.8 0s5.2 3.6 7.8 0 4.4-3.4 6.4-1.4"
        fill="none"
        style={{ stroke: 'var(--knob-hi)' }}
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <ellipse cx="18.5" cy="10.6" rx="11" ry="6" fill={`url(#${id}-gloss)`} />
      <path
        d="M30.5 7.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"
        style={{ fill: 'var(--knob-hi)' }}
        opacity="0.9"
      />
    </svg>
  );
}

export function Logo({ className, name = 'Creator Network' }: { className?: string; name?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="size-10 drop-shadow-[0_4px_10px_var(--accent-glow)]" />
      <span className="font-display text-xl font-semibold text-fg">{name}</span>
    </span>
  );
}
