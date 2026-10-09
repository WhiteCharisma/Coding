import { expect, PASSWORD, signInUi, signUp, test, unique } from './fixtures';

test.describe('registration and onboarding', () => {
  test('a visitor signs up, completes onboarding and lands on home', async ({ page }) => {
    const username = unique('new');
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome$/);
    await page.getByTestId('cta-register').click();

    await page.getByLabel('Display name').fill('Nova Reyes');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Email').fill(`${username}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel('Headline').fill('Producer & synth nerd');
    await page.getByTestId('onboarding-next').click();
    await page.getByRole('button', { name: 'Music production' }).click();
    await page.getByRole('button', { name: 'Sound design' }).click();
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByRole('heading', { name: 'Find your people' })).toBeVisible();
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByRole('heading', { name: 'You are all set' })).toBeVisible();
    await page.getByTestId('onboarding-next').click();

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Nova');

    // The onboarding answers were saved to the profile.
    await page.goto(`/u/${username}`);
    await expect(page.getByText('Producer & synth nerd')).toBeVisible();
    await expect(page.getByText('Music production')).toBeVisible();
  });

});

test.describe('registration errors', () => {
  test.use({ allowHttpErrors: true });

  test('a taken username is explained inline', async ({ page, context }) => {
    const taken = await signUp(context);
    await context.clearCookies();
    await page.goto('/register');
    await page.getByLabel('Display name').fill('Someone');
    await page.getByLabel('Username').fill(taken.username);
    await page.getByLabel('Email').fill(`${unique('x')}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('That username is already taken.')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });
});

test.describe('signing in', () => {
  test.use({ allowHttpErrors: true });

  test('a wrong password is rejected; the right one returns to the requested page', async ({ page, context }) => {
    const user = await signUp(context);
    await context.clearCookies();

    await page.goto('/settings/account');
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByLabel('Username or email').fill(user.username);
    await page.getByLabel('Password', { exact: true }).fill('definitely-not-it-123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/settings\/account$/);
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test('signing out ends the session for this browser', async ({ page, context }) => {
    const user = await signUp(context);
    await page.goto('/home');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/welcome$/);
    const state = await context.request.get('/api/auth/state');
    expect((await state.json()).user).toBeNull();

    await signInUi(page, user.email, user.password);
    await expect(page).toHaveURL(/\/home$/);
  });
});
