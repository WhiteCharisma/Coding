import { useEffect, useState } from 'react';

/** True once `value` has been truthy for `delayMs` (avoids flashing transient states). */
export function useDelayedFlag(value: boolean, delayMs: number): boolean {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    if (!value) return;
    const timer = window.setTimeout(() => setFlag(true), delayMs);
    return () => {
      window.clearTimeout(timer);
      setFlag(false);
    };
  }, [value, delayMs]);
  return value && flag;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const listener = () => setMatches(mq.matches);
    mq.addEventListener('change', listener);
    listener();
    return () => mq.removeEventListener('change', listener);
  }, [query]);
  return matches;
}

export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');
export const useIsWide = () => useMediaQuery('(min-width: 1280px)');
