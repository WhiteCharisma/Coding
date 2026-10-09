/**
 * The signed-in app is split from the public pages. To avoid a request waterfall
 * (entry → guard → shell → page), its chunks are fetched in parallel as soon as a session
 * is likely: a non-sensitive "has signed in on this device" hint in localStorage lets this
 * start before the session check returns. The hint is only a performance hint — access is
 * always decided by the server.
 */
import { corePages, secondaryPages } from './pages';

const HINT_KEY = 'cn.signedIn';
let secondaryScheduled = false;

export function preloadSignedInApp(): void {
  for (const page of corePages) void page.preload().catch(() => undefined);
  if (secondaryScheduled) return;
  secondaryScheduled = true;
  // Other pages load quietly once the browser is idle, so later navigation is instant.
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
  idle(() => {
    for (const page of secondaryPages) void page.preload().catch(() => undefined);
  });
}

export function setSignedInHint(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(HINT_KEY, '1');
    else localStorage.removeItem(HINT_KEY);
  } catch {
    /* storage unavailable: no hint */
  }
}

export function hasSignedInHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}
