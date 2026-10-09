import { create } from 'zustand';

/**
 * The main window on the desktop: maximised (remembered on this device) or minimised to the
 * taskbar (for this visit only — the next navigation brings it back).
 */
interface DesktopState {
  maximized: boolean;
  minimized: boolean;
  /** Modal dialogs and sheets open right now (the wallpaper rests behind them). */
  modals: number;
  setMaximized: (maximized: boolean) => void;
  toggleMaximized: () => void;
  setMinimized: (minimized: boolean) => void;
  modalOpened: () => void;
  modalClosed: () => void;
}

const KEY = 'cn.window';

function readMaximized(): boolean {
  try {
    return localStorage.getItem(KEY) === 'maximized';
  } catch {
    return false;
  }
}

export const useDesktop = create<DesktopState>((set, get) => ({
  maximized: readMaximized(),
  minimized: false,
  modals: 0,
  setMaximized: (maximized) => {
    try {
      localStorage.setItem(KEY, maximized ? 'maximized' : 'normal');
    } catch {
      /* per-device convenience only */
    }
    set({ maximized, minimized: false });
  },
  toggleMaximized: () => get().setMaximized(!get().maximized),
  setMinimized: (minimized) => set({ minimized }),
  modalOpened: () => set({ modals: get().modals + 1 }),
  modalClosed: () => set({ modals: Math.max(0, get().modals - 1) }),
}));
