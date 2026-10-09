import { useEffect, useId, useState } from 'react';
import { cn } from '../../lib/cn';
import { formatTime } from '../../lib/format';

/** The current time, updated on each `stepMs` boundary (one timer, no animation loop). */
export function useNow(stepMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          setNow(Date.now());
          schedule();
        },
        stepMs - (Date.now() % stepMs) + 5,
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [stepMs]);
  return now;
}

const TICKS = Array.from({ length: 12 }, (_, i) => i);

/**
 * A glossy analog clock (Vista gadget style). The hands jump once a second like a quartz clock:
 * a sweeping hand would keep the screen redrawing all the time, even with the wallpaper still.
 */
export function AnalogClock({ className }: { className?: string }) {
  const now = useNow(1000);
  const id = useId().replace(/:/g, '');
  const d = new Date(now);
  const minute = d.getMinutes() * 6 + d.getSeconds() * 0.1;
  const hour = (d.getHours() % 12) * 30 + d.getMinutes() * 0.5;
  return (
    <svg viewBox="0 0 100 100" className={cn('size-28', className)} role="img" aria-label={formatTime(now)}>
      <defs>
        <radialGradient id={`${id}-clock-face`} cx="50%" cy="38%" r="65%">
          <stop offset="0" style={{ stopColor: 'var(--bg-main)' }} />
          <stop offset="0.75" style={{ stopColor: 'var(--command-mid)' }} />
          <stop offset="1" style={{ stopColor: 'var(--command-lo)' }} />
        </radialGradient>
        <linearGradient id={`${id}-clock-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--knob-hi)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--command-edge)' }} />
          <stop offset="1" style={{ stopColor: 'var(--knob-hi)' }} />
        </linearGradient>
        <linearGradient id={`${id}-clock-gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--knob-hi)', stopOpacity: 0.85 }} />
          <stop offset="1" style={{ stopColor: 'var(--knob-hi)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#${id}-clock-rim)`} />
      <circle cx="50" cy="50" r="44.5" fill={`url(#${id}-clock-face)`} stroke="var(--frame-edge)" strokeWidth="0.6" />
      {TICKS.map((i) => (
        <line
          key={i}
          x1="50"
          y1={i % 3 === 0 ? 9 : 10.5}
          x2="50"
          y2={i % 3 === 0 ? 16 : 14}
          stroke="var(--text-2)"
          strokeWidth={i % 3 === 0 ? 2.4 : 1.2}
          strokeLinecap="round"
          transform={`rotate(${i * 30} 50 50)`}
        />
      ))}
      <g style={{ transform: `rotate(${hour}deg)`, transformOrigin: '50px 50px' }}>
        <line x1="50" y1="54" x2="50" y2="28" stroke="var(--text)" strokeWidth="3.6" strokeLinecap="round" />
      </g>
      <g style={{ transform: `rotate(${minute}deg)`, transformOrigin: '50px 50px' }}>
        <line x1="50" y1="56" x2="50" y2="16" stroke="var(--text)" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      <g style={{ transform: `rotate(${d.getSeconds() * 6}deg)`, transformOrigin: '50px 50px' }}>
        <line x1="50" y1="60" x2="50" y2="12" stroke="var(--danger)" strokeWidth="1.1" strokeLinecap="round" />
      </g>
      <circle cx="50" cy="50" r="3.2" fill="var(--accent-lo)" stroke="var(--knob-hi)" strokeWidth="0.8" />
      <ellipse cx="50" cy="30" rx="33" ry="20" fill={`url(#${id}-clock-gloss)`} opacity="0.7" />
    </svg>
  );
}
