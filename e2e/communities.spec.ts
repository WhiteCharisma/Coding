import { expect, PASSWORD, secondUser, sendMessage, signUp, test, unique } from './fixtures';

test.describe('communities and invitations', () => {
  test('create a community in the UI, invite someone new, and they join through the link', async ({ page, context, browser, consoleErrors }) => {
    await signUp(context, { displayName: 'Mara Okafor' });
    const name = unique('Night Shift ');
    await page.goto('/home');

    // Create from the rail "+" button.
    await page.getByTestId('rail-add-community').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Community name').fill(name);
    await dialog.getByLabel('What is it about?').fill('Late-night production sessions.');
    await dialog.getByRole('button', { name: 'Create community' }).click();
    await expect(page.getByTestId('community-menu')).toContainText(name);

    // Channel created from the template; the creator can post.
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await sendMessage(page, 'Welcome to the night shift');

    // Invite link.
    await page.getByTestId('community-menu').click();
    await page.getByRole('menuitem', { name: 'Invite people' }).click();
    await page.getByTestId('create-invite').click();
    const link = await page.getByTestId('invite-link').inputValue();
    expect(link).toMatch(/\/invite\/[A-Za-z0-9]+$/);
    await page.keyboard.press('Escape');

    // A visitor without an account opens the link, signs up and accepts in onboarding.
    const v = await secondUser(browser, consoleErrors);
    await v.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(v.page.getByTestId('invite-preview')).toContainText(name);
    await v.page.getByRole('link', { name: 'Create an account to join' }).click();
    const username = unique('inv');
    await v.page.getByLabel('Display name').fill('Invited Person');
    await v.page.getByLabel('Username').fill(username);
    await v.page.getByLabel('Email').fill(`${username}@example.test`);
    await v.page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await expect(v.page.getByLabel('Invitation code')).not.toHaveValue('');
    await v.page.getByRole('button', { name: 'Create account' }).click();
    await expect(v.page).toHaveURL(/\/onboarding\?invite=/);
    await v.page.getByTestId('onboarding-next').click();
    await v.page.getByTestId('onboarding-next').click();
    await v.page.getByTestId('onboarding-invite').getByRole('button', { name: 'Accept invitation' }).click();
    await expect(v.page.getByTestId('onboarding-invite')).toContainText('Joined');
    await v.page.getByTestId('onboarding-next').click();
    await v.page.getByTestId('onboarding-next').click();
    await expect(v.page.getByTestId('community-menu')).toContainText(name);
    await expect(v.page.getByTestId('message-list')).toContainText('Welcome to the night shift');
    await v.context.close();
  });

  test('a public community can be found in Explore and joined', async ({ page, context, browser, consoleErrors }) => {
    const name = unique('Open Booth ');
    await signUp(context);
    await page.goto('/home');
    await page.getByTestId('rail-add-community').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Community name').fill(name);
    await dialog.getByRole('radio', { name: 'Public' }).click();
    await dialog.getByRole('button', { name: 'Create community' }).click();
    await expect(page.getByTestId('community-menu')).toContainText(name);

    const other = await secondUser(browser, consoleErrors);
    await signUp(other.context);
    await other.page.goto('/explore');
    await other.page.getByPlaceholder('Search communities').fill(name);
    const card = other.page.locator('article').filter({ hasText: name });
    await card.getByRole('button', { name: 'Join' }).click();
    await expect(other.page.getByTestId('community-menu')).toContainText(name);
    await other.context.close();
  });

  test('owners create private channels that ordinary members cannot see', async ({ page, context, browser, consoleErrors }) => {
    await signUp(context);
    await page.goto('/home');
    await page.getByTestId('rail-add-community').click();
    const name = unique('Label HQ ');
    await page.getByRole('dialog').getByLabel('Community name').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Create community' }).click();
    await expect(page.getByTestId('community-menu')).toContainText(name);

    await page.getByTestId('community-menu').click();
    await page.getByRole('menuitem', { name: 'Create channel' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Channel name').fill('a-and-r-only');
    await dialog.getByRole('switch', { name: /Private channel/ }).click();
    await dialog.getByRole('button', { name: 'Create channel' }).click();
    await expect(page.getByRole('navigation', { name }).getByRole('link', { name: /a-and-r-only/ })).toBeVisible();

    await page.getByTestId('community-menu').click();
    await page.getByRole('menuitem', { name: 'Invite people' }).click();
    await page.getByTestId('create-invite').click();
    const link = await page.getByTestId('invite-link').inputValue();
    await page.keyboard.press('Escape');

    const m = await secondUser(browser, consoleErrors);
    await signUp(m.context);
    await m.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await m.page.getByTestId('accept-invite').click();
    await expect(m.page.getByTestId('community-menu')).toContainText(name);
    await expect(m.page.getByRole('navigation', { name }).getByRole('link', { name: /general/ })).toBeVisible();
    await expect(m.page.getByRole('navigation', { name }).getByRole('link', { name: /a-and-r-only/ })).toHaveCount(0);
    await m.context.close();
  });
});
