import {
  createCommunity,
  createInvite,
  expect,
  joinWithInvite,
  secondUser,
  sendMessage,
  signUp,
  test,
  unique,
  windowSettled,
} from './fixtures';

/** The Vista desktop around the app on computers: window, taskbar, Start menu, glass settings. */
test.describe('Vista desktop', () => {
  test('the Start menu opens ready to search and takes you to your communities', async ({ page, context }) => {
    await signUp(context);
    const community = await createCommunity(context, unique('Glass Studio '));
    await page.goto('/home');

    await page.getByTestId('start-button').click();
    const menu = page.getByTestId('start-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByLabel('Start Search')).toBeFocused();
    await page.keyboard.type('bassline');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=bassline$/);
    await expect(menu).toBeHidden();

    await page.getByTestId('start-button').click();
    await menu.getByRole('link', { name: community.name }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${community.id}`));
  });

  test('caption buttons minimise, maximise (remembered) and close the window', async ({ page, context }) => {
    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    await page.goto(`/c/${community.id}/${channel.id}`);
    const win = page.getByTestId('app-window');
    const caption = win.getByTestId('window-caption');
    await windowSettled(page);

    await caption.getByRole('button', { name: 'Maximise' }).click();
    await expect(win).toHaveAttribute('data-maximized', 'true');
    await page.reload();
    await expect(win).toHaveAttribute('data-maximized', 'true');
    await caption.getByRole('button', { name: 'Restore down' }).click();
    await expect(win).not.toHaveAttribute('data-maximized', /./);

    // Minimised: hidden (and out of reach of the keyboard) until a taskbar button brings it back.
    await caption.getByRole('button', { name: 'Minimise' }).click();
    await expect(win).toBeHidden();
    await page.getByTestId('taskbar').getByRole('link', { name: community.name }).click();
    await expect(win).toBeVisible();
    await expect(page.getByTestId('composer-input')).toBeVisible();

    // Show desktop does the same from the notification area.
    await page.getByRole('button', { name: 'Show desktop' }).click();
    await expect(win).toBeHidden();
    await page.getByRole('button', { name: 'Show desktop' }).click();
    await expect(win).toBeVisible();

    // Close goes back Home, where there is nothing left to close.
    await caption.getByRole('button', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(caption.getByRole('button', { name: 'Close' })).toBeDisabled();
  });

  test('the address bar goes back and forward, lists the places below and searches where you are', async ({
    page,
    context,
  }) => {
    await signUp(context);
    const community = await createCommunity(context, unique('Address Bar '));
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    await page.goto('/home');
    const win = page.getByTestId('app-window');
    const address = win.getByTestId('address-bar');
    // Nothing to go back to inside the app yet (Back never leaves the app).
    await expect(address.getByRole('button', { name: 'Back' })).toBeDisabled();
    await page.getByTestId('taskbar').getByRole('link', { name: 'Explore communities' }).click();
    await expect(page).toHaveURL(/\/explore$/);

    await address.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(address.getByRole('button', { name: 'Forward' })).toBeEnabled();
    await address.getByRole('button', { name: 'Forward' }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(address.getByRole('button', { name: 'Forward' })).toBeDisabled();

    await page.goto(`/c/${community.id}/${channel.id}`);
    const crumbs = win.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs).toContainText(community.name);
    await expect(crumbs).toContainText(`#${channel.name}`);
    await crumbs.getByRole('button', { name: `Places in ${community.name}` }).click();
    await expect(page.getByRole('menuitem', { name: `#${channel.name}` })).toBeVisible();
    await page.keyboard.press('Escape');

    const search = address.getByRole('search').getByRole('textbox');
    await expect(search).toHaveAttribute('placeholder', `Search ${community.name}`);
    await search.fill('mixdown');
    await search.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/search\\?q=mixdown&communityId=${community.id}$`));
  });

  test('window colour and transparency apply at once and are remembered', async ({ page, context }) => {
    await signUp(context);
    await page.goto('/settings/appearance');
    await windowSettled(page);
    const root = page.locator('html');

    // Click the swatch, as people do (the radio button itself is only for assistive technology).
    await page.getByTitle('Leaf', { exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Leaf' })).toBeChecked();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--frame-h')))
      .toBe('150');
    await page.getByRole('switch', { name: 'Enable transparency' }).click();
    await expect(root).toHaveAttribute('data-transparency', 'off');
    // Solid frames really have no blur.
    const blur = await page
      .getByTestId('app-window')
      .locator('.aero-frame-top')
      .evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(blur).toBe('none');

    await page.reload();
    await expect(root).toHaveAttribute('data-transparency', 'off');
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--frame-h'))).toBe('150');
    await expect(page.getByRole('radio', { name: 'Leaf' })).toBeChecked();
  });

  test('a mention makes the community button flash and its thumbnail say so', async ({
    page,
    context,
    browser,
    consoleErrors,
  }) => {
    const alice = await signUp(context, { displayName: 'Alice Glass' });
    const community = await createCommunity(context, unique('Flash '));
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    const code = await createInvite(context, community.id);
    const b = await secondUser(browser, consoleErrors);
    await signUp(b.context, { displayName: 'Bob Glass' });
    await joinWithInvite(b.context, code);

    await page.goto('/home');
    const button = page.getByTestId('taskbar').getByRole('link', { name: community.name });
    await expect(button).toBeVisible();
    await expect(button.locator('.taskbar-attention')).toHaveCount(0);

    await b.page.goto(`/c/${community.id}/${channel.id}`);
    await sendMessage(b.page, `@${alice.username} the stems are ready`);

    await expect(button.locator('.taskbar-attention')).toHaveCount(1);
    await button.hover();
    await expect(page.getByText('1 mention for you')).toBeVisible();

    // Going there answers the call: the flash stops.
    await button.click();
    await expect(page).toHaveURL(new RegExp(`/c/${community.id}`));
    await expect(button.locator('.taskbar-attention')).toHaveCount(0);
    await b.context.close();
  });
});
