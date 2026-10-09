import { describe, expect, it } from 'vitest';
import { WINDOW_COLORS } from '../stores/ui';
import tokensCss from './tokens.css?raw';

/**
 * WCAG 2 contrast, computed from the design tokens themselves (docs/DESIGN.md → Accessibility).
 * Glass surfaces are translucent: each one is composited over every colour of the sky behind it
 * (and soft washes over the result), in gamma-encoded sRGB as browsers do, and the worst case
 * must pass.
 */

type Rgb = [number, number, number];
interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

function toLinearSrgb({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const;
  const rgb: Rgb = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ];
  return rgb.map((v) => Math.min(1, Math.max(0, v))) as Rgb;
}

const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function contrast(x: Rgb, y: Rgb): number {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Paints a (possibly translucent) colour over an opaque linear-sRGB background. */
function over(top: Oklch, below: Rgb): Rgb {
  const t = toLinearSrgb(top).map(encode);
  const b = below.map(encode);
  return t.map((v, i) => decode(v * top.alpha + b[i]! * (1 - top.alpha))) as Rgb;
}

function parseTokens(block: string): Map<string, Oklch> {
  const tokens = new Map<string, Oklch>();
  const re = /--([\w-]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/g;
  for (const m of block.matchAll(re)) {
    tokens.set(m[1]!, { l: Number(m[2]), c: Number(m[3]), h: Number(m[4]), alpha: m[5] ? Number(m[5]) : 1 });
  }
  return tokens;
}

function parseNumbers(block: string): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const m of block.matchAll(/--([\w-]+):\s*([\d.]+);/g)) numbers.set(m[1]!, Number(m[2]));
  return numbers;
}

const [lightBlock = '', afterLight = ''] = tokensCss.split(":root[data-theme='dark']");
const darkBlock = afterLight.split(':root {')[0] ?? '';
const themes = { light: parseTokens(lightBlock), dark: parseTokens(darkBlock) };
const themeNumbers = { light: parseNumbers(lightBlock), dark: parseNumbers(darkBlock) };

const SKY = ['sky-1', 'sky-2', 'sky-3', 'sky-4'];
/** Surfaces that carry text (the rail only carries icons and badges). */
const TEXT_SURFACES = ['bg-app', 'bg-sidebar', 'bg-main', 'bg-elevated', 'bg-overlay', 'bg-inset'];
const ICON_SURFACES = [...TEXT_SURFACES, 'bg-rail'];
const SEMANTIC_TEXT: Record<string, string> = {
  danger: 'danger-soft',
  success: 'success-soft',
  warning: 'warning-soft',
  info: 'info-soft',
  'accent-text': 'accent-soft',
};
const FILLS: [fg: string, bg: string][] = [
  ['accent-fg', 'accent'],
  ['accent-fg', 'accent-hi'],
  ['accent-fg', 'accent-lo'],
  ['accent-fg', 'accent-hover'],
  ['danger-fg', 'danger'],
  ['danger-fg', 'danger-hover'],
  ['success-fg', 'success'],
];

