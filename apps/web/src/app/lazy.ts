import { createElement, lazy, type ComponentType } from 'react';

type Page = ComponentType;

/**
 * React.lazy() suspends on first render even when the chunk is already loaded, and React
 * throttles revealing suspended content (~300 ms) — noticeable when routes are nested.
 * This wrapper renders the page directly once its module has been preloaded.
 */
export function lazyWithPreload(factory: () => Promise<{ default: Page }>) {
  let loaded: Page | null = null;
  let pending: Promise<{ default: Page }> | null = null;
  const preload = () =>
    (pending ??= factory().then(
      (m) => {
        loaded = m.default;
        return m;
      },
      (err: unknown) => {
        pending = null; // allow a retry (e.g. after being offline)
        throw err;
      },
    ));
  const Lazy = lazy(preload);
  function Preloadable() {
    return createElement(loaded ?? Lazy);
  }
  return Object.assign(Preloadable, { preload, isLoaded: () => loaded !== null });
}
