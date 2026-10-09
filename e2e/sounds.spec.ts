import type { Page } from '@playwright/test';
import {
  createCommunity,
  createInvite,
  expect,
  joinWithInvite,
  messageRow,
  secondUser,
  sendMessage,
  signUp,
  test,
} from './fixtures';

/**
 * Records every sound the app sends to the speakers: the engine connects one gain node per sound
 * to the audio output, with gain = LEVEL × (volume / 100)². Values come from sound-recipes.ts.
 */
async function listenToSounds(page: Page) {
  await page.addInitScript(() => {
    const played: number[] = [];
    (window as unknown as { __sounds: number[] }).__sounds = played;
    const connect = GainNode.prototype.connect as (this: GainNode, ...args: unknown[]) => unknown;
    GainNode.prototype.connect = function (this: GainNode, ...args: unknown[]) {
      if (args[0] === this.context.destination) played.push(Math.round(this.gain.value * 10000) / 10000);
      return connect.apply(this, args);
    } as typeof GainNode.prototype.connect;
  });
}
const sounds = (page: Page) => page.evaluate(() => (window as unknown as { __sounds: number[] }).__sounds.slice());

// Default volumes: interface 50 % (gain × 0.25), notifications 70 % (× 0.49).
const SEND = 0.6 * 0.25;
const RECEIVE = 0.252 * 0.25;
const count = (list: number[], gain: number) => list.filter((g) => Math.abs(g - gain) < 0.001).length;

test.describe('interface sounds', () => {
  test('silent until the first interaction; one sound per send; a chime for others; settings switch them off', async ({
    page,
    context,
    browser,
    consoleErrors,
  }) => {
    await listenToSounds(page);
    await signUp(context);
    const community = await createCommunity(context);
    const general = community.channels[0];
    if (!general) throw new Error('no channel');
    const code = await createInvite(context, community.id);
    const b = await secondUser(browser, consoleErrors);
    await signUp(b.context);
    await joinWithInvite(b.context, code);

    const url = `/c/${community.id}/${general.id}`;
    await page.goto(url);
    await b.page.goto(url);
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await page.waitForTimeout(300);
    expect(await sounds(page)).toEqual([]); // no gesture yet: browsers forbid audio, so nothing plays

    // Sending: one sound, although the message is shown first and confirmed by the server after.
    await page.getByTestId('composer-input').click();
    await sendMessage(page, 'first take is up');
    await expect(page.locator('[data-message-id]')).toHaveCount(1);
    await page.waitForTimeout(300);
    expect(count(await sounds(page), SEND)).toBe(1);

    // Someone else writes in the conversation being read: a soft chime.
    await sendMessage(b.page, 'sounds great');
    await expect(messageRow(page, 'sounds great')).toBeVisible();
    await expect.poll(async () => count(await sounds(page), RECEIVE)).toBe(1);

    // Interface sounds off (per device): the next message is silent.
    await page.goto('/settings/notifications');
    await page.getByRole('switch', { name: /Interface sounds/ }).click();
    await page.goto(url);
    const before = (await sounds(page)).length;
    await page.getByTestId('composer-input').click();
    await page.waitForTimeout(1300); // past the gap between two chimes
    await sendMessage(b.page, 'second idea');
    await expect(messageRow(page, 'second idea')).toBeVisible();
    await sendMessage(page, 'quiet reply');
    await expect(messageRow(page, 'quiet reply')).toBeVisible();
    await page.waitForTimeout(300);
    expect((await sounds(page)).slice(before)).toEqual([]);
  });
});
