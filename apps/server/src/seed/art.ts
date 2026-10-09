import { encodePng } from './png';

/**
 * Procedural artwork for demo content. Every image is generated from code, so
 * there are no licensing questions and nothing is hot-linked from the internet.
 */
type RGB = [number, number, number];

export function hex(h: string): RGB {
  const v = h.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function gradient(stops: RGB[], t: number): RGB {
  const x = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i] as RGB, stops[i + 1] as RGB, x - i);
}

export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function render(size: number, fn: (u: number, v: number, px: number) => RGB): Buffer {
  const out = new Uint8Array(size * size * 3);
  const px = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn((x + 0.5) / size, (y + 0.5) / size, px);
      const i = (y * size + x) * 3;
      out[i] = Math.round(Math.min(255, Math.max(0, r)));
      out[i + 1] = Math.round(Math.min(255, Math.max(0, g)));
      out[i + 2] = Math.round(Math.min(255, Math.max(0, b)));
    }
  }
  return encodePng(size, size, out);
}

/** Synthwave sunset with a perspective grid. */
export function sunsetGrid(size: number, palette: string[]): Buffer {
  const [skyTop, skyMid, sunTop, sunBottom, grid, ground] = palette.map(hex) as RGB[];
  const horizon = 0.62;
  return render(size, (u, v, px) => {
    if (v < horizon) {
      let c = gradient([skyTop as RGB, skyMid as RGB], v / horizon);
      const dx = u - 0.5;
      const dy = v - (horizon - 0.02);
      const d = Math.sqrt(dx * dx + dy * dy);
      const r = 0.26;
      const glow = Math.exp(-Math.max(0, d - r) * 9) * 0.35;
      c = mix(c, sunBottom as RGB, glow);
      const inSun = 1 - smooth(r - px, r + px, d);
      const band = v > horizon - 0.2 && Math.sin((v - horizon) * 90) > 0.35 + (horizon - v) * 2 ? 0 : 1;
      return mix(c, gradient([sunTop as RGB, sunBottom as RGB], (v - (horizon - r)) / r), inSun * band);
    }
    const depth = (v - horizon) / (1 - horizon);
    const z = 1 / Math.max(0.02, depth);
    const gx = Math.abs(((u - 0.5) * z * 4) % 1);
    const gz = Math.abs((z * 0.6) % 1);
    const line = Math.max(1 - smooth(0, 0.06 * z * px * 40, Math.min(gx, 1 - gx)), 1 - smooth(0, 0.08, Math.min(gz, 1 - gz)));
    // Fade lines towards the horizon where they would alias into noise.
    return mix(mix(ground as RGB, skyMid as RGB, (1 - depth) * 0.25), grid as RGB, line * smooth(0.04, 0.5, depth) * 0.9);
  });
}

/** Bauhaus-style composition of circles and blocks. */
export function bauhaus(size: number, palette: string[], seed: string): Buffer {
  const rnd = seededRandom(seed);
  const cols = palette.map(hex);
  const bg = cols[0] as RGB;
  const shapes = Array.from({ length: 5 }, (_, i) => ({
    kind: rnd() > 0.45 ? 'circle' : 'rect',
    x: 0.15 + rnd() * 0.7,
    y: 0.15 + rnd() * 0.7,
    r: 0.12 + rnd() * 0.22,
    w: 0.15 + rnd() * 0.4,
    h: 0.08 + rnd() * 0.3,
    half: rnd() > 0.6,
    color: cols[1 + (i % (cols.length - 1))] as RGB,
  }));
  return render(size, (u, v, px) => {
    let c = mix(bg, [255, 255, 255], (1 - v) * 0.06);
    for (const s of shapes) {
      let cover: number;
      if (s.kind === 'circle') {
        const d = Math.hypot(u - s.x, v - s.y);
        cover = 1 - smooth(s.r - px, s.r + px, d);
        if (s.half && v > s.y) cover = 0;
      } else {
        const dx = Math.abs(u - s.x) - s.w / 2;
        const dy = Math.abs(v - s.y) - s.h / 2;
        cover = 1 - smooth(-px, px, Math.max(dx, dy));
      }
      c = mix(c, s.color, cover * 0.92);
    }
    return c;
  });
}

