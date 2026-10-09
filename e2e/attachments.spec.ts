import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MessageDTO } from '@creator-network/shared';
import { encodePng } from '../apps/server/src/seed/png';
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

  test('an image can be sent while it uploads, and others get a small preview', async ({
    page,
    context,
    browser,
    consoleErrors,
  }) => {
    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    const code = await createInvite(context, community.id);
    // Hold the upload back so it is visibly still in progress.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/channels/*/attachments', async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(`/c/${community.id}/${channel.id}`);

    // A 1600×1200 noisy PNG (≈5.8 MB): big enough to get a server-side preview.
    const big = encodePng(1600, 1200, new Uint8Array(randomBytes(1600 * 1200 * 3)));
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'big-artwork.png', mimeType: 'image/png', buffer: big });
    await page.getByTestId('composer-input').fill('fresh artwork');
    await page.getByTestId('composer-send').click();

    // Sent right away, shown with the local copy of the file while it uploads...
    const pending = page.locator('[data-pending-nonce]').filter({ hasText: 'fresh artwork' });
    await expect(pending.locator('img')).toHaveAttribute('src', /^blob:/);
    // ...and the conversation is not blocked: a later message goes out first.
    await sendMessage(page, 'meanwhile, a quick note');
    await expect(messageRow(page, 'meanwhile, a quick note')).toBeVisible();
    await expect(pending).toHaveCount(1);

    release();
    const row = messageRow(page, 'fresh artwork');
    await expect(row.locator('img')).toBeVisible({ timeout: 20_000 });
    await expect(pending).toHaveCount(0);

    // Another member gets the small WebP preview in the chat, not the 5.8 MB original.
    const viewer = await secondUser(browser, consoleErrors);
    await signUp(viewer.context);
    await joinWithInvite(viewer.context, code);
    const previewResponse = viewer.page.waitForResponse((r) => r.url().endsWith('/preview'));
    await viewer.page.goto(`/c/${community.id}/${channel.id}`);
    const response = await previewResponse;
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/webp');
    expect((await response.body()).length).toBeLessThan(big.length / 4);
    await expect(messageRow(viewer.page, 'fresh artwork').locator('img')).toHaveAttribute('src', /\/preview$/);
    await viewer.context.close();
  });
});
