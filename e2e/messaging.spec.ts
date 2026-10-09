import {
  api,
  createCommunity,
  createInvite,
  expect,
  joinWithInvite,
  messageRow,
  secondUser,
  sendMessage,
  signUp,
  test,
  unique,
} from './fixtures';

test.describe('real-time community chat', () => {
  test('two members exchange messages, replies, mentions, reactions, edits and deletions live', async ({
    page,
    context,
    browser,
    consoleErrors,
  }) => {
    const alice = await signUp(context, { displayName: 'Alice Rivera' });
    const community = await createCommunity(context);
    const general = community.channels[0];
    if (!general) throw new Error('template has no channel');
    const code = await createInvite(context, community.id);

    const b = await secondUser(browser, consoleErrors);
    const bob = await signUp(b.context, { displayName: 'Bob Okafor' });
    await joinWithInvite(b.context, code);

    const url = `/c/${community.id}/${general.id}`;
    await page.goto(url);
    await b.page.goto(url);
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await expect(b.page.getByTestId('composer-input')).toBeVisible();

    // Alice → Bob, delivered without reloading.
    await sendMessage(page, 'First take of the bassline is up');
    await expect(messageRow(b.page, 'First take of the bassline is up')).toBeVisible();

    // Typing indicator.
    await b.page.getByTestId('composer-input').pressSequentially('Listening', { delay: 30 });
    await expect(page.getByText('Bob Okafor is typing…')).toBeVisible();
    await b.page.getByTestId('composer-input').fill('');

    // Bob replies and mentions Alice → she gets a notification.
    await messageRow(b.page, 'First take of the bassline is up').hover();
    await b.page.getByRole('button', { name: 'Reply' }).click();
    await sendMessage(b.page, `@${alice.username} the low end is huge`);
    const reply = messageRow(page, 'the low end is huge');
    await expect(reply).toBeVisible();
    await expect(reply.getByRole('button', { name: 'Jump to the original message' })).toBeVisible();
    await expect(page.getByTestId('rail-notifications')).toContainText('1');

    // Alice reacts; Bob sees the count.
    await reply.hover();
    await reply.getByRole('button', { name: 'Add reaction' }).click();
    await page.getByRole('button', { name: '🔥' }).click();
    await expect(
      messageRow(b.page, 'the low end is huge').getByRole('button', { name: '1 reaction with 🔥' }),
    ).toBeVisible();

    // Alice edits her message; Bob sees the new text and the "edited" marker.
    const mine = messageRow(page, 'First take of the bassline is up');
    await mine.hover();
    await mine.getByRole('button', { name: 'Message actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    const editor = page.getByLabel('Editing message');
    await editor.fill('Second take of the bassline is up');
    await editor.press('Enter');
    const edited = messageRow(b.page, 'Second take of the bassline is up');
    await expect(edited).toBeVisible();
    await expect(edited).toContainText('edited');

    // Alice deletes it; it disappears for Bob.
    const toDelete = messageRow(page, 'Second take of the bassline is up');
    await toDelete.hover();
    await toDelete.getByRole('button', { name: 'Message actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(b.page.getByTestId('message-list')).not.toContainText('Second take of the bassline is up');

    // The mention notification is listed for Alice.
    await page.goto('/notifications');
    await expect(page.getByText(/Bob Okafor mentioned you/)).toBeVisible();
    expect(bob.username).toBeTruthy();
    await b.context.close();
  });

  test('messages survive a reload and show in order', async ({ page, context }) => {
    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    await page.goto(`/c/${community.id}/${channel.id}`);
    for (const n of [1, 2, 3]) await sendMessage(page, `ordered message ${n}`);
    await expect(messageRow(page, 'ordered message 3')).toBeVisible();
    await page.reload();
    const texts = await page.locator('[data-message-id]').allInnerTexts();
    const order = ['ordered message 1', 'ordered message 2', 'ordered message 3'].map((s) =>
      texts.findIndex((t) => t.includes(s)),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('a member who leaves stops receiving the channel', async ({ page, context, browser, consoleErrors }) => {
    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    const code = await createInvite(context, community.id);
    const b = await secondUser(browser, consoleErrors, true);
    await signUp(b.context);
    await joinWithInvite(b.context, code);
    await api(b.context).post(`/api/communities/${community.id}/leave`, {}, 204);
    const res = await b.context.request.get(`/api/channels/${channel.id}/messages`);
    expect(res.status()).toBe(404);
    await page.goto(`/c/${community.id}/${channel.id}`);
    await sendMessage(page, unique('after-leave-'));
    await b.context.close();
  });
});
