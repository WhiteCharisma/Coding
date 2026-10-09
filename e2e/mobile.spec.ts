import { createCommunity, expect, messageRow, sendMessage, signInUi, signUp, test } from './fixtures';

// Runs in the "mobile" project (Pixel 7 viewport, touch).
test.describe('phone layout', () => {
  test('bottom navigation, community → channel → message and back', async ({ page, context }) => {
    const me = await signUp(context, { displayName: 'Phone Person' });
    const community = await createCommunity(context);
    await context.clearCookies();

    await signInUi(page, me.username, me.password);
    await expect(page).toHaveURL(/\/home$/);
    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(nav).toBeVisible();
    await nav.getByRole('link', { name: 'Communities' }).click();
    await page.getByRole('link', { name: new RegExp(community.name) }).click();
    await page.getByRole('link', { name: /general/ }).click();

    // Conversation view: composer visible, bottom nav hidden to give the keyboard room.
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await sendMessage(page, 'sent from a phone', 'button');
    await expect(messageRow(page, 'sent from a phone')).toBeVisible();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('link', { name: /general/ })).toBeVisible();

    // No horizontal overflow on the main screens.
    for (const path of ['/home', '/communities', '/settings', '/notifications']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('long-press opens message actions on touch screens', async ({ page, context }) => {
    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    await page.goto(`/c/${community.id}/${channel.id}`);
    await sendMessage(page, 'hold me', 'button');
    const row = messageRow(page, 'hold me');
    await expect(row).toBeVisible();
    await row.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
    await page.waitForTimeout(650);
    await row.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true });
    await expect(page.getByRole('dialog', { name: 'Message actions' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: /Edit/ })).toBeVisible();
  });
});
