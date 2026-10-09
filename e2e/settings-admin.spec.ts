import { api, createCommunity, createInvite, E2E_ADMIN, expect, joinWithInvite, messageRow, secondUser, sendMessage, signInAdmin, signUp, test, unique } from './fixtures';

test.describe('settings', () => {
  test('profile edits show on the public profile', async ({ page, context }) => {
    const me = await signUp(context);
    await page.goto('/settings/profile');
    await page.getByLabel('Headline').fill('Mixing engineer for indie games');
    await page.getByLabel('Location').fill('Lisbon');
    await page.getByRole('button', { name: 'Add link' }).click();
    await page.getByLabel('Label').fill('Bandcamp');
    await page.getByLabel('URL').fill('https://example.com/bandcamp');
    await page.getByTestId('save-profile').click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    await page.goto(`/u/${me.username}`);
    await expect(page.getByText('Mixing engineer for indie games')).toBeVisible();
    await expect(page.getByText('Lisbon')).toBeVisible();
    const link = page.getByRole('link', { name: /Bandcamp/ });
    await expect(link).toHaveAttribute('href', 'https://example.com/bandcamp');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  test('theme, density and motion preferences apply immediately and persist', async ({ page, context }) => {
    await signUp(context);
    await page.goto('/settings/appearance');
    await page.getByRole('radio', { name: 'Light' }).click();
    await page.getByRole('radio', { name: 'Compact' }).click();
    await page.getByRole('radio', { name: 'Reduce motion' }).click();
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(html).toHaveAttribute('data-density', 'compact');
    await expect(html).toHaveAttribute('data-motion', 'reduced');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(html).toHaveAttribute('data-motion', 'reduced');
  });

  test('signing out other devices revokes their sessions', async ({ page, context, browser, consoleErrors }) => {
    const me = await signUp(context);
    const other = await secondUser(browser, consoleErrors, true);
    await api(other.context).post('/api/auth/login', { login: me.username, password: me.password });
    await page.goto('/settings/sessions');
    await expect(page.getByTestId('session-list').locator('li')).toHaveCount(2);
    await page.getByRole('button', { name: 'Sign out of all other devices' }).click();
    await expect(page.getByTestId('session-list').locator('li')).toHaveCount(1);
    const state = await other.context.request.get('/api/auth/state');
    expect((await state.json()).user).toBeNull();
    await other.context.close();
  });
});

test.describe('administration and moderation', () => {
  test.use({ allowHttpErrors: true });

  test('members cannot open the admin area or call admin APIs', async ({ page, context }) => {
    await signUp(context);
    await page.goto('/admin');
    await expect(page.getByText('This area is only available to platform staff.')).toBeVisible();
    for (const path of ['/api/admin/overview', '/api/admin/users', '/api/admin/settings', '/api/admin/backups']) {
      const res = await context.request.get(path);
      expect(res.status(), path).toBe(403);
    }
  });

  test('a reported message is reviewed by an admin, who warns the author', async ({ page, context, browser, consoleErrors }) => {
    // Author and reporter share a community.
    const author = await signUp(context, { displayName: 'Loud Author' });
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    const code = await createInvite(context, community.id);
    await page.goto(`/c/${community.id}/${channel.id}`);
    const offending = unique('spammy offer ');
    await sendMessage(page, `${offending} — buy followers now`);

    const r = await secondUser(browser, consoleErrors, true);
    await signUp(r.context, { displayName: 'Careful Reporter' });
    await joinWithInvite(r.context, code);
    await r.page.goto(`/c/${community.id}/${channel.id}`);
    const row = messageRow(r.page, offending);
    await row.hover();
    await row.getByRole('button', { name: 'Message actions' }).click();
    await r.page.getByRole('menuitem', { name: 'Report message' }).click();
    const dialog = r.page.getByRole('dialog');
    await dialog.getByRole('radio', { name: 'Spam or scam' }).click();
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(r.page.getByText('Report sent. The moderators will review it.')).toBeVisible();

    // Admin reviews it.
    const a = await secondUser(browser, consoleErrors, true);
    await signInAdmin(a.context);
    await a.page.goto('/admin/reports');
    const card = a.page.getByTestId('report-card').filter({ hasText: offending });
    await expect(card).toContainText('Careful Reporter');
    await card.getByLabel('Action').selectOption('warn_user');
    await card.getByLabel('Resolution note').fill('Please keep promotions out of community channels.');
    await card.getByRole('button', { name: 'Resolve' }).click();
    await expect(a.page.getByText('Report closed.')).toBeVisible();

    // The author is notified; the action is in the audit log.
    await page.goto('/notifications');
    await expect(page.getByText(/warning/i).first()).toBeVisible();
    await a.page.goto('/admin/audit');
    await expect(a.page.getByTestId('admin-audit')).toContainText(`warned ${author.username}`);
    await r.context.close();
    await a.context.close();
  });

  test('switching to invite-only registration requires a code, and admin codes work', async ({ page, browser, consoleErrors }) => {
    const a = await secondUser(browser, consoleErrors, true);
    await signInAdmin(a.context);
    try {
      await a.page.goto('/admin/settings');
      await a.page.getByRole('radio', { name: /Invite-only/ }).check();
      await a.page.getByRole('button', { name: 'Save changes' }).click();
      await expect(a.page.getByText('Settings saved.')).toBeVisible();

      await a.page.goto('/admin/invites');
      await a.page.getByLabel('Note').fill('for e2e');
      await a.page.getByRole('button', { name: 'Create code' }).click();
      await expect(a.page.getByText('Code created.')).toBeVisible();
      const code = (await a.page.locator('ul li p.font-mono').first().innerText()).trim();

      await page.goto('/register');
      await expect(page.getByLabel('Invitation code')).toBeVisible();
      const username = unique('gated');
      await page.getByLabel('Display name').fill('Gated Person');
      await page.getByLabel('Username').fill(username);
      await page.getByLabel('Email').fill(`${username}@example.test`);
      await page.getByLabel('Password', { exact: true }).fill('e2e-member-passphrase-29');
      await page.getByLabel('Invitation code').fill('WRONGCODE123');
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page.getByText('An invitation is required to join this server.')).toBeVisible();
      await page.getByLabel('Invitation code').fill(code);
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page).toHaveURL(/\/onboarding/);
    } finally {
      await api(a.context).patch('/api/admin/settings', { registrationMode: 'open' });
      await a.context.close();
    }
  });

  test('admins can create a backup from the dashboard', async ({ browser, consoleErrors }) => {
    const a = await secondUser(browser, consoleErrors, true);
    await signInAdmin(a.context);
    await a.page.goto('/admin/backups');
    await a.page.getByTestId('create-backup').click();
    await expect(a.page.getByText(/Backup created: creator-network-.*\.tar\.gz/)).toBeVisible({ timeout: 30_000 });
    await a.page.goto('/admin');
    await expect(a.page.getByTestId('admin-overview')).toContainText('All systems operational');
    expect(E2E_ADMIN.username).toBe('e2e.admin');
    await a.context.close();
  });
});
