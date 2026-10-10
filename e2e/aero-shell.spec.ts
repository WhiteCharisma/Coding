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
} from './fixtures';

/** The chat's Aero look on computers: the smoky-glass rail, glass pane headers, glass settings. */
test.describe('Aero shell', () => {
  test('the rail takes you home, to your messages and to your communities', async ({ page, context }) => {
    await signUp(context);
    const community = await createCommunity(context, unique('Glass Studio '));
    await page.goto('/home');
    const rail = page.getByTestId('rail');
    const home = rail.getByRole('link', { name: 'Home' });
    await expect(home).toHaveAttribute('aria-current', 'page');

    const button = rail.getByRole('link', { name: community.name });
    await button.click();
    await expect(page).toHaveURL(new RegExp(`/c/${community.id}`));
    await expect(button).toHaveAttribute('aria-current', 'page');
    await expect(home).not.toHaveAttribute('aria-current', /./);

    await rail.getByRole('link', { name: 'Direct messages' }).click();
    await expect(page).toHaveURL(/\/dm$/);
    await home.click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test('a conversation pane has its header on the glass and its messages below it', async ({ page, context }) => {
    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    await page.goto(`/c/${community.id}/${channel.id}`);
    const pane = page.locator('main.glass-pane');
    const header = pane.locator('header.pane-head');
    await expect(header.getByRole('heading', { name: channel.name })).toBeVisible();
    await expect(page.getByTestId('composer-input')).toBeVisible();
    // Measure once the panes have risen into place (they slide up when the app opens).
    await expect(page.locator('[data-entering]')).toHaveCount(0);

    // The header fills the glass strip along the top of the pane, which is real glass.
    const [paneBox, headerBox, glassBox] = await Promise.all([
      pane.boundingBox(),
      header.boundingBox(),
      pane.locator('.pane-frame-top').boundingBox(),
    ]);
    if (!paneBox || !headerBox || !glassBox) throw new Error('pane not laid out');
    expect(Math.abs(headerBox.y - paneBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(headerBox.height - glassBox.height)).toBeLessThanOrEqual(1);
    const blur = await pane.locator('.pane-frame-top').evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(blur).toContain('blur');
    // The message box sits on glass at the foot; the messages scroll on an opaque surface
    // between the two, with no glass behind them (it would be redrawn on every scroll).
    const foot = pane.locator('.pane-foot-glass');
    expect(await foot.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur');
    const [scroller, footBox, composer] = await Promise.all([
      page.getByTestId('message-list').boundingBox(),
      foot.boundingBox(),
      page.getByTestId('composer-input').boundingBox(),
    ]);
    if (!scroller || !footBox || !composer) throw new Error('conversation not laid out');
    expect(scroller.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
    expect(scroller.y + scroller.height).toBeLessThanOrEqual(footBox.y + 1);
    expect(composer.y).toBeGreaterThan(footBox.y);
    expect(composer.y + composer.height).toBeLessThan(footBox.y + footBox.height);

    // Members: a pane of its own beside the conversation (open by default on wide screens).
    const members = page.getByRole('complementary', { name: 'Members' });
    const toggle = header.getByRole('button', { name: 'Show members' });
    await expect(members).toBeVisible();
    await expect(members).toHaveClass(/glass-pane/);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(members).toBeHidden();
    await toggle.click();
    await expect(members).toBeVisible();
  });

  test('window colour and transparency apply at once and are remembered', async ({ page, context }) => {
    await signUp(context);
    await page.goto('/settings/appearance');
    const root = page.locator('html');
    const glass = page.locator('main.glass-pane .pane-frame-top');

    // Click the swatch, as people do (the radio button itself is only for assistive technology).
    await page.getByTitle('Leaf', { exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Leaf' })).toBeChecked();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--frame-h')))
      .toBe('150');
    expect(await glass.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur');
    await page.getByRole('switch', { name: 'Enable transparency' }).click();
    await expect(root).toHaveAttribute('data-transparency', 'off');
    // Solid frames really have no blur.
    expect(await glass.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe('none');

    await page.reload();
    await expect(root).toHaveAttribute('data-transparency', 'off');
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--frame-h'))).toBe('150');
    await expect(page.getByRole('radio', { name: 'Leaf' })).toBeChecked();
  });

  test('a mention makes the community button flash and its preview say so', async ({
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
    const button = page.getByTestId('rail').getByRole('link', { name: community.name });
    await expect(button).toBeVisible();
    await expect(button.locator('.dock-attention')).toHaveCount(0);

    await b.page.goto(`/c/${community.id}/${channel.id}`);
    await sendMessage(b.page, `@${alice.username} the stems are ready`);

    await expect(button.locator('.dock-attention')).toHaveCount(1);
    await button.hover();
    await expect(page.getByText('1 mention for you')).toBeVisible();

    // Going there answers the call: the flash stops.
    await button.click();
    await expect(page).toHaveURL(new RegExp(`/c/${community.id}`));
    await expect(button.locator('.dock-attention')).toHaveCount(0);
    await b.context.close();
  });
});
