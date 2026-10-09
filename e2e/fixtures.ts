import { test as base, expect, type APIResponse, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { CommunityDTO } from '@creator-network/shared';
import { E2E_ADMIN, e2ePort } from './env.mjs';

export { expect, E2E_ADMIN };

export const BASE_URL = `http://127.0.0.1:${e2ePort()}`;
export const PASSWORD = 'e2e-member-passphrase-29';

export interface E2EUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  password: string;
}

let counter = 0;
/** Short unique identifier (usernames must be 3-32 chars: lowercase letters, digits, . _ -). */
export function unique(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36).slice(-6)}${counter}`;
}

/** Headers a browser on the app origin would send (the API requires the CSRF header). */
export const browserHeaders = { 'X-Requested-With': 'CreatorNetwork', Origin: BASE_URL };

async function ok<T>(res: APIResponse, status?: number): Promise<T> {
  const body = await res.text();
  if (status !== undefined) expect(res.status(), body).toBe(status);
  else expect(res.ok(), `${res.status()} ${body}`).toBeTruthy();
  return (body ? JSON.parse(body) : undefined) as T;
}

/** Thin API client bound to a browser context: shares its session cookie with the context's pages. */
export function api(context: BrowserContext) {
  return {
    get: <T>(path: string) => context.request.get(path, { headers: browserHeaders }).then((r) => ok<T>(r)),
    post: <T>(path: string, data: unknown = {}, status?: number) =>
      context.request.post(path, { data, headers: browserHeaders }).then((r) => ok<T>(r, status)),
    patch: <T>(path: string, data: unknown = {}) =>
      context.request.patch(path, { data, headers: browserHeaders }).then((r) => ok<T>(r)),
    put: <T>(path: string, data: unknown = {}) =>
      context.request.put(path, { data, headers: browserHeaders }).then((r) => ok<T>(r)),
  };
}

/** Registers a new account through the API; the session cookie lands in `context`. */
export async function signUp(
  context: BrowserContext,
  opts: { displayName?: string; onboard?: boolean } = {},
): Promise<E2EUser> {
  const username = unique('u');
  const displayName = opts.displayName ?? `Tester ${username}`;
  const email = `${username}@example.test`;
  const { user } = await api(context).post<{ user: { id: string } }>(
    '/api/auth/register',
    { username, email, password: PASSWORD, displayName },
    201,
  );
  if (opts.onboard !== false) await api(context).post('/api/me/onboarding/complete');
  return { id: user.id, username, displayName, email, password: PASSWORD };
}

/** Signs the E2E administrator in through the API (and skips onboarding). */
export async function signInAdmin(context: BrowserContext): Promise<void> {
  await api(context).post('/api/auth/login', { login: E2E_ADMIN.username, password: E2E_ADMIN.password });
  await api(context).post('/api/me/onboarding/complete');
}

export async function createCommunity(
  context: BrowserContext,
  name = unique('Studio '),
  visibility: 'public' | 'private' = 'private',
): Promise<CommunityDTO> {
  const { community } = await api(context).post<{ community: CommunityDTO }>(
    '/api/communities',
    { name, template: 'blank', visibility },
    201,
  );
  return community;
}

export async function createInvite(context: BrowserContext, communityId: string): Promise<string> {
  const { invite } = await api(context).post<{ invite: { code: string } }>(
    `/api/communities/${communityId}/invites`,
    { maxUses: null, expiresInHours: 24 },
    201,
  );
  return invite.code;
}

export async function joinWithInvite(context: BrowserContext, code: string): Promise<CommunityDTO> {
  const { community } = await api(context).post<{ community: CommunityDTO }>(`/api/invites/${code}/accept`);
  return community;
}

/** Records console errors and uncaught exceptions; the auto fixture asserts none happened. */
export function watchConsole(page: Page, sink: string[], allowHttpErrors = false): void {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (allowHttpErrors && /Failed to load resource: the server responded with a status of 4\d\d/.test(text)) return;
    sink.push(`${page.url()} → ${text}`);
  });
  page.on('pageerror', (e) => sink.push(`${page.url()} → uncaught: ${e.message}`));
}

/** Opens a second, independent browser session (another person). */
export async function secondUser(
  browser: Browser,
  sink: string[],
  allowHttpErrors = false,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  watchConsole(page, sink, allowHttpErrors);
  return { context, page };
}

export async function signInUi(page: Page, login: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(login);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Sends with Enter (desktop) or the send button (touch screens, where Enter inserts a new line). */
export async function sendMessage(page: Page, text: string, via: 'enter' | 'button' = 'enter'): Promise<void> {
  const input = page.getByTestId('composer-input');
  await input.fill(text);
  if (via === 'enter') await input.press('Enter');
  else await page.getByTestId('composer-send').click();
}

/**
 * Waits until the app window has finished its opening animation (it zooms in on every page
 * load on desktops): measure geometry only after that, since a transform scales every box.
 */
export async function windowSettled(page: Page): Promise<void> {
  await expect(page.getByTestId('app-window')).not.toHaveAttribute('data-anim', /./);
}

/** The newest message whose own text (not a quoted reply preview) contains `text`. */
export function messageRow(page: Page, text: string | RegExp) {
  return page
    .locator('[data-message-id]')
    .filter({ has: page.getByTestId('message-content').filter({ hasText: text }) })
    .last();
}

export const test = base.extend<{ allowHttpErrors: boolean; consoleErrors: string[] }>({
  allowHttpErrors: [false, { option: true }],
  consoleErrors: [
    async ({ page, allowHttpErrors }, use) => {
      const errors: string[] = [];
      watchConsole(page, errors, allowHttpErrors);
      await use(errors);
      expect(errors, 'browser console errors').toEqual([]);
    },
    { auto: true },
  ],
});
