import type { Page } from '@playwright/test';
import { createCommunity, expect, sendMessage, signUp, test, windowSettled } from './fixtures';

/** Geometry of every message row: outer height, text height, and the text's top edge. */
async function rowGeometry(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-message-id], [data-pending-nonce]')].map((row) => {
      const text = row.querySelector<HTMLElement>('[data-testid="message-content"]');
      const r = row.getBoundingClientRect();
      const t = text?.getBoundingClientRect();
      return {
        grouped: row.dataset.compact === 'true',
        rowHeight: r.height,
        textTop: t?.top ?? r.top,
        textBottom: t ? t.bottom : r.bottom,
        textHeight: t?.height ?? 0,
      };
    }),
  );
}

test.describe('message layout', () => {
  test('consecutive messages are grouped tightly and look the same after a reload', async ({ page, context }) => {
    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    await page.goto(`/c/${community.id}/${channel.id}`);

    await sendMessage(page, 'first in the group');
    await sendMessage(page, 'second, right below');
    await sendMessage(page, 'third, also grouped');
    const input = page.getByTestId('composer-input');
    await input.fill('intro');
    await input.press('Shift+Enter');
    await input.pressSequentially('```');
    await input.press('Shift+Enter');
    await input.pressSequentially('const x = 1;');
    await input.press('Shift+Enter');
    await input.pressSequentially('```');
    await input.press('Shift+Enter');
    await input.pressSequentially('outro');
    await input.press('Enter');
    await expect(page.locator('[data-message-id]')).toHaveCount(4);
    await expect(page.locator('[data-pending-nonce]')).toHaveCount(0);

    const rows = await rowGeometry(page);
    expect(rows.map((r) => r.grouped)).toEqual([false, true, true, true]);
    for (const r of rows.slice(1, 3)) {
      // A one-line grouped message is its text plus a few pixels of padding — nothing hidden
      // (the hover timestamp once wrapped onto two lines and doubled the row height).
      expect(r.textHeight).toBeLessThan(30);
      expect(r.rowHeight - r.textHeight).toBeLessThanOrEqual(6);
    }
    for (let i = 1; i < rows.length; i++) {
      const gap = rows[i]!.textTop - rows[i - 1]!.textBottom;
      expect(gap, `gap above message ${i + 1}`).toBeLessThanOrEqual(10);
    }
    // "intro" + code block + "outro": no empty line after the block.
    const codeBlock = page.locator('[data-message-id] pre').last();
    const afterBlock = await codeBlock.evaluate((pre) => {
      const content = pre.closest('[data-testid="message-content"]')!;
      return content.getBoundingClientRect().bottom - pre.getBoundingClientRect().bottom;
    });
    expect(afterBlock).toBeLessThan(32); // one line of text (~23px) + the block's margin, not two lines

    await page.reload();
    await expect(page.locator('[data-message-id]')).toHaveCount(4);
    await windowSettled(page);
    const afterReload = await rowGeometry(page);
    expect(afterReload.map((r) => Math.round(r.rowHeight))).toEqual(rows.map((r) => Math.round(r.rowHeight)));
  });

  test('a message keeps its row and its height from sending to confirmed', async ({ page, context }) => {
    await signUp(context);
    const community = await createCommunity(context);
    const channel = community.channels[0];
    if (!channel) throw new Error('no channel');
    // Hold back the server's confirmation (the ack and the broadcast) so the "sending" state lasts.
    let holdConfirmations = false;
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((m) => server.send(m));
      server.onMessage((m) => {
        const text = typeof m === 'string' ? m : '';
        if (holdConfirmations && (text.startsWith('43') || text.startsWith('42["message:new"'))) {
          setTimeout(() => ws.send(m), 1500);
        } else {
          ws.send(m);
        }
      });
    });
    await page.goto(`/c/${community.id}/${channel.id}`);
    await sendMessage(page, 'already delivered');
    await expect(page.locator('[data-message-id]')).toHaveCount(1);

    holdConfirmations = true;
    await sendMessage(page, 'waiting for the server');
    const row = page.locator('[data-pending-nonce]');
    await expect(row).toHaveCount(1);
    const handle = await row.elementHandle();
    const pendingHeight = (await row.boundingBox())!.height;
    expect(await row.getAttribute('data-compact')).toBe('true'); // grouped while sending, like after

    await expect(page.locator('[data-message-id]')).toHaveCount(2);
    const sameNode = await handle!.evaluate((el) => el.isConnected && el.hasAttribute('data-message-id'));
    expect(sameNode).toBe(true); // confirmed in place: no remount, no flash
    const confirmedHeight = (await page.locator('[data-message-id]').last().boundingBox())!.height;
    expect(Math.abs(confirmedHeight - pendingHeight)).toBeLessThanOrEqual(1);
  });
});
