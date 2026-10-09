import { create } from 'zustand';

export type Theme = 'dark' | 'light' | 'system';
export type Density = 'comfortable' | 'compact';
/** full: every effect · calm: quick transitions only, no decorative effects · reduced: (almost) none. */
export type MotionPref = 'full' | 'calm' | 'reduced';
export type ContextPanel = 'members' | 'pins' | null;

/**
 * Window colours of the glass frames (named after the Windows 7 palette). Hue and chroma of the
 * frame tint; its lightness comes from the theme (tokens.css → --frame-l).
 */
export const WINDOW_COLORS = {
  sky: { h: 225, c: 0.09 },
  sea: { h: 198, c: 0.1 },
  leaf: { h: 150, c: 0.11 },
  lime: { h: 125, c: 0.13 },
  sun: { h: 90, c: 0.13 },
  pumpkin: { h: 55, c: 0.14 },
  ruby: { h: 22, c: 0.15 },
  fuchsia: { h: 342, c: 0.14 },
  violet: { h: 300, c: 0.12 },
  lavender: { h: 280, c: 0.07 },
  slate: { h: 250, c: 0.025 },
  frost: { h: 230, c: 0 },
} as const;
export type WindowColor = keyof typeof WINDOW_COLORS;

export interface GlassPrefs {
  color: WindowColor;
  /** Colour intensity, 0–100 (how strongly the frame is tinted). */
  strength: number;
  /** Off: solid frames without blur (like Windows Vista Basic). */
  transparency: boolean;
}

const GLASS_KEY = 'cn.glass';
const DEFAULT_GLASS: GlassPrefs = { color: 'sky', strength: 40, transparency: true };

function readGlass(): GlassPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(GLASS_KEY) ?? 'null') as Partial<GlassPrefs> | null;
    if (!raw || typeof raw !== 'object') return DEFAULT_GLASS;
    return {
      color: raw.color && raw.color in WINDOW_COLORS ? raw.color : DEFAULT_GLASS.color,
      strength:
        typeof raw.strength === 'number' && Number.isFinite(raw.strength)
          ? Math.min(100, Math.max(0, Math.round(raw.strength)))
          : DEFAULT_GLASS.strength,
      transparency: raw.transparency !== false,
    };
  } catch {
    return DEFAULT_GLASS;
  }
}

/** Writes the glass settings onto <html> (public/theme-init.js does the same before first paint). */
export function applyGlass(prefs: GlassPrefs): void {
  const root = document.documentElement;
  const { h, c } = WINDOW_COLORS[prefs.color];
  root.style.setProperty('--frame-h', String(h));
  root.style.setProperty('--frame-c', String(c));
  root.style.setProperty('--frame-strength', String(prefs.strength / 100));
  if (prefs.transparency) root.removeAttribute('data-transparency');
  else root.setAttribute('data-transparency', 'off');
}

function read<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* per-device convenience only */
  }
}

export function applyTheme(theme: Theme): void {
  const resolved =
    theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  document.documentElement.setAttribute('data-theme', resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', resolved === 'light' ? '#7cc0f0' : '#0d1f45');
}

interface UiState {
  theme: Theme;
  density: Density;
  motion: MotionPref;
  contextPanel: ContextPanel;
  mobileSidebarOpen: boolean;
  /** Whether the active message list is scrolled to the newest message. */
  atBottom: boolean;
  glass: GlassPrefs;
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  setMotion: (m: MotionPref) => void;
  toggleContextPanel: (p: Exclude<ContextPanel, null>) => void;
  setContextPanel: (p: ContextPanel) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setAtBottom: (v: boolean) => void;
  setGlass: (patch: Partial<GlassPrefs>) => void;
}

export const useUi = create<UiState>((set, get) => ({
  theme: read<Theme>('cn.theme', 'light', ['dark', 'light', 'system']),
  density: read<Density>('cn.density', 'comfortable', ['comfortable', 'compact']),
  motion: read<MotionPref>('cn.motion', 'full', ['full', 'calm', 'reduced']),
  contextPanel:
    read<'members' | 'pins' | 'none'>('cn.panel', 'members', ['members', 'pins', 'none']) === 'none'
      ? null
      : read<'members' | 'pins'>('cn.panel', 'members', ['members', 'pins']),
  mobileSidebarOpen: false,
  atBottom: true,
  glass: readGlass(),
  setTheme: (theme) => {
    write('cn.theme', theme);
    applyTheme(theme);
    set({ theme });
  },
  setDensity: (density) => {
    write('cn.density', density);
    if (density === 'compact') document.documentElement.setAttribute('data-density', 'compact');
    else document.documentElement.removeAttribute('data-density');
    set({ density });
  },
  setMotion: (motion) => {
    write('cn.motion', motion);
    if (motion === 'full') document.documentElement.removeAttribute('data-motion');
    else document.documentElement.setAttribute('data-motion', motion);
    set({ motion });
  },
  toggleContextPanel: (p) => {
    const next = get().contextPanel === p ? null : p;
    write('cn.panel', next ?? 'none');
    set({ contextPanel: next });
  },
  setContextPanel: (p) => {
    write('cn.panel', p ?? 'none');
    set({ contextPanel: p });
  },
  setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
  setAtBottom: (atBottom) => {
    if (get().atBottom !== atBottom) set({ atBottom });
  },
  setGlass: (patch) => {
    const glass = { ...get().glass, ...patch };
    const { h, c } = WINDOW_COLORS[glass.color];
    // Hue and chroma are stored too, so theme-init.js can apply them without the palette.
    write(GLASS_KEY, JSON.stringify({ ...glass, h, c }));
    applyGlass(glass);
    set({ glass });
  },
}));
