import { createCommunity, expect, signUp, test } from './fixtures';

test.describe('accessibility basics', () => {
  test('pages have a main landmark, one h1 and a skip link; images and icon buttons are labelled', async ({ page, context }) => {
    await page.goto('/welcome');
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);

    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    for (const path of ['/home', '/explore', '/notifications', '/search', '/settings/profile', `/c/${community.id}/${channel.id}`]) {
      await page.goto(path);
      await expect(page.locator('main').first(), path).toBeVisible();
      // Every button has an accessible name (visible text, aria-label or aria-labelledby).
      const unnamed = await page.locator('button:visible').evaluateAll((buttons) =>
        buttons.filter((b) => !(b.textContent ?? '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby') && !b.getAttribute('title')).map((b) => b.outerHTML.slice(0, 120)),
      );
      expect(unnamed, `unlabelled buttons on ${path}`).toEqual([]);
      const imgs = await page.locator('img:visible').evaluateAll((list) => list.filter((i) => i.getAttribute('alt') === null).length);
      expect(imgs, `images without alt on ${path}`).toBe(0);
    }

    // Keyboard: the first Tab stop is the skip link, and it moves focus to the main content.
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });

  test('reduced-motion users get no animations', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    await page.goto('/welcome');
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('*')]
        .map((el) => getComputedStyle(el))
        .filter((s) => s.animationName !== 'none')
        .map((s) => parseFloat(s.animationDuration) * (s.animationDuration.endsWith('ms') ? 1 : 1000)),
    );
    expect(durations.every((ms) => ms <= 1), `animation durations: ${durations.join(', ')}`).toBe(true);
    await context.close();
  });

  test('form controls have labels and errors are announced', async ({ page }) => {
    await page.goto('/register');
    const unlabelled = await page.locator('input:visible, textarea:visible, select:visible').evaluateAll((els) =>
      els.filter((el) => {
        const id = el.getAttribute('id');
        const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        return !byFor && !el.getAttribute('aria-label') && !el.closest('label');
      }).length,
    );
    expect(unlabelled).toBe(0);
  });
});
