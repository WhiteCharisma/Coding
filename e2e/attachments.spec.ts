import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MessageDTO } from '@creator-network/shared';
import {
  api,
  createCommunity,
  createInvite,
  expect,
  joinWithInvite,
  messageRow,
  secondUser,
  signUp,
  test,
} from './fixtures';

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');

test.describe('attachments', () => {
  test('audio uploads get a waveform player; images open full size; files are access-controlled', async ({
    page,
    context,
    browser,
    consoleErrors,
  }) => {
    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    await page.goto(`/c/${community.id}/${channel.id}`);

    // Attach an audio file and an image to one message.
    await page
      .locator('input[type="file"]')
      .setInputFiles([path.join(assets, 'demo-loop.wav'), path.join(assets, 'cover-art.png')]);
    const input = page.getByTestId('composer-input');
    await input.fill('New loop + cover, feedback welcome');
    const send = page.getByTestId('composer-send');
    await expect(send).toBeEnabled({ timeout: 20_000 });
    await input.press('Enter');

    const row = messageRow(page, 'New loop + cover, feedback welcome');
    await expect(row).toBeVisible();
    const play = row.getByRole('button', { name: 'Play demo-loop' });
    await expect(play).toBeVisible();
    await expect(row.getByRole('slider', { name: 'Seek in demo-loop' })).toBeVisible();
    await expect(row).toContainText('0:02'); // 1.5 s, measured in the browser before upload
    await expect(row.getByRole('button', { name: 'Open full size' })).toBeVisible();

    // The waveform was computed client-side and stored with the attachment.
    const { messages } = await api(context).get<{ messages: MessageDTO[] }>(`/api/channels/${channel.id}/messages`);
    const sent = messages.find((m) => m.content.includes('New loop + cover'));
    const audio = sent?.attachments.find((a) => a.mime.startsWith('audio/'));
    const image = sent?.attachments.find((a) => a.mime.startsWith('image/'));
    expect(audio?.waveform?.length).toBeGreaterThan(10);
    expect(image?.width).toBe(320);
    expect(image?.height).toBe(200);

    // Playback starts on click.
    await play.click();
    await expect(row.getByRole('button', { name: 'Pause demo-loop' })).toBeVisible();
    await row.getByRole('button', { name: 'Pause demo-loop' }).click();

    // Lightbox.
    await row.getByRole('button', { name: 'Open full size' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Members can fetch the file with safe headers; outsiders cannot; members of the community can.
    if (!audio || !image) throw new Error('attachments missing');
    const own = await context.request.get(image.url);
    expect(own.status()).toBe(200);
    expect(own.headers()['content-type']).toBe('image/png');
    expect(own.headers()['x-content-type-options']).toBe('nosniff');
    expect(own.headers()['content-security-policy']).toContain('sandbox');
    const ranged = await context.request.get(audio.url, { headers: { Range: 'bytes=0-99' } });
    expect(ranged.status()).toBe(206);
    expect((await ranged.body()).length).toBe(100);

    const o = await secondUser(browser, consoleErrors, true);
    await signUp(o.context);
    expect((await o.context.request.get(image.url)).status()).toBe(404);
    expect((await o.context.request.get(audio.url)).status()).toBe(404);
    await joinWithInvite(o.context, await createInvite(context, community.id));
    expect((await o.context.request.get(image.url)).status()).toBe(200);
    await o.context.close();
  });
});
