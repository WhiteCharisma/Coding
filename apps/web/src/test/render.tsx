import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Tells React that updates in tests are wrapped in act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Minimal DOM renderer for component tests (no extra testing library needed). */
export function mount(node: ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  let root: Root | null = createRoot(host);
  act(() => root?.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(() => root?.render(next)),
    unmount: () => {
      act(() => root?.unmount());
      root = null;
      host.remove();
    },
  };
}
