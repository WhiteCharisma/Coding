import { BASE_URL, createCommunity, createInvite, expect, joinWithInvite, messageRow, secondUser, sendMessage, signUp, test } from './fixtures';

// Negative tests: what must NOT be possible, checked through the real browser and HTTP stack.
test.describe('security boundaries', () => {
  test.use({ allowHttpErrors: true });

  test('outsiders cannot read a private community, its channels or its files', async ({ page, context, browser, consoleErrors }) => {
    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    await page.goto(`/c/${community.id}/${channel.id}`);
    await sendMessage(page, 'internal release schedule');

    const o = await secondUser(browser, consoleErrors, true);
    await signUp(o.context);
    // UI: no content, a neutral "not found" state.
    await o.page.goto(`/c/${community.id}/${channel.id}`);
    await expect(o.page.getByText('internal release schedule')).toHaveCount(0);
    // API: 404 (existence is not revealed), for reads and writes.
    for (const path of [`/api/communities/${community.id}`, `/api/channels/${channel.id}/messages`, `/api/communities/${community.id}/members`]) {
      expect((await o.context.request.get(path)).status(), path).toBe(404);
    }
    const write = await o.context.request.post(`/api/channels/${channel.id}/messages`, {
      data: { content: 'injected', nonce: 'n-0000000001' },
      headers: { 'X-Requested-With': 'CreatorNetwork' },
    });
    expect(write.status()).toBe(404);
    await o.context.close();
  });

  test('state-changing requests without the CSRF header or from another origin are rejected', async ({ context }) => {
    const user = await signUp(context);
    const noHeader = await context.request.patch('/api/me/profile', { data: { headline: 'pwned' } });
    expect(noHeader.status()).toBe(403);
    const evil = await context.request.patch('/api/me/profile', { data: { headline: 'pwned' }, headers: { 'X-Requested-With': 'CreatorNetwork', Origin: 'https://evil.example' } });
    expect(evil.status()).toBe(403);
    const state = await (await context.request.get('/api/auth/state')).json();
    expect(state.user.headline).not.toBe('pwned');
    expect(user.username).toBeTruthy();
  });

  test('message content is rendered as text, never as HTML or script', async ({ page, context, browser, consoleErrors }) => {
    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    const code = await createInvite(context, community.id);
    const b = await secondUser(browser, consoleErrors, true);
    await signUp(b.context);
    await joinWithInvite(b.context, code);
    await b.page.goto(`/c/${community.id}/${channel.id}`);

    await page.goto(`/c/${community.id}/${channel.id}`);
    const payloads = ['<img src=x onerror="window.__xss=1">', '<script>window.__xss=1</script>', '[click me](javascript:window.__xss=1)', 'javascript:window.__xss=1'];
    for (const p of payloads) await sendMessage(page, p);

    const row = messageRow(b.page, '<script>window.__xss=1</script>');
    await expect(row).toBeVisible();
    await expect(messageRow(b.page, '<img src=x onerror')).toBeVisible();
    const list = b.page.getByTestId('message-list');
    expect(await list.locator('[data-message-id] img[src="x"]').count()).toBe(0);
    expect(await list.locator('[data-message-id] script').count()).toBe(0);
    expect(await list.locator('a[href^="javascript:"]').count()).toBe(0);
    expect(await b.page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await b.context.close();
  });

  test('the session cookie is HttpOnly and SameSite, and never readable by scripts', async ({ page, context }) => {
    await signUp(context);
    await page.goto('/home');
    const cookies = await context.cookies(BASE_URL);
    const session = cookies.find((c) => c.name.endsWith('cn_session'));
    expect(session).toBeDefined();
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Lax');
    expect(await page.evaluate(() => document.cookie)).not.toContain('cn_session');
  });

  test('uploads are checked by content: a disguised executable is refused', async ({ page, context }) => {
    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    await page.goto(`/c/${community.id}/${channel.id}`);
    // "MZ" header = Windows executable, named like an image.
    const exe = Buffer.concat([Buffer.from('4d5a90000300000004000000ffff0000', 'hex'), Buffer.alloc(512, 1)]);
    await page.locator('input[type="file"]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: exe });
    await expect(page.getByText(/not allowed|not supported|could not be verified/i)).toBeVisible();
  });

  test('security headers are present on pages and API responses', async ({ request }) => {
    const pageRes = await request.get('/welcome', { headers: { accept: 'text/html' } });
    const headers = pageRes.headers();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBeDefined();
    expect(headers['x-frame-options'] ?? headers['content-security-policy']).toMatch(/SAMEORIGIN|DENY|frame-ancestors/i);
    const apiRes = await request.get('/api/health');
    expect(apiRes.headers()['x-content-type-options']).toBe('nosniff');
  });
});
