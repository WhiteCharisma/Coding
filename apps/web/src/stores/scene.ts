import { create } from 'zustand';

/**
 * The animated scene behind the app (features/shell/Wallpaper.tsx). It rests while a modal
 * dialog or sheet is open, so their blurred backdrop is not redrawn for every frame of it.
 */
interface SceneState {
  /** Modal dialogs and sheets open right now. */
  modals: number;
  modalOpened: () => void;
  modalClosed: () => void;
}

export const useScene = create<SceneState>((set, get) => ({
  modals: 0,
  modalOpened: () => set({ modals: get().modals + 1 }),
  modalClosed: () => set({ modals: Math.max(0, get().modals - 1) }),
}));
