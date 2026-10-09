import { create } from 'zustand';

export type Theme = 'dark' | 'light' | 'system';
export type Density = 'comfortable' | 'compact';
export type MotionPref = 'full' | 'reduced';
export type ContextPanel = 'members' | 'pins' | null;

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
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  setMotion: (m: MotionPref) => void;
  toggleContextPanel: (p: Exclude<ContextPanel, null>) => void;
  setContextPanel: (p: ContextPanel) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setAtBottom: (v: boolean) => void;
}

export const useUi = create<UiState>((set, get) => ({
  theme: read<Theme>('cn.theme', 'light', ['dark', 'light', 'system']),
  density: read<Density>('cn.density', 'comfortable', ['comfortable', 'compact']),
  motion: read<MotionPref>('cn.motion', 'full', ['full', 'reduced']),
  contextPanel:
    read<'members' | 'pins' | 'none'>('cn.panel', 'members', ['members', 'pins', 'none']) === 'none'
      ? null
      : read<'members' | 'pins'>('cn.panel', 'members', ['members', 'pins']),
  mobileSidebarOpen: false,
  atBottom: true,
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
    if (motion === 'reduced') document.documentElement.setAttribute('data-motion', 'reduced');
    else document.documentElement.removeAttribute('data-motion');
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
}));
