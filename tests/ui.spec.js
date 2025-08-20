import { test, expect } from '@playwright/test';

import { writeFile } from 'fs/promises';
const BASE_URL = 'http://localhost:3000';

test.describe('DeepSeek UI', () => {
  test('Nouvelle discussion et envoi de message', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('#new-discussion-btn', { timeout: 5000 });
    await page.click('#new-discussion-btn');
    await page.fill('#message', 'puce');
    await page.click('#chat-form button[type="submit"]');
    // Capture d'écran après l'envoi du message
    await page.screenshot({ path: 'test-results/ui-after-send.png', fullPage: true });
    // Log du DOM pour debug
    const dom = await page.content();
    await writeFile('test-results/ui-dom.html', dom);
    await page.waitForSelector('.message.bot .message-content', { timeout: 20000 });
    const botMsg = await page.textContent('.message.bot .message-content');
    expect(botMsg.length).toBeGreaterThan(0);
  });
});
