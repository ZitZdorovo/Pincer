import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('donated shell matches the OpenX dev geometry and theme structure', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'pincer-donor-ui-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined)) as Record<string, string>;
  const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...env, PINCER_TEST_DATA: profile } });
  const errors: string[] = [];
  try {
    const page = await app.firstWindow(); page.on('pageerror', (error) => errors.push(error.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 850));
    await page.getByRole('button', { name: 'Открыть оболочку' }).click();
    await expect(page.getByTestId('chat-composer')).toBeVisible();
    const box = async (id: string) => page.getByTestId(id).boundingBox();
    expect(await box('windows-titlebar')).toEqual({ x: 0, y: 0, width: 1280, height: 40 });
    expect(await box('sidebar-layout-slot')).toEqual({ x: 0, y: 40, width: 320, height: 810 });
    expect(await box('chat-page')).toEqual({ x: 320, y: 40, width: 960, height: 810 });
    expect(await box('chat-composer-surface')).toEqual({ x: 428, y: 688, width: 736, height: 108 });
    await page.screenshot({ path: 'artifacts/pincer-donor/chat-light.png' });
    await page.getByTestId('sidebar-nav-settings').click();
    await page.getByTestId('settings-theme-dark').click();
    await expect(page.locator('html')).toHaveClass('dark');
    await page.waitForTimeout(650); await page.screenshot({ path: 'artifacts/pincer-donor/settings-dark.png' });
    await page.getByRole('button', { name: 'Вернуться в приложение' }).click();
    await page.screenshot({ path: 'artifacts/pincer-donor/chat-dark.png' });
    await page.getByRole('button', { name: 'Поиск', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({ path: 'artifacts/pincer-donor/search-dark.png' });
    await page.keyboard.press('Escape');
    for (const route of ['models', 'agents', 'channels', 'skills', 'cron']) {
      await page.getByTestId(`sidebar-nav-${route}`).click();
      await page.waitForTimeout(650);
      await page.screenshot({ path: `artifacts/pincer-donor/${route}-dark.png` });
    }
    expect(errors).toEqual([]);
  } finally { await app.close(); rmSync(profile, { recursive: true, force: true }); }
});
