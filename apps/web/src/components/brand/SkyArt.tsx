import { useId } from 'react';
import { cn } from '../../lib/cn';

/** Glass bubbles drifting in the sky: position (% of the area) and size (px). Static. */
const BUBBLES = [
  { x: 6, y: 18, size: 54 },
  { x: 12, y: 30, size: 22 },
  { x: 84, y: 14, size: 34 },
  { x: 91, y: 26, size: 70 },
  { x: 78, y: 62, size: 26 },
  { x: 18, y: 74, size: 40 },
  { x: 56, y: 8, size: 18 },
  { x: 66, y: 84, size: 48 },
];

const RIBBONS = [
  // [path, colour token, stroke width, opacity]
  ['M-60 300 C 280 120 620 400 980 230 S 1380 110 1520 170', '--knob-hi', 3, 0.95],
  ['M-60 330 C 300 160 650 420 1000 268 S 1400 160 1520 214', '--aqua', 14, 0.32],
  ['M-60 360 C 320 210 680 440 1020 300 S 1410 210 1520 260', '--lavender', 26, 0.18],
  ['M-60 250 C 260 140 560 330 900 210 S 1340 90 1520 120', '--knob-hi', 1.5, 0.7],
] as const;

/**
 * Decorative Aero sky details for the public pages: luminous light ribbons and a few glass
 * bubbles, drawn in theme colours. Painted once (no animation), hidden from assistive tech.
 */
export function SkyArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <svg
        className="absolute inset-x-0 bottom-[6%] h-[44%] min-h-64 w-full"
        viewBox="0 0 1440 420"
        preserveAspectRatio="none"
      >
        <defs>
          {RIBBONS.map(([, token], i) => (
            <linearGradient key={i} id={`${id}-r${i}`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" style={{ stopColor: `var(${token})`, stopOpacity: 0 }} />
              <stop offset="0.5" style={{ stopColor: `var(${token})`, stopOpacity: 1 }} />
              <stop offset="1" style={{ stopColor: `var(${token})`, stopOpacity: 0 }} />
            </linearGradient>
          ))}
        </defs>
        {RIBBONS.map(([d, , width, opacity], i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={`url(#${id}-r${i})`}
            strokeWidth={width}
            strokeLinecap="round"
            opacity={opacity}
          />
        ))}
      </svg>
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className="bubble absolute max-sm:hidden"
          style={{ left: `${b.x}%`, top: `${b.y}%`, width: b.size, height: b.size }}
        />
      ))}
    </div>
  );
}