/** Glowing orb on a dark field — lanterns, moons, synth pads. */
export function glow(size: number, palette: string[], seed: string): Buffer {
  const rnd = seededRandom(seed);
  const [bg, inner, outer, ring] = palette.map(hex) as RGB[];
  const cx = 0.38 + rnd() * 0.24;
  const cy = 0.36 + rnd() * 0.22;
  return render(size, (u, v, px) => {
    const d = Math.hypot(u - cx, v - cy);
    let c = mix(bg as RGB, outer as RGB, Math.exp(-d * 4.2) * 0.85);
    c = mix(c, inner as RGB, 1 - smooth(0.11 - px, 0.13 + px, d));
    const rings = Math.abs(Math.sin(d * 46)) < 0.08 && d > 0.2 ? 0.25 * Math.exp(-(d - 0.2) * 4) : 0;
    return mix(c, ring as RGB, rings);
  });
}

/** Layered dunes / waveform landscape. */
export function dunes(size: number, palette: string[], seed: string): Buffer {
  const rnd = seededRandom(seed);
  const cols = palette.map(hex);
  const layers = cols.length - 1;
  const phases = Array.from({ length: layers }, () => rnd() * Math.PI * 2);
  const freqs = Array.from({ length: layers }, () => 2 + rnd() * 4);
  return render(size, (u, v, px) => {
    let c = gradient([cols[0] as RGB, mix(cols[0] as RGB, [255, 255, 255], 0.15)], v);
    for (let i = 0; i < layers; i++) {
      const base = 0.35 + (i / layers) * 0.55;
      const edge = base + Math.sin(u * (freqs[i] as number) + (phases[i] as number)) * 0.05 + Math.sin(u * 13 + i) * 0.012;
      const cover = smooth(edge - px, edge + px, v);
      c = mix(c, mix(cols[i + 1] as RGB, [0, 0, 0], (v - edge) * 0.6), cover);
    }
    return c;
  });
}

/** Concentric op-art ripples. */
export function ripples(size: number, palette: string[], seed: string): Buffer {
  const rnd = seededRandom(seed);
  const [a, b, accent] = palette.map(hex) as RGB[];
  const cx = 0.3 + rnd() * 0.4;
  const cy = 0.3 + rnd() * 0.4;
  return render(size, (u, v) => {
    const d = Math.hypot(u - cx, v - cy);
    const t = 0.5 + 0.5 * Math.sin(d * 60 - Math.atan2(v - cy, u - cx) * 2);
    const c = mix(a as RGB, b as RGB, smooth(0.35, 0.65, t));
    return mix(c, accent as RGB, Math.exp(-d * 9) * 0.8);
  });
}

/** Soft gradient blobs — used for demo avatars. */
export function blobs(size: number, palette: string[], seed: string): Buffer {
  const rnd = seededRandom(seed);
  const [bg, c1, c2] = palette.map(hex) as RGB[];
  const p1 = [0.2 + rnd() * 0.3, 0.2 + rnd() * 0.3];
  const p2 = [0.5 + rnd() * 0.3, 0.5 + rnd() * 0.3];
  return render(size, (u, v) => {
    const d1 = Math.hypot(u - (p1[0] as number), v - (p1[1] as number));
    const d2 = Math.hypot(u - (p2[0] as number), v - (p2[1] as number));
    let c = mix(bg as RGB, c1 as RGB, Math.exp(-d1 * 3.2));
    c = mix(c, c2 as RGB, Math.exp(-d2 * 3.6) * 0.9);
    return c;
  });
}
