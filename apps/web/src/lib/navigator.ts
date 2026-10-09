/**
 * Lets non-React modules (e.g. real-time event handlers) navigate. The router's navigate
 * function is registered by SessionBoot. Kept separate from lib/realtime so public pages
 * do not load the socket client.
 */
let navigateFn: ((to: string) => void) | null = null;

export function setNavigator(fn: (to: string) => void): void {
  navigateFn = fn;
}

export function navigateTo(to: string): void {
  navigateFn?.(to);
}
