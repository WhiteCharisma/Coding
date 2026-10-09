import { api, createCommunity, createInvite, expect, joinWithInvite, messageRow, secondUser, sendMessage, signUp, test, unique } from './fixtures';

test.describe('direct messages', () => {
  test('start a conversation from a profile and get a live reply', async ({ page, context, browser, consoleErrors }) => {
    await signUp(context, { displayName: 'Priya Natarajan' });
    const b = await secondUser(browser, consoleErrors);
    const theo = await signUp(b.context, { displayName: 'Theo Lindqvist' });
    await b.page.goto('/home');

    await page.goto(`/u/${theo.username}`);
    await page.getByRole('button', { name: 'Message', exact: true }).click();
    await expect(page).toHaveURL(/\/dm\//);
    await sendMessage(page, 'Want to score the trailer together?');

    // Theo sees an unread badge on Messages and the conversation.
    await expect(b.page.getByTestId('rail-dms')).toContainText('1');
    await b.page.getByTestId('rail-dms').click();
    await b.page.getByRole('link', { name: /Priya Natarajan/ }).first().click();
    await expect(messageRow(b.page, 'Want to score the trailer together?')).toBeVisible();
    await sendMessage(b.page, 'Absolutely — sending stems tonight');
    await expect(messageRow(page, 'Absolutely — sending stems tonight')).toBeVisible();
    await b.context.close();
  });

  test('people who set DMs to "nobody" cannot be messaged', async ({ context, browser, consoleErrors }) => {
    const b = await secondUser(browser, consoleErrors, true);
    const closed = await signUp(b.context);
    await api(b.context).patch('/api/me/preferences', { dmPolicy: 'nobody' });
    await signUp(context);
    const res = await context.request.post('/api/dms', { data: { userIds: [closed.id] }, headers: { 'X-Requested-With': 'CreatorNetwork' } });
    expect(res.status()).toBe(403);
    await b.context.close();
  });
});

test.describe('search', () => {
  test('finds messages in your communities but never in ones you are not in', async ({ page, context, browser, consoleErrors }) => {
    const token = unique('zebrafinch');
    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    await page.goto(`/c/${community.id}/${channel.id}`);
    await sendMessage(page, `Mix notes for ${token}: less reverb on the snare`);
    await expect(messageRow(page, token)).toBeVisible();

    await page.goto(`/search?q=${token}`);
    await expect(page.getByTestId('search-results')).toContainText('less reverb on the snare');
    await page.getByTestId('search-results').getByRole('link').first().click();
    await expect(page).toHaveURL(new RegExp(`/c/${community.id}/${channel.id}`));

    // An outsider gets nothing for the same query, through the UI and the API.
    const o = await secondUser(browser, consoleErrors);
    await signUp(o.context);
    await o.page.goto(`/search?q=${token}`);
    await expect(o.page.getByText('No messages found. Try different words or fewer filters.')).toBeVisible();
    const res = await api(o.context).get<{ results: unknown[] }>(`/api/search/messages?q=${token}`);
    expect(res.results).toHaveLength(0);

    // After joining, the same person can find it.
    const code = await createInvite(context, community.id);
    await joinWithInvite(o.context, code);
    const after = await api(o.context).get<{ results: unknown[] }>(`/api/search/messages?q=${token}`);
    expect(after.results).toHaveLength(1);
    await o.context.close();
  });
});