describe.each(Object.entries(themes))('%s theme contrast', (_theme, tokens) => {
  const color = (name: string): Oklch => {
    const token = tokens.get(name);
    if (!token) throw new Error(`token --${name} is not defined in this theme`);
    return token;
  };
  const solid = (name: string) => toLinearSrgb(color(name));
  /** Every way a surface can look: composited over each colour of the sky. */
  const surfaceLooks = (surface: string) =>
    SKY.map((sky) => ({ name: `${surface} over ${sky}`, rgb: over(color(surface), solid(sky)) }));

  it.each(['text', 'text-2', 'text-muted'])('--%s is readable (≥ 4.5:1) on every glass surface', (text) => {
    for (const surface of TEXT_SURFACES) {
      for (const look of surfaceLooks(surface))
        expect(contrast(solid(text), look.rgb), look.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(Object.entries(SEMANTIC_TEXT))('--%s is readable on every surface and on its own soft wash', (text, wash) => {
    for (const surface of TEXT_SURFACES) {
      for (const look of surfaceLooks(surface)) {
        expect(contrast(solid(text), look.rgb), look.name).toBeGreaterThanOrEqual(4.5);
        expect(contrast(solid(text), over(color(wash), look.rgb)), `${wash} on ${look.name}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });

  it.each(FILLS)('--%s is readable on --%s', (fg, bg) => {
    expect(contrast(solid(fg), solid(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('text on a glossy button stays readable under the top highlight', () => {
    // Buttons get a sheen over their upper part; text overlaps its lower edge (≈ 30 % of it).
    const sheen = { ...color('glass-sheen'), alpha: color('glass-sheen').alpha * 0.3 };
    expect(contrast(solid('accent-fg'), over(sheen, solid('accent-hi')))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['bg-tile', 'bg-main'],
    ['bg-tile', 'bg-sidebar'],
    ['bg-tile', 'bg-elevated'],
  ])('text is readable on --%s tiles placed on --%s', (tile, pane) => {
    for (const look of surfaceLooks(pane)) {
      const surface = over(color(tile), look.rgb);
      for (const text of ['text', 'text-2', 'text-muted', 'accent-text', 'danger', 'success'])
        expect(contrast(solid(text), surface), `${text} on ${tile} on ${look.name}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(solid('text-faint'), surface), `text-faint on ${tile} on ${look.name}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('text stays readable on a selected list item (both ends of its gradient, on the sidebar glass)', () => {
    for (const band of ['selection-hi', 'selection-lo']) {
      for (const look of surfaceLooks('bg-sidebar')) {
        const selected = over(color(band), look.rgb);
        for (const text of ['text', 'text-2', 'accent-text'])
          expect(contrast(solid(text), selected), `${text} on ${band} over ${look.name}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(['text-faint', 'presence-online-rim', 'presence-idle-rim', 'presence-dnd-rim', 'presence-offline-rim'])(
    '--%s meets the 3:1 minimum for icons and status marks',
    (mark) => {
      for (const surface of ICON_SURFACES) {
        for (const look of surfaceLooks(surface))
          expect(contrast(solid(mark), look.rgb), look.name).toBeGreaterThanOrEqual(3);
      }
    },
  );
});

/*
 * Vista glass (styles/vista.css). Text on glass is checked over both extremes of the wallpaper
 * behind it (--wallpaper-bright / --wallpaper-dark), with the reflection streaks on top.
 */
describe.each(Object.entries(themes))('%s theme: Vista glass', (theme, tokens) => {
  const numbers = themeNumbers[theme as keyof typeof themeNumbers];
  const color = (name: string): Oklch => {
    const token = tokens.get(name);
    if (!token) throw new Error(`token --${name} is not defined in this theme`);
    return token;
  };
  const num = (name: string): number => {
    const value = numbers.get(name);
    if (value === undefined) throw new Error(`number --${name} is not defined in this theme`);
    return value;
  };
  const solid = (name: string) => toLinearSrgb(color(name));
  const WALLPAPER = ['wallpaper-bright', 'wallpaper-dark'];
  /*
   * The title's halo: three blurred copies of the text in --glass-title-glow (4, 8 and 14 px).
   * Beside a single thin stroke they cover the glass by about 40 %; denser text gets more.
   */
  const HALO = 0.4;

  it('window titles stay readable on the glass in every window colour, intensity and wallpaper', () => {
    const glow = color('glass-title-glow');
    const halo = { ...glow, alpha: glow.alpha * HALO };
    const alphas = [num('frame-a-min'), num('frame-a-max'), 1 /* transparency off */];
    for (const [name, { h, c }] of Object.entries(WINDOW_COLORS)) {
      for (const alpha of alphas) {
        for (const wallpaper of WALLPAPER) {
          const glass = over(color('streak'), over({ l: num('frame-l'), c, h, alpha }, solid(wallpaper)));
          const where = `${name} glass at ${alpha} over ${wallpaper}`;
          expect(contrast(solid('glass-title'), over(halo, glass)), where).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('taskbar, Start menu and gadget text stays readable on black glass', () => {
    // The lightest part of each black glass, over the wallpaper or over a window (Start menu).
    for (const tint of ['taskbar-hi', 'gadget-hi']) {
      for (const behind of [...WALLPAPER, 'bg-main']) {
        const glass = over(color('streak'), over(color(tint), solid(behind)));
        for (const text of ['taskbar-text', 'taskbar-text-muted'])
          expect(contrast(solid(text), glass), `${text} on ${tint} over ${behind}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('text stays readable on the command bar and information bars of a window', () => {
    for (const band of ['command-hi', 'command-mid', 'command-lo']) {
      for (const text of ['text', 'text-2', 'text-muted', 'accent-text'])
        expect(contrast(solid(text), solid(band)), `${text} on ${band}`).toBeGreaterThanOrEqual(4.5);
      // The call bar mixes the success wash into the command bar (styles/vista.css).
      const call = over({ ...color('success-soft'), alpha: color('success-soft').alpha * 0.8 }, solid(band));
      for (const text of ['text', 'text-2', 'success'])
        expect(contrast(solid(text), call), `${text} on the call bar (${band})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('taskbar icons stay visible while a button flashes for attention', () => {
    for (const band of ['attention-hi', 'attention-mid', 'attention-lo']) {
      for (const behind of WALLPAPER) {
        const button = over(color(band), over(color('taskbar-hi'), solid(behind)));
        expect(contrast(solid('taskbar-text'), button), `${band} over ${behind}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
