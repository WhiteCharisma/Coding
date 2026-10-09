import { useEffect, useState, type CSSProperties } from 'react';
import { useDesktop } from '../../stores/desktop';
import { SkyArt } from '../../components/brand/SkyArt';

/**
 * The desktop behind the windows: a Frutiger Aero scene that is always in gentle motion.
 * Daylight: sun rays turning, clouds drifting, ribbons of light, green hills, glossy bubbles
 * rising, sparkles. Twilight: aurora curtains, twinkling stars, glowing
 * bubbles. Everything moves with transform/opacity only, pauses while the browser window is in
 * the background and stands still with Calm or Reduce motion (styles/vista.css).
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>;

// x position, size (px), rise time (s), start offset (s), sway (px). Fixed so the scene is stable.
const BUBBLES: [string, number, number, number, number][] = [
  ['4%', 46, 30, -4, 18],
  ['11%', 18, 22, -15, 10],
  ['17%', 30, 27, -21, 14],
  ['26%', 14, 19, -6, 8],
  ['33%', 54, 36, -27, 22],
  ['41%', 22, 24, -11, 12],
  ['49%', 12, 18, -2, 7],
  ['57%', 38, 31, -18, 16],
  ['64%', 16, 21, -9, 9],
  ['71%', 28, 26, -24, 14],
  ['78%', 62, 40, -33, 24],
  ['85%', 20, 23, -13, 11],
  ['91%', 34, 29, -7, 15],
  ['97%', 15, 20, -17, 8],
];
// x, y, size (px), duration (s), delay (s)
const SPARKLES: [string, string, number, number, number][] = [
  ['80%', '9%', 18, 4.2, 0],
  ['91%', '15%', 12, 3.6, 1.2],
  ['74%', '4%', 10, 5, 2.4],
  ['86%', '24%', 14, 4.6, 3.1],
  ['22%', '58%', 10, 5.4, 1.8],
  ['63%', '66%', 12, 4.8, 0.6],
];
// x, y, width, drift distance, duration (s)
const CLOUDS: [string, string, string, string, number][] = [
  ['4%', '50%', '34vw', '-8vw', 95],
  ['58%', '64%', '30vw', '-10vw', 110],
  ['30%', '14%', '22vw', '9vw', 130],
  ['70%', '30%', '18vw', '-6vw', 85],
];

function stars(): [string, string, number, number, number][] {
  // A fixed pseudo-random field (no Math.random: the sky must not change between renders).
  const out: [string, string, number, number, number][] = [];
  let seed = 7;
  const next = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 34; i++) {
    out.push([
      `${(next() * 100).toFixed(1)}%`,
      `${(next() * 58).toFixed(1)}%`,
      next() < 0.2 ? 3 : 2,
      3 + next() * 5,
      -next() * 6,
    ]);
  }
  return out;
}
const STARS = stars();

function Bubbles({ glow }: { glow?: boolean }) {
  return (
    <>
      {BUBBLES.map(([x, s, d, delay, sway], i) =>
        glow && i % 2 === 1 ? null : (
          <span
            key={x}
            className="wp-bubble"
            style={{ '--x': x, '--s': `${s}px`, '--d': `${d}s`, '--delay': `${delay}s`, '--sway': `${sway}px` } as Vars}
          >
            <span className={glow ? 'bubble opacity-50' : 'bubble'} />
          </span>
        ),
      )}
    </>
  );
}

/** Ribbons of light sweeping across the scene (one SVG, transformed as a whole). */
function Swoosh({ className, id }: { className: string; id: string }) {
  return (
    <svg className={className} viewBox="0 0 1600 400" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" x2="1">
          <stop offset="0" style={{ stopColor: 'var(--wp-swoosh-1)', stopOpacity: 0 }} />
          <stop offset="0.45" style={{ stopColor: 'var(--wp-swoosh-1)', stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: 'var(--wp-swoosh-1)', stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0" x2="1">
          <stop offset="0" style={{ stopColor: 'var(--wp-swoosh-2)', stopOpacity: 0 }} />
          <stop offset="0.6" style={{ stopColor: 'var(--wp-swoosh-2)', stopOpacity: 0.5 }} />
          <stop offset="1" style={{ stopColor: 'var(--wp-swoosh-2)', stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id={`${id}-c`} x1="0" x2="1">
          <stop offset="0" style={{ stopColor: 'var(--wp-swoosh-3)', stopOpacity: 0 }} />
          <stop offset="0.35" style={{ stopColor: 'var(--wp-swoosh-3)', stopOpacity: 0.45 }} />
          <stop offset="1" style={{ stopColor: 'var(--wp-swoosh-3)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path
        d="M0 250 C300 170 620 320 920 230 C1180 150 1400 210 1600 165 L1600 205 C1400 250 1180 195 920 275 C620 360 300 220 0 300 Z"
        fill={`url(#${id}-a)`}
      />
      <path
        d="M0 300 C260 240 560 330 860 290 C1160 250 1360 300 1600 250 L1600 268 C1360 320 1160 272 860 312 C560 352 260 262 0 318 Z"
        fill={`url(#${id}-b)`}
      />
      <path
        d="M0 205 C340 120 660 240 980 175 C1240 122 1420 160 1600 120 L1600 140 C1420 182 1240 146 980 200 C660 266 340 150 0 228 Z"
        fill={`url(#${id}-c)`}
      />
    </svg>
  );
}

function Landscape({ id }: { id: string }) {
  return (
    <svg className="wp-hills" viewBox="0 0 1600 300" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}-hill-far`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--wp-grass-far)' }} />
          <stop offset="1" style={{ stopColor: 'var(--wp-grass-lo)' }} />
        </linearGradient>
        <linearGradient id={`${id}-hill-near`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--wp-grass-hi)' }} />
          <stop offset="1" style={{ stopColor: 'var(--wp-grass-lo)' }} />
        </linearGradient>
        <linearGradient id={`${id}-crest`} x1="0" x2="1">
          <stop offset="0" style={{ stopColor: 'var(--wp-swoosh-1)', stopOpacity: 0 }} />
          <stop offset="0.3" style={{ stopColor: 'var(--wp-swoosh-1)', stopOpacity: 0.8 }} />
          <stop offset="0.7" style={{ stopColor: 'var(--wp-swoosh-1)', stopOpacity: 0.3 }} />
          <stop offset="1" style={{ stopColor: 'var(--wp-swoosh-1)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path
        d="M0 150 C320 70 640 96 930 150 C1180 196 1400 128 1600 110 L1600 300 L0 300 Z"
        fill={`url(#${id}-hill-far)`}
      />
      <path
        d="M0 215 C250 150 520 160 780 210 C1000 252 1230 236 1600 190 L1600 300 L0 300 Z"
        fill={`url(#${id}-hill-near)`}
      />
      <path
        d="M0 215 C250 150 520 160 780 210 C1000 252 1230 236 1600 190"
        fill="none"
        stroke={`url(#${id}-crest)`}
        strokeWidth="3"
      />
    </svg>
  );
}

function Aurora({ className, id }: { className: string; id: string }) {
  return (
    <svg className={className} viewBox="0 0 1600 600" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}-v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--wp-aurora-3)', stopOpacity: 0 }} />
          <stop offset="0.35" style={{ stopColor: 'var(--wp-aurora-3)', stopOpacity: 0.35 }} />
          <stop offset="0.7" style={{ stopColor: 'var(--wp-aurora-1)', stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: 'var(--wp-aurora-2)', stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id={`${id}-h`} x1="0" x2="1">
          <stop offset="0" style={{ stopColor: 'var(--wp-aurora-1)', stopOpacity: 0 }} />
          <stop offset="0.25" style={{ stopColor: 'var(--wp-aurora-1)', stopOpacity: 1 }} />
          <stop offset="0.75" style={{ stopColor: 'var(--wp-aurora-2)', stopOpacity: 1 }} />
          <stop offset="1" style={{ stopColor: 'var(--wp-aurora-2)', stopOpacity: 0 }} />
        </linearGradient>
        <mask id={`${id}-m`}>
          <rect width="1600" height="600" fill={`url(#${id}-h)`} />
        </mask>
      </defs>
      <g mask={`url(#${id}-m)`}>
        <path
          d="M0 330 C220 180 420 300 640 220 C880 130 1080 290 1300 200 C1440 140 1530 170 1600 150 L1600 470 C1500 430 1420 470 1300 450 C1080 410 880 520 640 460 C420 400 220 520 0 470 Z"
          fill={`url(#${id}-v)`}
        />
      </g>
    </svg>
  );
}

/** After this long without any input, the scene settles until you move again. */
const IDLE_MS = 60_000;
const INPUT_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
/** While you scroll or type, and this long after, the scene holds still. */
const BUSY_MS = 1200;
const HOLD_DELAY_MS = 120;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Keeping a scene in motion means redrawing the screen for every frame: cheap with graphics
 * acceleration, about one processor core without it (docs/PERFORMANCE.md), and every frame
 * competes with what you are doing. So it only moves while someone can enjoy it — not while the
 * browser is in the background, a maximised window covers it (`covered`), a dialog is open,
 * you are scrolling or typing (your eyes are elsewhere, and the list must stay smooth), or
 * nobody has touched anything for a minute.
 * (A CSS `:root:has(dialog)` rule did the dialog part for free, but made every change anywhere
 * on the page restyle the whole document: sending a message took twice as long.)
 */
export function Wallpaper({ covered = false }: { covered?: boolean }) {
  const [background, setBackground] = useState(() => !document.hasFocus());
  const [idle, setIdle] = useState(false);
  const [busy, setBusy] = useState(false);
  const modal = useDesktop((s) => s.modals > 0);
  useEffect(() => {
    const focus = () => setBackground(false);
    const blur = () => setBackground(true);
    window.addEventListener('focus', focus);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('focus', focus);
      window.removeEventListener('blur', blur);
    };
  }, []);
  useEffect(() => {
    let last = performance.now();
    const wake = () => {
      last = performance.now();
      setIdle(false);
    };
    for (const type of INPUT_EVENTS) window.addEventListener(type, wake, { capture: true, passive: true });
    const timer = window.setInterval(() => {
      if (performance.now() - last >= IDLE_MS) setIdle(true);
    }, 5000);
    return () => {
      for (const type of INPUT_EVENTS) window.removeEventListener(type, wake, { capture: true });
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let timer = 0;
    let start = 0;
    const hold = (e: Event) => {
      if (e.type === 'keydown' && !isTyping(e.target)) return;
      // Scrolling: at once, so the rest of the gesture is smooth. Typing: pausing restyles the
      // scene, so not in the same frame as the keystroke (it may be Enter, sending a message).
      if (e.type === 'scroll') setBusy(true);
      else if (!start) start = window.setTimeout(() => setBusy(true), HOLD_DELAY_MS);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        window.clearTimeout(start);
        start = 0;
        setBusy(false);
      }, BUSY_MS);
    };
    window.addEventListener('scroll', hold, { capture: true, passive: true });
    window.addEventListener('keydown', hold, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', hold, { capture: true });
      window.removeEventListener('keydown', hold, { capture: true });
      window.clearTimeout(timer);
      window.clearTimeout(start);
    };
  }, []);
  const paused = background || idle || busy || covered || modal;
  return (
    <div aria-hidden className="wallpaper max-md:hidden" data-paused={paused || undefined}>
      <div className="wp-day">
        <div className="wp-rays" />
        {CLOUDS.map(([x, y, w, dx, d]) => (
          <span
            key={x + y}
            className="wp-cloud"
            style={{ '--x': x, '--y': y, '--w': w, '--dx': dx, '--d': `${d}s` } as Vars}
          />
        ))}
        <Swoosh className="wp-swoosh" id="wp-day-1" />
        <Swoosh className="wp-swoosh wp-swoosh-2" id="wp-day-2" />
        <Landscape id="wp-day-land" />
        <Bubbles />
        {SPARKLES.map(([x, y, s, d, delay]) => (
          <span
            key={x + y}
            className="wp-sparkle"
            style={{ '--x': x, '--y': y, '--s': `${s}px`, '--d': `${d}s`, '--delay': `${delay}s` } as Vars}
          />
        ))}
      </div>
      <div className="wp-night">
        {STARS.map(([x, y, s, d, delay]) => (
          <span
            key={x + y}
            className="wp-star"
            style={
              {
                '--x': x,
                '--y': y,
                '--s': `${s}px`,
                '--d': `${d.toFixed(1)}s`,
                '--delay': `${delay.toFixed(1)}s`,
              } as Vars
            }
          />
        ))}
        <Aurora className="wp-aurora" id="wp-aurora-1" />
        <Aurora className="wp-aurora wp-aurora-2" id="wp-aurora-2" />
        <Swoosh className="wp-swoosh" id="wp-night-1" />
        <Landscape id="wp-night-land" />
        <Bubbles glow />
      </div>
    </div>
  );
}

/** The desktop behind the pages outside the app: the wallpaper, or a still sky on phones. */
export function PublicDesktop() {
  return (
    <>
      <Wallpaper />
      <SkyArt className="md:hidden" />
    </>
  );
}
