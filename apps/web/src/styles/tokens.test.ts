import { describe, expect, it } from 'vitest';
import tokensCss from './tokens.css?raw';

/**
 * WCAG 2 contrast, computed from the design tokens themselves (docs/DESIGN.md → Accessibility).
 * Translucent washes are composited in gamma-encoded sRGB, as browsers do.
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

function parseTokens(block: string): Map<string, Oklch> {
  const tokens = new Map<string, Oklch>();
  const re = /--([\w-]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/g;
  for (const m of block.matchAll(re)) {
    tokens.set(m[1]!, { l: Number(m[2]), c: Number(m[3]), h: Number(m[4]), alpha: m[5] ? Number(m[5]) : 1 });
  }
  return tokens;
}

const [darkBlock = '', afterDark = ''] = tokensCss.split(":root[data-theme='light']");
const lightBlock = afterDark.split(':root {')[0] ?? '';
const themes = { dark: parseTokens(darkBlock), light: parseTokens(lightBlock) };

const SURFACES = ['bg-app', 'bg-rail', 'bg-sidebar', 'bg-main', 'bg-elevated', 'bg-overlay', 'bg-inset'];
const SEMANTIC_TEXT: Record<string, string> = {
  danger: 'danger-soft',
  success: 'success-soft',
  warning: 'warning-soft',
  info: 'info-soft',
  'accent-text': 'accent-soft',
};
const FILLS: [fg: string, bg: string][] = [
  ['accent-fg', 'accent'],
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
  const over = (wash: string, surface: string): Rgb => {
    const top = toLinearSrgb(color(wash)).map(encode);
    const below = solid(surface).map(encode);
    const a = color(wash).alpha;
    return top.map((v, i) => decode(v * a + below[i]! * (1 - a))) as Rgb;
  };

  it.each(['text', 'text-2', 'text-muted'])('--%s is readable (≥ 4.5:1) on every surface', (text) => {
    for (const surface of SURFACES) expect(contrast(solid(text), solid(surface)), surface).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(SEMANTIC_TEXT))('--%s is readable on every surface and on its own soft wash', (text, wash) => {
    for (const surface of SURFACES) {
      expect(contrast(solid(text), solid(surface)), surface).toBeGreaterThanOrEqual(4.5);
      expect(contrast(solid(text), over(wash, surface)), `${wash} over ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(FILLS)('--%s is readable on --%s', (fg, bg) => {
    expect(contrast(solid(fg), solid(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['text-faint', 'presence-offline'])('--%s meets the 3:1 minimum for icons and status marks', (mark) => {
    for (const surface of SURFACES) expect(contrast(solid(mark), solid(surface)), surface).toBeGreaterThanOrEqual(3);
  });
});
