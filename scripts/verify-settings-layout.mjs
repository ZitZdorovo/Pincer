import { _electron as electron, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Opt-in, read-only visual check against the explicitly authorized local Gateway.
const password = process.env.PINCER_DIAGNOSTIC_PASSWORD;
if (!password) throw new Error('PINCER_DIAGNOSTIC_PASSWORD required');
const directory = mkdtempSync(join(tmpdir(), 'pincer-layout-'));
const env = { ...process.env, PINCER_TEST_DATA: directory };
delete env.ELECTRON_RUN_AS_NODE; delete env.PINCER_DIAGNOSTIC_PASSWORD;
const app = await electron.launch({ args: ['.'], env });
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.pincer));
  const result = await page.evaluate(credential => window.pincer.gateway.connect({ url: 'ws://127.0.0.1:18789', authMode: 'password', credential }), password);
  if (!result.ok) throw new Error(result.error.message);
  await expect.poll(async () => (await page.evaluate(() => window.pincer.gateway.snapshot())).operator.phase).toBe('connected');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900));
  await page.keyboard.press('Control+,');
  const output = join(process.cwd(), 'artifacts', 'settings-redesign-live'); mkdirSync(output, { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.getByTestId('settings-nav-appearance').click();
    await page.getByTestId(`settings-theme-${theme}`).click();
    for (const section of ['appearance', 'communications', 'talk', 'infrastructure']) {
      await page.getByTestId(`settings-nav-${section}`).click();
      if (section !== 'appearance') await expect(page.getByTestId('gateway-settings-browser').locator('.oc-settings-card').first()).toBeVisible();
      await page.screenshot({ path: join(output, `${section}-${theme}.png`) });
      if (section === 'communications') {
        await page.locator('[data-setting-path="messages.queue"]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(output, `message-queue-${theme}.png`) });
        const rows = page.locator('[data-setting-root="messages"] .oc-setting-row:visible');
        const metrics = await rows.evaluateAll(elements => elements.filter(element => !element.closest('.oc-array-item')).map(element => {
          const control = element.querySelector('.oc-setting-control'); const box = control?.getBoundingClientRect();
          return { path: element.getAttribute('data-setting-path'), x: box?.x, right: box?.right, width: box?.width };
        }));
        console.log(theme, 'message field geometry:', JSON.stringify(metrics));
      }
      expect(await page.getByTestId('settings-scroll').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 650));
  await page.getByTestId('settings-nav-communications').click();
  await page.locator('[data-setting-path="messages.queue"]').scrollIntoViewIfNeeded();
  expect(await page.getByTestId('settings-scroll').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: join(output, 'message-queue-narrow.png') });
  console.log('Live settings layout captured; no Gateway settings were written.');
} finally {
  await app.close();
  rmSync(directory, { recursive: true, force: true });
}
