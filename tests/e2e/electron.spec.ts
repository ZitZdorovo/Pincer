import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockGateway } from '../helpers/gateway';
import { pendingApproval } from '../helpers/approval';
import { createServer } from 'node:http';

let application: ElectronApplication;
let page: Page;
let directory: string;
let mock: MockGateway;
let pageErrors: string[];
async function chooseSelect(control: ReturnType<Page['locator']>, option: string) {
  await control.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
test('settings share the main sidebar width and bounded chat surface; preferences really apply', async () => {
  await connect();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 850));
  const sidebar = await page.getByTestId('sidebar-layout-slot').boundingBox();
  const chatSurface = page.getByTestId('chat-workspace-surface');
  await expect(chatSurface).toHaveCSS('border-top-left-radius', '16px');
  await expect(chatSurface).toHaveCSS('border-top-right-radius', '16px');
  await expect(chatSurface).toHaveCSS('border-top-width', '0px');
  await expect(chatSurface).not.toHaveCSS('box-shadow', 'none');
  const chatSurfaceColor = await chatSurface.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(chatSurfaceColor).not.toBe('rgba(0, 0, 0, 0)');
  await page.keyboard.press('Control+,');
  await expect(page.getByTestId('settings-navigation')).toHaveCSS('width', `${sidebar!.width}px`);
  const settingsSeparator = page.getByRole('separator', { name: 'Ширина боковой панели настроек', exact: true });
  await expect(settingsSeparator).toHaveCSS('cursor', 'col-resize');
  await expect(settingsSeparator.locator('.pincer-resize-line')).toHaveCSS('width', '1px');
  const content = page.getByTestId('settings-content'); await expect(content).toHaveCSS('border-top-left-radius', '16px'); await expect(content).toHaveCSS('border-top-width', '1px');
  await expect(content).toHaveCSS('background-color', chatSurfaceColor);
  const bounds = await content.boundingBox(); expect(bounds!.x).toBe(sidebar!.width); expect(bounds!.height).toBeLessThanOrEqual(810);
  await page.getByTestId('settings-theme-light').click();
  await expect(page.getByTestId('settings-theme-light')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'artifacts/pincer-donor/settings-new-light.png' });
  await page.getByTestId('settings-theme-dark').click();
  await chooseSelect(page.getByLabel('Шрифт чата', { exact: true }), 'Georgia');
  await page.getByRole('button', { name: 'Фиолетовый', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent-color', 'violet');
  await expect(page.locator('html')).toHaveAttribute('data-chat-font', 'serif');
  await page.screenshot({ path: 'artifacts/pincer-donor/settings-new-dark.png' });
  await page.getByTestId('settings-nav-chat').click();
  await page.getByLabel('Ширина сообщений', { exact: true }).fill('1008');
  const collapseSwitch = page.getByRole('switch', { name: 'Сворачивать ход работы', exact: true });
  await expect(collapseSwitch).toHaveCSS('border-top-left-radius', '8px');
  await expect(collapseSwitch.locator('span')).toHaveCSS('border-top-left-radius', '6px');
  await collapseSwitch.click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.getByTestId('chat-composer').evaluate(el => getComputedStyle(el).maxWidth)).toBe('1040px');
  await page.keyboard.press('Control+,');
  await page.getByTestId('settings-nav-chat').click();
  await expect(page.getByRole('switch', { name: 'Сворачивать ход работы', exact: true })).toHaveAttribute('aria-checked', 'true');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 620));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/pincer-donor/settings-minimum.png' });
});
test('closing can hide Pincer to the tray and the choice persists in the desktop process', async () => {
  await connect();
  await page.keyboard.press('Control+,');
  const behavior = page.getByLabel('Действие при закрытии', { exact: true });
  await chooseSelect(behavior, 'Скрыть в трей');
  await expect.poll(() => page.evaluate(() => window.pincer.desktop.closeBehavior())).toBe('tray');
  expect(JSON.parse(readFileSync(join(directory, 'desktop-preferences.json'), 'utf8')).closeBehavior).toBe('tray');

  await page.evaluate(() => window.pincer.window.action('close'));
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await expect(page.getByTestId('settings-content')).toBeVisible();

  await chooseSelect(behavior, 'Закрыть полностью');
  await expect.poll(() => page.evaluate(() => window.pincer.desktop.closeBehavior())).toBe('quit');
});
test('complete Gateway settings are edited inside Pincer with profile, devices and logs', async () => {
  mock.config = { ...mock.config, ui: { enabled: false } };
  await connect(); await page.keyboard.press('Control+,');
  await expect(page.getByTestId('gateway-settings-browser')).toBeVisible();
  await expect(page.getByTestId('gateway-settings-root')).toHaveCount(0);
  await expect(page.locator('[data-setting-root="ui"]')).toBeVisible();
  await page.getByRole('switch', { name: 'Включено', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect.poll(() => (mock.config.ui as { enabled?: boolean }).enabled).toBe(true);
  await page.getByTestId('settings-nav-profile').click(); await expect(page.getByRole('textbox', { name: 'Отображаемое имя' })).toHaveValue('Test User');
  await page.getByTestId('settings-nav-devices').click(); await expect(page.getByText('Связанные устройства · 0')).toBeVisible();
  await page.getByTestId('settings-nav-logs').click(); await expect(page.getByText('Gateway ready')).toBeVisible();
  await page.getByTestId('settings-nav-agents').click();
  const embedded = page.getByTestId('agents-page'); await expect(embedded).toBeVisible();
  await expect(embedded.locator('.openx-page-title')).toHaveCSS('font-size', '20px');
  await expect(embedded.locator('.openx-page-frame')).toHaveCSS('padding-top', '0px');
  await expect(embedded).toHaveCSS('margin-top', '0px');
  await expect(embedded).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'artifacts/pincer-donor/settings-embedded-unified.png' });
  await expect(page.getByTestId('settings-content').locator('select')).toHaveCount(0);
  await page.getByTestId('settings-nav-channels').click();
  const channels = page.getByTestId('channels-page'); await expect(channels.getByRole('heading', { name: 'Каналы сообщений', exact: true })).toBeVisible();
  await expect(channels.locator('.openx-page-title')).toHaveCSS('font-size', '20px');
  await expect(channels.getByTestId('channels-refresh-button')).toHaveCSS('border-top-left-radius', '8px');
  await page.screenshot({ path: 'artifacts/pincer-donor/settings-channels-unified.png' });
  await page.getByTestId('settings-nav-notifications').click();
  await expect(page.getByTestId('settings-section-notifications')).toHaveCSS('animation-name', 'settings-section-in');
  await page.getByTestId('settings-nav-automation').click();
  const automation = page.getByTestId('cron-page'); await expect(automation.getByRole('heading', { name: 'Автоматизация', exact: true })).toBeVisible();
  await expect(automation.locator('.openx-page-title')).toHaveCSS('font-size', '20px');
  await expect(automation.getByTestId('cron-new-task-button')).toHaveCSS('border-top-left-radius', '8px');
  await page.screenshot({ path: 'artifacts/pincer-donor/settings-automation-unified.png' });
  await page.getByTestId('settings-nav-providers').click();
  const addProvider = page.getByTestId('providers-add-button');
  await expect(addProvider.locator('xpath=ancestor::*[contains(@class,"settings-section-header")]')).toHaveCount(1);
  const providerHeader = await page.getByTestId('settings-section-providers').locator('.settings-section-header').boundingBox();
  const providerTabs = await page.getByTestId('settings-section-providers').locator('.settings-tabs').boundingBox();
  expect(providerHeader!.y).toBeLessThan(providerTabs!.y);
  await addProvider.click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  const navigation = page.getByTestId('settings-navigation-scroll');
  await navigation.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => navigation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.getByTestId('settings-nav-updates').click();
  await expect(page.getByTestId('updates-page')).toBeVisible();
  await expect(page.getByTestId('updates-page').locator(':scope > div').nth(1)).toHaveCSS('border-top-left-radius', '12px');
  await expect.poll(() => navigation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.getByTestId('settings-nav-advanced').click();
  await expect(page.getByTestId('gateway-settings-root')).toHaveCount(0);
  await expect(page.getByTestId('gateway-settings-browser').getByRole('tab')).toHaveCount(2);
  await expect(page.getByTestId('gateway-settings-browser').locator('.oc-advanced-navigation > details')).toHaveCount(4);
  await page.screenshot({ path: 'artifacts/pincer-donor/settings-complete-schema.png' });
});
test('connection settings use one surface and separate connection from Gateway configuration', async () => {
  await connect(); await page.keyboard.press('Control+,'); await page.getByTestId('settings-nav-gateway').click();
  const connectionTab = page.getByRole('tab', { name: 'Подключение', exact: true });
  await expect(connectionTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('connection-status')).toBeVisible(); await expect(page.getByTestId('gateway-settings-root')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/pincer-donor/settings-connection.png' });
  await connectionTab.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Параметры Gateway', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('gateway-settings-root')).toHaveCount(0);
  await expect(page.getByTestId('connection-status')).toHaveCount(0);
  await expect(page.getByTestId('gateway-settings-browser')).toContainText('Режим');
  await expect(page.getByRole('radio', { name: 'Локальный', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Удалённый', exact: true })).toBeVisible();
});
test('unknown shell routes recover to the chat instead of leaving an empty page', async () => {
  await connect();
  await page.evaluate(() => { location.hash = '#/unknown-screen'; });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/');
  await expect(page.getByTestId('chat-page')).toBeVisible();
});
test('update modal changes surface and text colors in light and dark modes', async () => {
  await connect(); await page.keyboard.press('Control+,');
  const colors: string[] = [];
  for (const [index, theme] of ['light', 'dark'].entries()) {
    await page.getByTestId(`settings-theme-${theme}`).click();
    await expect(page.getByTestId(`settings-theme-${theme}`)).toHaveAttribute('aria-pressed', 'true');
    await application.evaluate(({ BrowserWindow }, revision) => BrowserWindow.getAllWindows()[0].webContents.send('pincer:updates:state', { revision, phase: 'downloading', currentVersion: '0.2.0', version: '0.2.1', percent: 33 }), 900 + index * 2);
    const modal = page.getByRole('dialog'); await expect(modal).toBeVisible();
    colors.push(await modal.evaluate(el => getComputedStyle(el).backgroundColor + ':' + getComputedStyle(el).color));
    await page.screenshot({ path: `artifacts/pincer-donor/update-${theme}.png` });
    await application.evaluate(({ BrowserWindow }, revision) => BrowserWindow.getAllWindows()[0].webContents.send('pincer:updates:state', { revision, phase: 'idle', currentVersion: '0.2.0' }), 901 + index * 2);
    await expect(modal).not.toBeVisible();
  }
  expect(colors[0]).not.toBe(colors[1]); expect(colors[0]).toContain('rgb(255, 255, 255)');
});
test('run progresses from starting to working and retains 16 seconds after history reload and restart', async () => {
  mock.holdRun = true; mock.deltaDelayMs = 60000; await connect(); await page.getByTestId('sidebar-new-chat').click();
  const started = Date.now(); await application.evaluate((_, time) => { Date.now = () => time; }, started);
  await page.getByTestId('chat-composer-input').fill('Проверь время'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByTestId('chat-run-status')).toContainText('Работает уже');
  await expect(page.getByTestId('chat-run-status')).toHaveAttribute('data-phase', 'starting');
  const state = await page.evaluate(() => window.pincer.chat.snapshot()); const key = state.selected!; const runId = state.activeRun!;
  mock.broadcast('chat', { sessionKey: key, runId, seq: 1, state: 'delta', deltaText: 'Готовлю ответ' });
  await expect(page.getByTestId('chat-run-status')).toHaveAttribute('data-phase', 'responding');
  mock.broadcast('agent', { sessionKey: key, runId, stream: 'tool', data: { toolCallId: 'timed-tool', name: 'exec', phase: 'start', args: { command: 'whoami' } } });
  await expect(page.getByTestId('chat-run-status')).toHaveAttribute('data-phase', 'working');
  await application.evaluate((_, time) => { Date.now = () => time; }, started + 16000);
  mock.histories.get(key)!.push({ role: 'assistant', timestamp: (mock.histories.get(key)![0] as { timestamp: number }).timestamp, content: 'Время сохранено', usage: { output: 1102 } }); mock.activeRuns.delete(key);
  mock.broadcast('chat', { sessionKey: key, runId, seq: 2, state: 'final', message: { content: 'Время сохранено', usage: { output: 1102 } } });
  await expect(page.getByTestId('response-stats')).toHaveText(/16 с · 1\s?102 выходных токенов/);
  await page.evaluate(key => window.pincer.chat.select(key), key);
  await expect(page.getByTestId('response-stats')).toHaveText(/16 с · 1\s?102 выходных токенов/);
  await application.close(); application = await launchApplication(); page = await application.firstWindow(); page.on('pageerror', error => pageErrors.push(error.message));
  await page.getByTestId(`sidebar-session-${key}`).click();
  await expect(page.getByTestId('response-stats')).toHaveText(/16 с · 1\s?102 выходных токенов/);
});
test('real Gateway compaction is shown chronologically and notifies until completion', async () => {
  mock.holdRun = true; mock.deltaDelayMs = 60000; await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('chat-composer-input').fill('Большая задача'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  const state = await page.evaluate(() => window.pincer.chat.snapshot()); const key = state.selected!; const runId = state.activeRun!;
  mock.broadcast('chat', { sessionKey: key, runId, seq: 1, state: 'delta', deltaText: 'Проверяю проект.' });
  mock.broadcast('agent', { sessionKey: key, runId, stream: 'compaction', data: { phase: 'start' } });
  await expect(page.getByTestId('compaction-activity')).toHaveAttribute('data-phase', 'running');
  await expect(page.getByText('Сжатие контекста…', { exact: true })).toHaveCount(2);
  mock.broadcast('agent', { sessionKey: key, runId, stream: 'compaction', data: { phase: 'end', completed: true } });
  await expect(page.getByTestId('compaction-activity')).toHaveAttribute('data-phase', 'completed');
  await expect(page.getByText('Беседа оптимизирована', { exact: true })).toHaveCount(2);
  await page.screenshot({ path: 'artifacts/pincer-donor/context-compaction.png' });
});
test('OmniRoute source connects from API settings and exposes real quotas without stored-token leakage', async () => {
  let calls = 0;
  const source = createServer((request, response) => {
    calls++; expect(request.headers.authorization).toBe('Bearer QUOTA_TEST_SECRET');
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(request.url?.startsWith('/api/providers') ? { connections: [{ id: 'account', provider: 'codex', name: 'Test account', apiKey: 'MUST_NOT_REACH_UI' }] } : { caches: { account: { fetchedAt: Date.now(), quotas: { session: { remainingPercentage: 64, resetAt: Date.now() + 3600000 }, weekly: { used: 30, total: 100 } } } } }));
  });
  await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve));
  const address = source.address() as { port: number };
  try {
    await connect(); await page.keyboard.press('Control+,'); await page.getByTestId('settings-nav-providers').click();
    await page.getByRole('tab', { name: 'Лимиты', exact: true }).click();
    const form = page.getByTestId('quota-source-form'); await form.getByLabel('Адрес OmniRoute').fill(`http://127.0.0.1:${address.port}`); await form.getByLabel('Токен управления').fill('QUOTA_TEST_SECRET');
    await form.getByRole('button', { name: 'Проверить и сохранить' }).click();
    await expect(form.getByRole('status')).toContainText('Подключение проверено'); await expect(form.getByLabel('Токен управления')).toHaveValue('');
    await expect(page.getByTestId('provider-quotas')).toContainText('64% осталось'); await expect(page.getByTestId('provider-quotas')).toContainText('Test account');
    expect(calls).toBeGreaterThanOrEqual(4); expect(readFileSync(join(directory, 'quota-sources.vault')).toString()).not.toContain('QUOTA_TEST_SECRET');
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('QUOTA_TEST_SECRET');
    expect(JSON.stringify(await page.evaluate(() => window.pincer.management.quotas()))).not.toContain('MUST_NOT_REACH_UI');
    await page.screenshot({ path: 'artifacts/pincer-donor/settings-provider-limits.png' });
    await page.keyboard.press('Escape'); await page.getByTestId('chat-request-stats-button').click(); await expect(page.getByTestId('chat-request-stats-panel')).not.toContainText('Test account');
    const configureSources = page.getByTestId('configure-quota-sources');
    const restingBackground = await configureSources.evaluate(element => getComputedStyle(element).backgroundColor);
    await configureSources.hover();
    await expect.poll(() => configureSources.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(restingBackground);
    await configureSources.click();
    await expect(page.getByRole('tab', { name: 'Лимиты', exact: true })).toHaveAttribute('aria-selected', 'true');
  } finally { source.closeAllConnections(); await new Promise<void>(resolve => source.close(() => resolve())); }
});
test('provider quotas recheck an asynchronous Gateway refresh instead of claiming no limits', async () => {
  mock.quotaData = { providers: [], refreshing: true, updatedAt: Date.now() };
  await connect(); await page.getByTestId('chat-model-picker-button').click(); await page.locator('[data-testid^="chat-model-picker-option-"]').first().click(); await page.getByTestId('chat-request-stats-button').click();
  await expect(page.getByTestId('chat-request-stats-panel')).toContainText('Gateway запрашивает свежие лимиты');
  mock.quotaData = { providers: [{ provider: 'test', windows: [{ label: '5h', usedPercent: 40, resetAt: Date.now() + 50000 }] }] };
  await expect(page.getByTestId('chat-request-stats-panel')).toContainText('60% осталось', { timeout: 10000 });
});
test('Gateway settings load directly on their page without an extra nested opener', async () => {
  mock.responseDelayMs.set('config.schema', 400);
  await connect(); await page.keyboard.press('Control+,');
  mock.responses.length = 0;
  await page.getByTestId('settings-nav-notifications').click();
  const section = page.getByTestId('settings-section-notifications');
  await expect(section.getByRole('heading', { name: 'Уведомления', exact: true })).toBeVisible();
  await expect(section).toHaveCSS('transform', 'none');
  await page.getByTestId('settings-nav-appearance').click();
  await expect(page.getByText('Дополнительные параметры OpenClaw', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('gateway-settings-root')).toHaveCount(0);
  await expect(page.getByTestId('gateway-settings-browser')).toBeVisible();
  await expect(page.getByTestId('gateway-settings-browser').locator('[data-setting-root="ui"]')).toBeVisible();
  expect(mock.responses.filter(({ method }) => method === 'config.schema')).toHaveLength(1);
});
test('Talk and Communications follow OpenClaw section boundaries without fake nested lists', async () => {
  await connect();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 850));
  await page.keyboard.press('Control+,');
  const output = join(process.cwd(), 'artifacts', 'settings-parity');
  mkdirSync(output, { recursive: true });

  await page.getByTestId('settings-nav-talk').click();
  const talk = page.getByTestId('gateway-settings-browser');
  await expect(talk.locator('[data-setting-root="talk"]')).toBeVisible();
  await expect(talk.locator('[data-setting-root="tts"]')).toHaveCount(0);
  await expect(talk.getByRole('tab')).toHaveCount(0);
  await expect(talk.getByText('Активный поставщик разговорного режима', { exact: true })).toBeVisible();
  await expect(talk.getByPlaceholder('Имя новой записи')).toHaveCount(2);
  await expect(talk.locator('summary').filter({ hasText: 'Активный поставщик разговорного режима' })).toHaveCount(0);
  await page.screenshot({ path: join(output, 'pincer-talk-top.png') });
  const scroller = page.getByTestId('settings-scroll');
  await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: join(output, 'pincer-talk-bottom.png') });

  await page.getByTestId('settings-nav-communications').click();
  await page.getByRole('tab', { name: 'Голос', exact: true }).click();
  const voice = page.getByTestId('gateway-settings-browser');
  await expect(voice.getByRole('radio', { name: 'Выкл.', exact: true })).toBeVisible();
  await expect(voice.getByRole('textbox', { name: 'Голосовой профиль TTS', exact: true })).toBeVisible();
  await expect(voice.getByText('Голосовые профили TTS', { exact: true })).toBeVisible();
  await expect(voice.getByPlaceholder('Имя новой записи')).toHaveCount(2);
  await page.screenshot({ path: join(output, 'pincer-communications-voice-top.png') });
});

test('Labs is nine flat OpenClaw switches and Secrets uses the dedicated store', async () => {
  await connect(); await page.keyboard.press('Control+,');
  await page.getByTestId('settings-nav-labs').click();
  const labs = page.getByTestId('gateway-settings-browser');
  await expect(labs.locator('[data-testid^="labs-"]')).toHaveCount(9);
  await expect(labs.locator('details')).toHaveCount(0);
  await expect(labs.getByRole('switch')).toHaveCount(9);
  const labRowBox = await labs.getByTestId('labs-code-mode').boundingBox();
  const labSwitchBox = await labs.getByRole('switch', { name: 'Code Mode' }).boundingBox();
  expect(Math.round(labRowBox!.x + labRowBox!.width - labSwitchBox!.x - labSwitchBox!.width)).toBe(20);
  await labs.getByRole('switch', { name: 'Code Mode' }).click();
  await labs.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Применить', exact: true }).click();
  await expect.poll(() => JSON.stringify(mock.config)).toContain('"codeMode":"auto"');
  await page.screenshot({ path: join(process.cwd(), 'artifacts', 'settings-parity', 'pincer-labs-flat.png') });

  await page.getByTestId('settings-nav-secrets').click();
  await expect(page.getByTestId('openclaw-secrets')).toBeVisible();
  await expect(page.getByTestId('gateway-settings-browser')).toHaveCount(0);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Имя').fill('TEST_SECRET');
  await dialog.getByLabel('Значение').fill('NEVER_RENDER_AGAIN');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByText('TEST_SECRET', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('NEVER_RENDER_AGAIN');
});
test('main chat has reproducible empty and conversation screenshots in both themes', async () => {
  await connect();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 850));
  const output = join(process.cwd(), 'artifacts', 'chat-audit-0.4.3');
  mkdirSync(output, { recursive: true });
  await expect(page.getByRole('heading', { name: 'Чем могу помочь?' })).toBeVisible();
  await page.screenshot({ path: join(output, '01-empty-light.png') });

  await page.keyboard.press('Control+,'); await page.getByTestId('settings-theme-dark').click(); await page.getByRole('button', { name: 'Вернуться в приложение' }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.screenshot({ path: join(output, '02-empty-dark.png') });

  await page.keyboard.press('Control+,'); await page.getByTestId('settings-theme-light').click(); await page.getByRole('button', { name: 'Вернуться в приложение' }).click();
  await page.getByTestId('chat-composer-input').fill('Покажи состояние интерфейса');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByTestId('chat-page')).toContainText('Hello from Gateway');
  await expect(page.getByRole('button', { name: 'Остановить', exact: true })).not.toBeVisible();
  await page.screenshot({ path: join(output, '03-conversation-light.png') });

  await page.keyboard.press('Control+,'); await page.getByTestId('settings-theme-dark').click(); await page.getByRole('button', { name: 'Вернуться в приложение' }).click();
  await page.screenshot({ path: join(output, '04-conversation-dark.png') });
});
test('settings controls share aligned columns across nested groups and fit a narrow window', async () => {
  await connect(); await page.keyboard.press('Control+,');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900));
  const output = join(process.cwd(), 'artifacts', 'settings-redesign'); mkdirSync(output, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.getByTestId('settings-nav-appearance').click(); await page.getByTestId(`settings-theme-${theme}`).click();
    await page.getByTestId('settings-nav-communications').click();
    const rows = page.locator('[data-setting-root="messages"] .oc-setting-row');
    await expect(rows).toHaveCount(5);
    const boxes = await rows.evaluateAll(elements => elements.map(element => {
      const label = element.firstElementChild!.getBoundingClientRect();
      const control = element.querySelector('.oc-setting-control > input, .oc-setting-control > [role="combobox"], .oc-segmented, [role="switch"]')!.getBoundingClientRect();
      return { label: label.x, right: control.right, width: control.width };
    }));
    for (const box of boxes) { expect(Math.abs(box.label - boxes[0].label)).toBeLessThan(1); expect(Math.abs(box.right - boxes[0].right)).toBeLessThan(1); }
    for (const box of boxes.slice(0, -1)) expect(box.width).toBe(288);
    await expect(page.getByRole('button', { name: 'JSON', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('gateway-settings-browser')).not.toContainText('Настройка «');
    await chooseSelect(page.getByRole('combobox', { name: 'Режим', exact: true }), 'Объединять сообщения');
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();
    await page.screenshot({ path: join(output, `communications-${theme}.png`) });
  }
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 650));
  await expect.poll(() => page.getByTestId('settings-scroll').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const control = page.getByRole('combobox', { name: 'Где подтверждать получение', exact: true });
  await control.scrollIntoViewIfNeeded();
  const bounds = await control.boundingBox(); expect(bounds!.x + bounds!.width).toBeLessThan(760);
  await page.screenshot({ path: join(output, 'communications-narrow.png') });
});

test('every settings page has the same frame and a reproducible visual audit', async () => {
  test.setTimeout(90000);
  await connect();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 850));
  await page.keyboard.press('Control+,');
  const output = join(process.cwd(), 'artifacts', 'theme-audit', 'settings');
  mkdirSync(output, { recursive: true });
  const pages = [
    'profile', 'appearance', 'chat', 'shortcuts', 'notifications',
    'gateway', 'channels', 'communications', 'talk', 'devices', 'cloud-workers',
    'agents', 'labs', 'providers', 'mcp', 'skills', 'plugins', 'memory', 'automation',
    'security', 'secrets', 'approvals', 'infrastructure', 'advanced',
    'developer', 'logs', 'updates', 'about',
  ];
  const content = page.getByTestId('settings-content');
  const scroller = page.getByTestId('settings-scroll');
  for (const theme of ['light', 'dark'] as const) {
    let titleOrigin: { x: number; y: number } | undefined;
    const themeOutput = join(output, theme);
    mkdirSync(themeOutput, { recursive: true });
    await page.getByTestId('settings-nav-appearance').click();
    await page.getByTestId(`settings-theme-${theme}`).click();
    await page.getByRole('button', { name: 'Оранжевый', exact: true }).click();
    for (const [index, section] of pages.entries()) {
      await page.getByTestId(`settings-nav-${section}`).click();
      const title = content.locator('.settings-section-title:visible, .openx-section-title:visible, .openx-page-title:visible').first();
      await expect(title).toBeVisible();
      await expect(title).toHaveCSS('font-size', '20px');
      expect(await scroller.evaluate(element => element.scrollWidth <= element.clientWidth), `${section}: horizontal overflow`).toBe(true);
      await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBe(0);
      await page.waitForTimeout(250);
      await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBe(0);
      const titleBounds = await title.boundingBox();
      expect(titleBounds?.y).toBeGreaterThan(80);
      titleOrigin ??= titleBounds!;
      expect(Math.abs(titleBounds!.x - titleOrigin.x), `${section}: heading x`).toBeLessThanOrEqual(1);
      expect(Math.abs(titleBounds!.y - titleOrigin.y), `${section}: heading y`).toBeLessThanOrEqual(1);
      const prefix = `${String(index + 1).padStart(2, '0')}-${section}`;
      await page.screenshot({ path: join(themeOutput, `${prefix}-top.png`) });
      const scrollable = await scroller.evaluate(element => element.scrollHeight > element.clientHeight + 8);
      if (scrollable) {
        await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await page.screenshot({ path: join(themeOutput, `${prefix}-bottom.png`) });
      }
    }
    await page.getByTestId('settings-nav-gateway').click();
    await page.getByRole('tab', { name: 'Параметры Gateway', exact: true }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(themeOutput, '06-gateway-configuration.png') });
    await page.getByTestId('settings-nav-providers').click();
    await page.getByRole('tab', { name: 'Лимиты', exact: true }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(themeOutput, '14-providers-limits.png') });
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 650));
    for (const section of pages) {
      await page.getByTestId(`settings-nav-${section}`).click();
      await expect(content.locator('.settings-section-title:visible, .openx-section-title:visible, .openx-page-title:visible').first()).toBeVisible();
      await expect.poll(() => scroller.evaluate(element => element.scrollWidth <= element.clientWidth), { message: `${section}: narrow horizontal overflow` }).toBe(true);
      await page.screenshot({ path: join(themeOutput, `${section}-narrow.png`) });
    }
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 850));
  }
  expect(pageErrors).toEqual([]);
});

test('every accent reaches provider selections, focus rings and portal controls in both themes', async () => {
  test.setTimeout(90000);
  await connect();
  await page.keyboard.press('Control+,');
  for (const theme of ['light', 'dark']) {
    for (const accent of ['Оранжевый', 'Зелёный', 'Фиолетовый', 'Розовый', 'Синий']) {
      await page.getByTestId('settings-nav-appearance').click();
      await page.getByTestId(`settings-theme-${theme}`).click();
      await page.getByRole('button', { name: accent, exact: true }).click();
      const schemeColor = await page.getByRole('button', { name: accent, exact: true }).evaluate(element => getComputedStyle(element).accentColor);
      await page.getByLabel('Шрифт чата', { exact: true }).click();
      await expect(page.getByRole('option', { selected: true })).toHaveCSS('color', schemeColor);
      await page.keyboard.press('Escape');
      await page.getByTestId('settings-nav-providers').click();
      await expect(page.getByRole('tab', { selected: true })).toHaveCSS('color', schemeColor);
      await page.getByTestId('providers-add-button').click();
      await page.getByTestId('add-provider-type-custom').click();
      const input = page.getByTestId('add-provider-name-input');
      await input.focus();
      const primary = await input.evaluate(element => getComputedStyle(element).accentColor);
      expect(primary).not.toBe('auto');
      await expect(input).toHaveCSS('border-color', primary);
      await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
      await page.getByTestId('add-provider-models-input').fill('theme-model');
      const checkbox = page.getByRole('checkbox', { name: 'Выбрать модель theme-model', exact: true });
      await checkbox.check();
      await expect(checkbox).toHaveCSS('accent-color', primary);
      const chip = checkbox.locator('..');
      const selected = await chip.evaluate(element => getComputedStyle(element).backgroundColor);
      expect(selected).not.toBe('rgba(0, 0, 0, 0)');
      await checkbox.uncheck();
      await expect(chip).not.toHaveCSS('background-color', selected);
      await page.screenshot({ path: `artifacts/theme-audit/provider-${theme}-${accent}.png` });
      await page.keyboard.press('Escape');
    }
  }
});
function launchEnv(): Record<string, string> {
  const env: Record<string, string> = { PINCER_TEST_DATA: directory };
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  return env;
}
function launchApplication() {
  return electron.launch({
    ...(process.env.PINCER_PACKAGED_EXE ? { executablePath: process.env.PINCER_PACKAGED_EXE, args: [`--user-data-dir=${directory}`] } : { args: ['.'] }),
    cwd: process.cwd(), env: launchEnv(),
  });
}
test.beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'pincer-e2e-'));
  mock = new MockGateway();
  application = await launchApplication();
  page = await application.firstWindow();
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await expect(page.getByTestId('setup-page')).toBeVisible({ timeout: 15000 });
});
test.afterEach(async () => {
  await application?.close();
  await mock?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  expect(pageErrors).toEqual([]);
});

async function connect() {
  await page.getByTestId('remote-gateway-url').fill(await mock.url());
  await page.getByTestId('remote-gateway-credential').fill('TEST_BOOTSTRAP_SECRET');
  await page.getByTestId('remote-gateway-connect').click();
}

async function openMemory() {
 await page.getByTestId('sidebar-nav-settings').click(); await page.getByTestId('settings-nav-memory').click();
}

function openSettingsMemoryPage() {
  return page.getByTestId('settings-content-inner').getByTestId('memory-page');
}

test('clean Electron shell, imported design tokens and no renderer Node privileges', async () => {
  await expect(page).toHaveTitle('Pincer');
  await expect(page.getByTestId('phase-operator')).toHaveText('Отключено');
  await expect(page.getByTestId('phase-node')).toHaveText('Отключено');
  const boundary = await page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>).require,
    process: typeof (globalThis as Record<string, unknown>).process,
    api: Object.keys(window.pincer).sort(),
  }));
  expect(boundary).toEqual({ require: 'undefined', process: 'undefined', api: ['approvals', 'chat', 'configuration', 'desktop', 'drafts', 'files', 'gateway', 'gatewayAdmin', 'management', 'memory', 'platform', 'secrets', 'settings', 'updates', 'window'] });
  await page.screenshot({ path: 'artifacts/pincer-connection-light.png' });
  await page.keyboard.press('Control+,'); await page.getByTestId('settings-theme-dark').click(); await page.getByRole('button', { name: 'Вернуться в приложение' }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.screenshot({ path: 'artifacts/pincer-connection-dark.png' });
  await expect(page.getByRole('heading', { name: 'Чем могу помочь?' })).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeDisabled();
  await page.screenshot({ path: 'artifacts/pincer-shell-dark.png' });
  await expect(page.getByTestId('sidebar-close-icon')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Скрыть боковую панель' }).click();
  await expect(page.getByTestId('sidebar-open-icon')).toHaveCSS('opacity', '1');
  await expect(page.locator('aside')).toHaveAttribute('inert', '');
});

test('real dual connection, no plaintext secrets and explicit disconnect', async () => {
  await connect();
  await expect(page.getByTestId('main-layout')).toBeVisible();
  await expect(page.getByTestId('setup-page')).not.toBeVisible();
  await page.getByTestId('gateway-connection-state').click();
  await expect(page.getByTestId('phase-operator')).toHaveText('Подключено');
  await expect(page.getByTestId('phase-node')).toHaveText('Подключено');
  await expect(page.getByTestId('remote-gateway-credential')).toHaveValue('');
  const state = await page.evaluate(() => window.pincer.gateway.snapshot());
  expect(JSON.stringify(state)).not.toContain('TEST_BOOTSTRAP_SECRET');
  expect(readFileSync(join(directory, 'gateway.vault')).includes('TEST_BOOTSTRAP_SECRET')).toBe(false);
  expect(mock.signatureChecks.every(Boolean)).toBe(true);
  await page.getByRole('button', { name: 'Отключить', exact: true }).click();
  await expect(page.getByTestId('phase-node')).toHaveText('Отключено');
  await expect(page.getByTestId('phase-operator')).toHaveText('Отключено');
});

test('pairing and authorization errors remain visible and redact secrets', async () => {
  mock.mode = 'pairing';
  await connect();
  await expect(page.getByTestId('status-node')).toContainText('pairing-test-123');
  await expect(page.getByTestId('phase-operator')).toHaveText('Ожидает подтверждения');
  mock.mode = 'auth';
  await page.getByRole('button', { name: 'Повторить подключение' }).click();
  await expect(page.getByTestId('phase-operator')).toHaveText('Ошибка авторизации');
  await expect(page.getByTestId('status-operator')).not.toContainText('TEST_BOOTSTRAP_SECRET');
});

test('recovers after Gateway restart and app restart with the same device identity', async () => {
  await connect();
  await expect(page.getByTestId('main-layout')).toBeVisible();
  const before = await page.evaluate(() => window.pincer.gateway.snapshot());
  mock.drop();
  await expect.poll(() => mock.connects.length).toBeGreaterThanOrEqual(4);
  await expect.poll(async () => (await page.evaluate(() => window.pincer.gateway.snapshot())).node.phase).toBe('connected');
  await application.close();
  application = await launchApplication();
  page = await application.firstWindow();
  await expect(page.getByTestId('main-layout')).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => window.pincer.gateway.snapshot())).node.phase).toBe('connected');
  expect((await page.evaluate(() => window.pincer.gateway.snapshot())).deviceId).toBe(before.deviceId);
});

test('chat sends once, streams and reloads authoritative history', async () => {
  await connect();
  await expect(page.getByRole('button', { name: 'Новый чат', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Новый чат', exact: true }).click();
  await page.getByTestId('chat-composer-input').fill('Hello test');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByTestId('chat-page')).toContainText('Hello from Gateway');
  await expect(page.getByRole('button', { name: 'Остановить', exact: true })).not.toBeVisible();
  await expect(page.getByTestId('chat-page').locator('article').getByText('Hello test', { exact: true })).toHaveCount(1);
  await expect.poll(async () => (await page.evaluate(() => window.pincer.chat.snapshot())).messages.filter((message) => message.role === 'assistant').length).toBe(1);
  expect(mock.responses.filter((request) => request.method === 'chat.send')).toHaveLength(1);
  expect(mock.responses.find((request) => request.method === 'sessions.create')?.params).toMatchObject({ permissionMode: 'full' });
  await page.keyboard.press('Control+,'); await page.getByTestId('settings-theme-dark').click(); await page.getByRole('button', { name: 'Вернуться в приложение' }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.screenshot({ path: 'artifacts/pincer-chat-dark.png' });
});

test('memory lives on Gateway, rejects conflicting edits and distinguishes missing embeddings', async () => {
  await connect();
  await openMemory();
  await expect(page.getByRole('button', { name: 'Загрузить память' })).toBeEnabled();
  await page.getByRole('button', { name: 'Загрузить память' }).click();
  await expect(page.getByRole('textbox', { name: 'MEMORY.md' })).toHaveValue(mock.memoryContent);
  await page.getByRole('textbox', { name: 'MEMORY.md' }).fill('# Memory\nUpdated by Pincer');
  await page.getByRole('button', { name: 'Сохранить память' }).click();
  await expect.poll(() => mock.memoryContent).toContain('Updated by Pincer');
  mock.embeddingReady = false;
  await page.getByRole('button', { name: 'Проверить семантический поиск' }).click();
  await expect(openSettingsMemoryPage()).toContainText('Семантический поиск не готов');
  await page.getByRole('textbox', { name: 'Что вспомнить?' }).fill('Pincer');
  await page.getByRole('button', { name: 'Искать в памяти' }).click();
  await expect(openSettingsMemoryPage()).toContainText('Поиск по словам — не семантический');
  await page.getByRole('textbox', { name: 'MEMORY.md' }).fill('Local change');
  mock.memoryContent = 'Concurrent server change';
  await page.getByRole('button', { name: 'Сохранить память' }).click();
  await expect(openSettingsMemoryPage()).toContainText('Память изменена на сервере');
  expect(mock.memoryContent).toBe('Concurrent server change');
  await page.screenshot({ path: 'artifacts/pincer-memory.png' });
});

test('update modal follows real progress events and has no simulated development install', async () => {
  test.skip(Boolean(process.env.PINCER_PACKAGED_EXE), 'Development-mode behavior only');
  await page.getByRole('button', { name: 'Открыть оболочку' }).click();
  await page.getByTestId('sidebar-nav-settings').click();
  await page.getByTestId('settings-nav-updates').click();
  await expect(page.getByTestId('settings-page')).toContainText('сборка для разработки');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('pincer:updates:state', { revision: 500, phase: 'downloading', currentVersion: '0.2.0', version: '0.2.1', percent: 33 }));
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
  await page.screenshot({ path: 'artifacts/pincer-update-modal.png' });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('pincer:updates:state', { revision: 501, phase: 'error', currentVersion: '0.2.0', error: 'UPDATE_FAILED' }));
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByTestId('settings-page')).toContainText('Не удалось обновить Pincer');
});

test('validates in Main, rejects unsafe URLs and keeps controls usable at minimum size', async () => {
  const invalid = await page.evaluate(() => window.pincer.gateway.connect({ url: 'ws://public.example.com/', authMode: 'token', credential: 'test' }));
  expect(invalid).toMatchObject({ ok: false, error: { code: 'TLS_REQUIRED' } });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 620));
  await page.getByTestId('remote-gateway-connect').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('remote-gateway-connect')).toBeInViewport();
  await page.keyboard.press('Control+,'); await page.getByRole('button', { name: 'English', exact: true }).click(); await page.getByTestId('settings-nav-gateway').click();
  await expect(page.getByRole('heading', { name: 'Connect to OpenClaw' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('donor sidebar resizing, search and real rename/pin/delete', async () => {

 await connect(); await page.getByTestId('sidebar-new-chat').click();
 await page.getByTestId('chat-composer-input').fill('Создай чат'); await page.getByRole('button', { name: 'Отправить', exact: true }).click(); await expect(page.getByTestId('acp-assistant-message')).toBeVisible();
 const handle = page.getByTestId('sidebar-resize-handle'); await handle.focus(); await page.keyboard.press('ArrowRight');
 await expect.poll(() => page.getByTestId('sidebar-layout-slot').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(330);
 const handleBounds = (await handle.boundingBox())!;
 await page.mouse.move(handleBounds.x + 2, handleBounds.y + 20); await page.mouse.down(); await page.mouse.move(900, handleBounds.y + 20); await page.mouse.up();
 const viewportWidth = await page.evaluate(() => window.innerWidth);
 await expect.poll(() => page.getByTestId('sidebar-layout-slot').evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(viewportWidth * 0.3 + 1);
 const key = (await page.evaluate(() => window.pincer.chat.snapshot())).selected!;
 const row = page.getByTestId(`sidebar-session-${key}`);
 await expect(row).toHaveCSS('cursor', 'default');
 await row.click({ button: 'right' }); await page.getByTestId('chat-context-menu').getByRole('button', { name: 'Переименовать', exact: true }).click();
 await page.getByTestId('sidebar-chat-rename-input').fill('Renamed chat'); await page.getByTestId('sidebar-chat-rename-input').press('Enter');
 await expect.poll(() => mock.sessions.find((session) => session.key === key)?.label).toBe('Renamed chat');
 await row.click({ button: 'right' }); await page.getByTestId('chat-context-menu').getByRole('button', { name: 'Переместить в закреплённые', exact: true }).click();
 await expect.poll(() => mock.sessions[0]?.pinned).toBe(true);
 await page.keyboard.press('Control+k'); await page.getByRole('dialog').getByRole('textbox').fill('Renamed');
 await page.getByRole('dialog').getByText('Renamed chat', { exact: true }).click();
 await row.click({ button: 'right' }); await page.getByTestId('chat-context-menu').getByRole('button', { name: 'Удалить чат', exact: true }).click();
 await page.getByTestId('confirm-dialog-confirm-button').click(); await expect.poll(() => mock.sessions.length).toBe(0);

});

test('inline title rename commits and switches to another chat with the same click', async () => {
 await connect();
 await page.getByTestId('sidebar-new-chat').click();
 await page.getByTestId('chat-composer-input').fill('Первый чат');
 await page.getByRole('button', { name: 'Отправить', exact: true }).click();
 await expect(page.getByTestId('acp-assistant-message')).toBeVisible();
 const firstKey = (await page.evaluate(() => window.pincer.chat.snapshot())).selected!;
 await page.getByTestId('sidebar-new-chat').click();
 await page.getByTestId('chat-composer-input').fill('Второй чат');
 await page.getByRole('button', { name: 'Отправить', exact: true }).click();
 await expect(page.getByTestId('acp-assistant-message')).toBeVisible();
 const secondKey = (await page.evaluate(() => window.pincer.chat.snapshot())).selected!;
 await page.getByTestId(`sidebar-session-${firstKey}`).click();
 await page.getByTestId('chat-session-title').click();
 await page.getByTestId('chat-session-title-input').fill('Переименованный первый чат');
 await page.getByTestId(`sidebar-session-${secondKey}`).click();
 await expect.poll(() => page.evaluate(() => window.pincer.chat.snapshot().then(state => state.selected))).toBe(secondKey);
 await expect.poll(() => mock.sessions.find(session => session.key === firstKey)?.label).toBe('Переименованный первый чат');
 await expect(page.getByTestId(`sidebar-session-${secondKey}`)).toHaveClass(/bg-/);
});

test('settings preserve draft, sending shortcut and theme; chat find locates text', async () => {
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  const editor = page.getByTestId('chat-composer-input'); await editor.fill('Keep my draft Gateway Gateway');
  await page.getByTestId('sidebar-nav-settings').click();
  await page.getByTestId('settings-theme-dark').click(); await expect(page.locator('html')).toHaveClass('dark');
  await page.getByTestId('settings-nav-chat').click();
  await chooseSelect(page.locator('#send-shortcut'), 'Ctrl+Enter');
  await page.getByRole('button', { name: 'Вернуться в приложение' }).click();
  await expect(editor).toHaveValue('Keep my draft Gateway Gateway'); await editor.press('Enter');
  expect(mock.responses.filter((item) => item.method === 'chat.send')).toHaveLength(0);
  await editor.press('Control+Enter'); await expect(page.getByTestId('chat-page')).toContainText('Hello from Gateway');
  await page.keyboard.press('Control+f'); await page.getByPlaceholder('Поиск в чате').fill('Gateway');
  await expect(page.getByText('1/3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Следующее совпадение' }).click();
  await expect(page.getByText('2/3', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('sidebar-nav-settings').click();
  await page.screenshot({ path: 'artifacts/pincer-settings-dark.png' });
});

test('agent forms, personality file editing and skill switches use the Gateway', async () => {
 mock.responseDelayMs.set('agents.files.set', 350);

 await connect(); await page.getByTestId('sidebar-nav-agents').click(); await expect(page.getByTestId('agents-page')).toContainText('Assistant');
 await page.getByTestId('agents-add-button').click(); await page.locator('#agent-name').fill('Research'); await page.getByTestId('add-agent-dialog').getByRole('button', { name: 'Сохранить', exact: true }).click();
 await expect(page.getByTestId('agents-page')).toContainText('Research');
 await page.getByTestId('agents-page').getByText('Research', { exact: true }).hover(); await page.getByTestId('agent-settings-test-agent-1').click();
 await expect(page.getByTestId('agent-settings-personality')).toBeEnabled();
 await page.getByTestId('agent-settings-personality').fill('A careful research assistant'); await page.getByTestId('agent-settings-personality-save').click();
 await expect.poll(() => mock.files.get('test-agent-1/SOUL.md')).toBe('A careful research assistant');
 await expect(page.getByTestId('agent-settings-personality')).toBeEnabled();
 await expect(page.getByTestId('agent-settings-personality-save')).toBeDisabled();
 await page.keyboard.press('Escape');
 await expect(page.getByTestId('agent-settings-personality')).not.toBeVisible();
 await page.screenshot({ path: 'artifacts/pincer-agents-light.png' });
 await page.getByTestId('sidebar-nav-skills').click(); await page.getByTestId('skills-grid').getByRole('switch').first().click();
 await expect.poll(() => mock.skills[0].disabled).toBe(true);

});

test('cron creation, enable switch, run and deletion round-trip', async () => {

 await connect(); await page.getByTestId('sidebar-nav-cron').click(); await page.getByTestId('cron-new-task-button').click();
 const editor = page.getByTestId('cron-task-dialog'); await editor.locator('#name').fill('Morning report'); await editor.locator('#message').fill('Prepare a daily report');
 await editor.getByRole('button', { name: /Создать задачу|Сохранить/ }).click();
 await expect(page.getByTestId('cron-page')).toContainText('Morning report');
 const card = page.locator('[data-testid^="cron-job-card-"]').filter({ has: page.getByRole('switch') }).first();
 await card.getByRole('switch').click(); await expect.poll(() => mock.jobs[0]?.enabled).toBe(false); await expect(card.getByRole('switch')).not.toBeChecked();
 await card.hover(); await page.getByRole('button', { name: 'Запустить сейчас' }).click(); await expect.poll(() => mock.responses.filter((item) => item.method === 'cron.run').length).toBe(1);
 await page.screenshot({ path: 'artifacts/pincer-cron-light.png' });
 await card.getByRole('button', { name: /Удалить/ }).click(); await page.getByTestId('confirm-dialog-confirm-button').click(); await expect.poll(() => mock.jobs.length).toBe(0);

});

test('project creates a chat in its actual Gateway workspace', async () => {

 await connect(); await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
 const editor = page.getByRole('dialog'); await editor.getByRole('textbox').first().fill('Research project'); await page.getByTestId('project-path').fill('C:/Research');
 await expect(page.getByTestId('project-path')).toHaveCSS('cursor', 'text');
 expect(await page.getByTestId('project-path').evaluate((element) => getComputedStyle(element).boxShadow)).toContain('2px');
 await editor.getByRole('button', { name: 'Создать', exact: true }).click();
 const project = page.locator('[data-testid^="sidebar-project-"]').filter({ hasText: 'Research project' });
 await project.click({ button: 'right' });
 await page.getByTestId('node-context-menu').getByRole('button', { name: 'Новый чат', exact: true }).click();
 expect(mock.sessions).toHaveLength(0);
 await page.getByTestId('chat-composer-input').fill('Research'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
 await expect.poll(() => mock.sessions[0]?.execCwd).toBe('C:/Research');
 expect(mock.responses.find((item) => item.method === 'sessions.create')?.params).toMatchObject({ cwd: 'C:/Research' });
 await expect(page.getByTestId('chat-page')).toContainText('Research');

});

test('workspace files read, save and preserve remote conflicts', async () => {
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('chat-composer-input').fill('Открой рабочую область'); await page.getByRole('button', { name: 'Отправить', exact: true }).click(); await expect(page.getByTestId('acp-assistant-message')).toBeVisible();
  const workspaceToggle = page.getByTestId('chat-toolbar-workspace');
  await expect(workspaceToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('workspace-open-icon')).toHaveCSS('opacity', '1');
  await workspaceToggle.hover();
  await expect(page.getByRole('tooltip')).toContainText('Рабочая область');
  await workspaceToggle.click();
  await expect(workspaceToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('workspace-close-icon')).toHaveCSS('opacity', '1');
  const animatedPanel = page.getByTestId('workspace-files'); await expect(animatedPanel).toBeVisible();
  await expect(page.getByTestId('chat-page')).toHaveAttribute('data-chat-compact', 'true');
  await expect(page.getByTestId('chat-model-picker-button').locator('.chat-compact-label')).toHaveCSS('display', 'none');
  await expect(page.getByTestId('chat-model-picker-button').locator('.chat-compact-icon')).toHaveCSS('display', 'block');
  const panelSeparator = page.getByRole('separator', { name: 'Ширина панели файлов', exact: true });
  await expect(panelSeparator).toHaveAttribute('aria-valuemax', '100');
  await expect(panelSeparator).toHaveCSS('cursor', 'col-resize');
  await expect(panelSeparator.locator('.pincer-resize-line')).toHaveCSS('width', '1px');
  await expect(page.getByTestId('sidebar-resize-handle').locator('.pincer-resize-line')).toHaveCSS('width', '1px');
  const openingParentWidth = await animatedPanel.evaluate((element) => element.parentElement!.getBoundingClientRect().width);
  await expect.poll(async () => Math.round((await animatedPanel.boundingBox())!.width)).toBe(Math.round(openingParentWidth * 0.45));
  const initialWidth = (await animatedPanel.boundingBox())!.width;
  const initialHandle = (await panelSeparator.boundingBox())!;
  await page.mouse.move(initialHandle.x + initialHandle.width - 1, initialHandle.y + 20); await page.mouse.down();
  await page.mouse.move(initialHandle.x - 35, initialHandle.y + 20); await page.mouse.up();
  const savedPercent = await page.evaluate(() => Number((JSON.parse(localStorage.getItem('pincer.preferences') || '{}') as { workspacePanelWidth?: number }).workspacePanelWidth));
  const panelParentWidth = await animatedPanel.evaluate((element) => element.parentElement!.getBoundingClientRect().width);
  await expect.poll(async () => Math.round((await animatedPanel.boundingBox())!.width)).toBe(Math.round(panelParentWidth * savedPercent / 100));
  let savedWidth = (await animatedPanel.boundingBox())!.width;
  expect(savedWidth).toBeGreaterThan(initialWidth + 20);
  expect(savedPercent).toBeLessThanOrEqual(65);
  const sharedBounds = (await animatedPanel.evaluate((element) => element.parentElement!.getBoundingClientRect().toJSON())) as DOMRect;
  const cappedHandle = (await panelSeparator.boundingBox())!;
  await page.mouse.move(cappedHandle.x + cappedHandle.width - 1, cappedHandle.y + 20); await page.mouse.down();
  await page.mouse.move(sharedBounds.x + sharedBounds.width * 0.2, cappedHandle.y + 20); await page.mouse.up();
  await expect.poll(async () => Math.round((await animatedPanel.boundingBox())!.width)).toBe(Math.round(sharedBounds.width * 0.65));
  savedWidth = (await animatedPanel.boundingBox())!.width;
  const expandedHandle = (await panelSeparator.boundingBox())!;
  await page.mouse.move(expandedHandle.x + expandedHandle.width - 1, expandedHandle.y + 20); await page.mouse.down();
  await page.mouse.move(sharedBounds.x + 1, expandedHandle.y + 20); await page.mouse.up();
  await expect.poll(async () => Math.round((await animatedPanel.boundingBox())!.width)).toBe(Math.round(sharedBounds.width));
  const fullWidthHandle = (await panelSeparator.boundingBox())!;
  await page.mouse.move(fullWidthHandle.x + fullWidthHandle.width - 1, fullWidthHandle.y + 20); await page.mouse.down();
  await page.mouse.move(sharedBounds.x + sharedBounds.width - savedWidth + fullWidthHandle.width - 1, fullWidthHandle.y + 20); await page.mouse.up();
  await expect.poll(async () => Math.abs((await animatedPanel.boundingBox())!.width - savedWidth)).toBeLessThan(8);
  savedWidth = (await animatedPanel.boundingBox())!.width;
  await workspaceToggle.click();
  await expect(animatedPanel).toHaveCount(1);
  await expect(animatedPanel).toHaveCount(0, { timeout: 1000 });
  await expect(workspaceToggle).toHaveAttribute('aria-pressed', 'false');
  await workspaceToggle.click();
  await expect(workspaceToggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Math.round((await page.getByTestId('workspace-files').boundingBox())!.width)).toBe(Math.round(savedWidth));
  const closingHandle = (await page.getByRole('separator', { name: 'Ширина панели файлов', exact: true }).boundingBox())!;
  const mainBounds = (await page.getByTestId('main-content').boundingBox())!;
  await page.mouse.move(closingHandle.x + closingHandle.width - 1, closingHandle.y + 20); await page.mouse.down();
  await page.mouse.move(mainBounds.x + mainBounds.width - 1, closingHandle.y + 20);
  await expect(page.getByTestId('workspace-files')).toHaveAttribute('data-resize-collapsed', 'true');
  await expect(page.getByTestId('workspace-files')).toHaveCount(1);
  await expect.poll(async () => (await page.getByTestId('workspace-files').boundingBox())?.width || 0).toBeLessThan(8);
  await page.mouse.move(closingHandle.x + closingHandle.width - 1, closingHandle.y + 20);
  await expect(page.getByTestId('workspace-files')).toHaveAttribute('data-resize-collapsed', 'false');
  await expect.poll(async () => Math.round((await page.getByTestId('workspace-files').boundingBox())!.width)).toBe(Math.round(savedWidth));
  await page.mouse.up();
  await expect(page.getByTestId('workspace-files')).toHaveCount(1);
  const finalHandle = (await page.getByRole('separator', { name: 'Ширина панели файлов', exact: true }).boundingBox())!;
  await page.mouse.move(finalHandle.x + finalHandle.width - 1, finalHandle.y + 20); await page.mouse.down();
  await page.mouse.move(mainBounds.x + mainBounds.width - 1, finalHandle.y + 20);
  await expect(page.getByTestId('workspace-files')).toHaveAttribute('data-resize-collapsed', 'true');
  await page.mouse.up();
  await expect(page.getByTestId('workspace-files')).toHaveCount(0, { timeout: 1000 });
  await expect(workspaceToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('body')).toHaveCSS('cursor', 'default');
  await workspaceToggle.click();
  await expect(workspaceToggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Math.round((await page.getByTestId('workspace-files').boundingBox())!.width)).toBe(Math.round(savedWidth));
  await page.getByTestId('workspace-files').getByRole('button', { name: /README.md/ }).click();
  await expect(page.getByTestId('file-preview-content')).toHaveCSS('user-select', 'text');
  await page.getByTestId('workspace-files').getByRole('button', { name: 'Редактировать', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'README.md', exact: true });
  await expect(editor).toHaveValue('Original workspace text');
  await editor.fill('Updated from Pincer'); await page.getByTestId('workspace-files').getByRole('button', { name: 'Сохранить' }).click();
  await expect.poll(() => mock.workspaceContent).toBe('Updated from Pincer');
  await expect(page.getByTestId('workspace-files').getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  const panelColor = await page.getByTestId('artifact-panel').evaluate((element) => getComputedStyle(element).backgroundColor);
  const chatColor = await page.getByTestId('chat-page').evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(panelColor).toBe(chatColor);
  const sharedSurface = page.getByTestId('chat-workspace-surface');
  await expect(sharedSurface).toHaveCSS('overflow-x', 'hidden');
  await expect(page.getByTestId('workspace-files')).toHaveCSS('border-left-width', '1px');
  await page.screenshot({ path: 'artifacts/pincer-workspace-files.png' });
  mock.workspaceContent = 'Remote concurrent edit'; await editor.fill('Local second edit');
  await page.getByTestId('workspace-files').getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('workspace-files').getByRole('alert')).toContainText('FILE_SAVE_FAILED');
  expect(mock.workspaceContent).toBe('Remote concurrent edit');
  await workspaceToggle.click();
  await expect(page.getByRole('dialog', { name: 'Отбросить изменения?' })).toBeVisible();
  await page.getByTestId('confirm-dialog-cancel-button').click();
  await expect(page.getByTestId('workspace-files')).toBeVisible();
});

test('attachments are sent as validated content exactly once', async () => {
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('A user-selected attachment') });
  await expect(page.getByTestId('chat-page')).toContainText('notes.txt');
  await page.getByTestId('chat-composer-input').fill('Read this attachment');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => mock.responses.filter((item) => item.method === 'chat.send').length).toBe(1);
  expect(mock.responses.find((item) => item.method === 'chat.send')?.params).toMatchObject({ attachments: [{ fileName: 'notes.txt', mimeType: 'text/plain', content: Buffer.from('A user-selected attachment').toString('base64'), sizeBytes: 26 }] });
});

test('sent image attachments remain visible above the user message', async () => {
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.locator('input[type=file]').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
  await page.getByTestId('chat-composer-input').fill('Image caption');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  const user = page.getByTestId('acp-user-message');
  await expect(user.getByTestId('message-attachment')).toBeVisible();
  await expect(user.getByRole('img', { name: 'pixel.png' })).toBeVisible();
  const attachmentComesFirst = await user.evaluate((element) => {
    const attachment = element.querySelector('[data-testid="message-attachment"]');
    const bubble = element.querySelector('[data-testid="user-message-bubble"]');
    return Boolean(attachment && bubble && (attachment.compareDocumentPosition(bubble) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(attachmentComesFirst).toBe(true);
  await page.screenshot({ path: 'artifacts/pincer-message-attachment.png' });
});

test('long code blocks are collapsed and can be expanded', async () => {
  const key = 'agent:main:pincer:long-code';
  mock.sessions.push({ key, label: 'Long code', agentId: 'main', model: 'test/test-model' });
  mock.histories.set(key, [{ role: 'user', content: 'Show code' }, { role: 'assistant', content: `\`\`\`ts\n${Array.from({ length: 80 }, (_, index) => `const line${index} = ${index};`).join('\n')}\n\`\`\`` }]);
  await connect(); await page.getByTestId(`sidebar-session-${key}`).click();
  const button = page.getByTestId('code-expand'); await expect(button).toHaveText('Развернуть код');
  await button.scrollIntoViewIfNeeded(); await page.screenshot({ path: 'artifacts/pincer-collapsible-code.png' });
  await button.click(); await expect(button).toHaveText('Свернуть код');
});

test('OpenClaw catalog installs an official plugin with its non-empty runtime id', async () => {
  await connect(); await page.getByTestId('sidebar-nav-settings').click(); await page.getByTestId('settings-nav-plugins').click();
  await page.getByRole('textbox', { name: 'Найти установленный плагин или в каталоге' }).fill('github');
  const card = page.getByTestId('plugin-github'); await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Установить', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect.poll(() => (mock.responses.findLast((item) => item.method === 'plugins.install')?.params as Record<string, unknown> | undefined)?.pluginId).toBe('github');
});

test('the client does not impose a ten-file selection limit', async () => {
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.locator('input[type=file]').setInputFiles(Array.from({ length: 11 }, (_, index) => ({ name: `file-${index}.txt`, mimeType: 'text/plain', buffer: Buffer.from('x') })));
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('chat-attachment-preview')).toHaveCount(11);
});

test('text drafts survive restart and are encrypted on disk', async () => {
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  const key = 'new';
  await page.getByTestId('chat-composer-input').fill('PRIVATE_DRAFT_67f112');
  await expect.poll(async () => { const state = await page.evaluate(() => window.pincer.chat.snapshot()); const result = await page.evaluate((scope) => window.pincer.drafts.read(scope), state.scope); return result.ok ? result.value[key] : ''; }).toBe('PRIVATE_DRAFT_67f112');
  expect(readFileSync(join(directory, 'drafts.vault')).includes('PRIVATE_DRAFT_67f112')).toBe(false);
  await application.close(); application = await launchApplication(); page = await application.firstWindow();
  await expect(page.getByTestId('main-layout')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveValue('PRIVATE_DRAFT_67f112');
});

test('provider and embedding forms write guarded settings, never return saved keys', async () => {
  await connect(); await page.getByTestId('sidebar-nav-models').click();
  await page.getByRole('button', { name: 'Добавить провайдера', exact: true }).click();
  const provider = page.getByTestId('add-provider-dialog');
  await page.getByTestId('add-provider-type-custom').click();
  await page.getByTestId('add-provider-name-input').fill('Мой провайдер');
  await page.getByTestId('add-provider-base-url-input').fill('https://provider.example/v1');
  await page.getByTestId('add-provider-api-key-input').fill('PRIVATE_PROVIDER_KEY');
  await page.getByTestId('add-provider-models-input').fill('my-model\nmy-second-model');
  await expect(page.getByTestId('add-provider-model-list')).toContainText('my-second-model');
  await page.getByTestId('add-provider-submit-button').click(); await expect(provider).not.toBeVisible();
  const customCard = page.locator('[data-testid^="provider-card-custom-"]').filter({ hasText: 'Мой провайдер' });
  await expect(customCard).toBeVisible();
  const providers = await page.evaluate(() => window.pincer.configuration.providers());
  expect(JSON.stringify(providers)).not.toContain('PRIVATE_PROVIDER_KEY');
  expect(providers).toMatchObject({ ok: true, value: { providers: [{ models: ['my-model', 'my-second-model'] }] } });
  await customCard.hover(); await customCard.locator('[data-testid^="provider-delete-"]').click();
  await expect(customCard).toHaveCount(0);
  await openMemory();
  await page.getByRole('button', { name: 'Настроить векторный поиск' }).click();
  const memory = page.getByRole('dialog', { name: 'Семантическая память' });
  await memory.getByLabel('Поставщик векторных представлений').fill('openai');
  await memory.getByLabel('Модель векторных представлений').fill('text-embedding-3-small');
  await memory.getByLabel('API-ключ', { exact: true }).fill('PRIVATE_EMBEDDING_KEY');
  await memory.getByRole('button', { name: 'Сохранить на Gateway' }).click();
  await expect(memory).not.toBeVisible();
  const config = await page.evaluate(() => window.pincer.configuration.memory());
  expect(config).toMatchObject({ ok: true, value: { provider: 'openai', model: 'text-embedding-3-small', hasKey: true } });
  expect(JSON.stringify(config)).not.toContain('PRIVATE_EMBEDDING_KEY');
});

test('API catalog loads automatically and provider names remain editable', async () => {
  let catalog = ['gemini-pro-agent', 'gemini-flash', 'claude-sonnet'];
  let expectedKey = 'isolated-test-key';
  const source = createServer((request, response) => {
    expect(request.headers.authorization).toBe(`Bearer ${expectedKey}`);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ data: catalog.map((id) => ({ id })) }));
  });
  await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve));
  try {
    await connect(); await page.getByTestId('sidebar-nav-models').click();
    await page.getByRole('button', { name: 'Добавить провайдера', exact: true }).click();
    await page.getByTestId('add-provider-type-custom').click();
    await expect(page.getByTestId('add-provider-models-input')).toHaveValue('');
    await page.getByTestId('add-provider-name-input').fill('Мои модели');
    await page.getByTestId('add-provider-base-url-input').fill(`http://127.0.0.1:${(source.address() as { port: number }).port}/v1`);
    await page.getByTestId('add-provider-api-key-input').fill('isolated-test-key');
    await expect(page.getByTestId('add-provider-model-list')).toContainText('claude-sonnet');
    await page.getByTestId('add-provider-submit-button').click();
    const card = page.locator('[data-testid^="provider-card-custom-"]');
    await card.hover(); await card.locator('[data-testid^="provider-edit-"]').first().click();
    await card.getByLabel('Отображаемое имя').fill('Рабочий аккаунт');
    await card.locator('[data-testid^="provider-edit-save-"]').click();
    await expect(card).toContainText('Рабочий аккаунт');
    const saved = await page.evaluate(() => window.pincer.configuration.providers());
    expect(saved).toMatchObject({ ok: true, value: { providers: [{ hasKey: true, models: ['gemini-pro-agent', 'gemini-flash', 'claude-sonnet'] }] } });
    catalog = ['replacement-model'];
    await card.hover(); await card.locator('[data-testid^="provider-refresh-models-"]').click();
    await expect(card).toContainText('Моделей: 1');
    const refreshed = await page.evaluate(() => window.pincer.configuration.providers());
    expect(refreshed).toMatchObject({ ok: true, value: { providers: [{ hasKey: true, models: ['replacement-model'] }] } });
    catalog = ['new-key-model', 'new-key-model-2']; expectedKey = 'replacement-key';
    await card.hover(); await card.locator('[data-testid^="provider-edit-"]').first().click();
    await card.locator('[data-testid^="provider-edit-key-input-"]').fill('replacement-key');
    await card.locator('[data-testid^="provider-edit-save-"]').click();
    await expect(card).toContainText('Моделей: 2');
    const rekeyed = await page.evaluate(() => window.pincer.configuration.providers());
    expect(rekeyed).toMatchObject({ ok: true, value: { providers: [{ hasKey: true, models: ['new-key-model', 'new-key-model-2'] }] } });
    await page.screenshot({ path: 'artifacts/pincer-provider-catalog.png' });
  } finally { source.closeAllConnections(); await new Promise<void>(resolve => source.close(() => resolve())); }
});

test('a redacted provider key is requested once and reused from encrypted storage after restart', async () => {
  const server = createServer((request, response) => {
    if (request.headers.authorization !== 'Bearer DISCOVERY_TEST_KEY') { response.writeHead(401).end(); return; }
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data: [{ id: 'fresh-high' }, { id: 'fresh-ultra' }, { id: 'fresh-high' }] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  mock.config = { models: { providers: { custom: { baseUrl: `http://127.0.0.1:${address.port}/v1`, api: 'openai-completions', apiKey: '__OPENCLAW_REDACTED__', models: [{ id: 'old', name: 'Old' }] } } } };
  try {
    await connect(); await page.getByTestId('sidebar-nav-models').click();
    await page.getByTestId('provider-refresh-models-custom').click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Введите API-ключ провайдера');
    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(448);
    expect(Math.abs(box!.x + box!.width / 2 - await page.evaluate(() => innerWidth / 2))).toBeLessThan(1);
    const output = join(process.cwd(), 'artifacts', 'settings-redesign'); mkdirSync(output, { recursive: true });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
      await expect(dialog).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await page.screenshot({ path: join(output, `api-key-dialog-${theme}.png`) });
    }
    await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByTestId('provider-refresh-models-custom').click();
    await dialog.getByLabel('API key', { exact: true }).fill('DISCOVERY_TEST_KEY');
    await dialog.getByRole('button', { name: 'Обновить модели', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(readFileSync(join(directory, 'provider-credentials.vault')).includes(Buffer.from('DISCOVERY_TEST_KEY'))).toBe(false);
    await application.close(); application = await launchApplication(); page = await application.firstWindow();
    await expect(page.getByTestId('sidebar-nav-models')).toBeVisible(); await page.getByTestId('sidebar-nav-models').click();
    await page.getByTestId('provider-refresh-models-custom').click();
    await expect.poll(async () => {
      const result = await page.evaluate(() => window.pincer.configuration.providers());
      return result.ok ? result.value.providers[0]?.models : [];
    }).toEqual(['fresh-high', 'fresh-ultra']);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('pending permissions recover at connection and require an explicit decision', async () => {
  const approval = pendingApproval(); mock.approvals.set(approval.id, approval);
  await connect();
  const approvalButton = page.getByRole('button', { name: 'Разрешения', exact: true });
  await expect(approvalButton).toBeVisible();
  const approvalBox = await approvalButton.boundingBox();
  const composerBox = await page.getByTestId('chat-composer-surface').boundingBox();
  expect(approvalBox!.y + approvalBox!.height).toBeLessThanOrEqual(composerBox!.y);
  expect(Math.abs(approvalBox!.x + approvalBox!.width - composerBox!.x - composerBox!.width)).toBeLessThan(2);
  await page.screenshot({ path: 'artifacts/pincer-pending-permission.png' });
  await approvalButton.click();
  const card = page.getByTestId('approval-card');
  await expect(card).toContainText('node --version');
  expect(mock.responses.filter((item) => item.method === 'approval.resolve')).toHaveLength(0);
  await page.screenshot({ path: 'artifacts/pincer-approval-light.png' });
  await card.getByRole('button', { name: 'Разрешить один раз' }).click();
  await expect(page.getByRole('button', { name: 'Разрешения', exact: true })).not.toBeVisible();
  expect(mock.responses.filter((item) => item.method === 'approval.resolve')).toHaveLength(1);
  expect(JSON.stringify(await page.evaluate(() => window.pincer.approvals.snapshot()))).not.toContain('NEVER_FORWARD');
});

test('standing permissions show the full action scope and a second confirmation', async () => {
  const approval = pendingApproval();
  approval.presentation = { kind: 'plugin', title: 'Send report', description: 'Send a report to a recipient', severity: 'warning', scope: { kind: 'message-send', target: 'user@example.test', recipientCount: 1, audience: 'external' }, allowedDecisions: ['allow-once', 'allow-always', 'deny'] };
  mock.approvals.set(approval.id, approval);
  await connect(); await page.getByRole('button', { name: 'Разрешения', exact: true }).click();
  const card = page.getByTestId('approval-card'); await expect(card).toContainText('user@example.test');
  await card.getByRole('button', { name: 'Разрешать всегда' }).click();
  await expect(card).toContainText('последующих подходящих запросов');
  expect(mock.responses.filter((item) => item.method === 'approval.resolve')).toHaveLength(0);
  await card.getByRole('button', { name: 'Отмена', exact: true }).click();
  await card.getByRole('button', { name: 'Отклонить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Разрешения', exact: true })).not.toBeVisible();
  expect(mock.responses.find((item) => item.method === 'approval.resolve')?.params).toMatchObject({ decision: 'deny', kind: 'plugin' });
});

test('new chats use the selected agent without altering existing conversations', async () => {
  mock.agents.push({ id: 'research', name: 'Research' });
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await expect(page.getByRole('dialog', { name: 'Новый чат', exact: true })).toHaveCount(0);
  expect(mock.sessions).toHaveLength(0);
  await page.getByTestId('chat-header-agent').click(); await page.getByTestId('chat-header-agent-menu').getByRole('button', { name: 'Research', exact: true }).click();
  await expect(page.getByTestId('chat-page')).toContainText('Research');
  await page.getByTestId('chat-composer-input').fill('Start research'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => mock.sessions.length).toBe(1);
  expect(mock.responses.find((item) => item.method === 'sessions.create')?.params).toMatchObject({ agentId: 'research' });
  await expect(page.getByTestId('chat-header-agent')).toBeDisabled();
});

test('each existing chat restores its own model and hides Thinking for unsupported models', async () => {
  mock.models.push({ id: 'plain-model', name: 'Plain Model', provider: 'plain', contextWindow: 64000, reasoning: false });
  const first = 'agent:main:pincer:first-model'; const second = 'agent:main:pincer:second-model';
  mock.sessions.push(
    { key: first, label: 'First model', agentId: 'main', model: 'test/test-model' },
    { key: second, label: 'Second model', agentId: 'main', model: 'plain/plain-model' },
  );
  mock.histories.set(first, []); mock.histories.set(second, []);
  await connect(); await page.getByTestId(`sidebar-session-${second}`).click();
  await expect(page.getByTestId('chat-model-picker-button')).toContainText('Plain Model');
  await expect(page.getByTestId('chat-thinking-picker-button')).toHaveCount(0);
  await page.getByTestId(`sidebar-session-${first}`).click();
  await expect(page.getByTestId('chat-model-picker-button')).toContainText('Test Model');
  await expect(page.getByTestId('chat-thinking-picker-button')).toBeVisible();
});

test('chat model picker stays synchronized with Gateway model changes', async () => {
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  const picker = page.getByTestId('chat-model-picker-button');
  await picker.click();
  const menu = page.getByTestId('chat-model-picker-menu');
  await expect(menu).toContainText('Test Model');

  mock.models.push({ id: 'live-model', name: 'Live Model', provider: 'custom-live', contextWindow: 96000, reasoning: false });
  const saved = await page.evaluate(async () => {
    const snapshot = await window.pincer.configuration.providers();
    if (!snapshot.ok) return snapshot;
    return window.pincer.configuration.saveProvider(snapshot.value.hash, {
      id: 'custom-live', baseUrl: 'https://models.example.test/v1', api: 'openai-completions', models: ['live-model'],
    });
  });
  expect(saved.ok).toBe(true);
  await expect(menu).toContainText('Live Model');

  mock.models.splice(1, 1);
  const removed = await page.evaluate(async () => {
    const snapshot = await window.pincer.configuration.providers();
    if (!snapshot.ok) return snapshot;
    return window.pincer.configuration.deleteProvider(snapshot.value.hash, 'custom-live');
  });
  expect(removed.ok).toBe(true);
  await expect(menu).not.toContainText('Live Model');

  mock.models[0].name = 'Renamed Test Model';
  await picker.click(); await picker.click();
  await expect(menu).toContainText('Renamed Test Model');
  await expect(page.getByTestId('chat-model-picker-refreshing')).toHaveCount(0);
});

test('thinking picker uses only the selected model capabilities reported by Gateway', async () => {
  mock.models[0].thinkingLevels = [{ id: 'off', label: 'Off' }, { id: 'low', label: 'Low' }, { id: 'max', label: 'Max' }];
  mock.models[0].thinkingDefault = 'low';
  mock.models.push({ id: 'claude-sonnet-4-6-max', name: 'claude-sonnet-4-6-max', provider: 'test', contextWindow: 200000, reasoning: true });
  mock.sessionThinkingOptions = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
  const key = 'agent:main:pincer:thinking-capabilities';
  mock.sessions.push({ key, label: 'Thinking capabilities', agentId: 'main', model: 'test/test-model', thinkingLevel: 'ultra' });
  mock.histories.set(key, []);
  await connect(); await page.getByTestId(`sidebar-session-${key}`).click();
  const picker = page.getByTestId('chat-thinking-picker-button');
  await expect(picker).toHaveText('Low');
  await picker.click();
  const menu = page.getByTestId('chat-thinking-picker-menu');
  await expect(menu.getByRole('button')).toHaveCount(3);
  await expect(menu.getByRole('button', { name: 'Off', exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Low', exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Max', exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Ultra', exact: true })).toHaveCount(0);

  await picker.click();
  await page.getByTestId('chat-model-picker-button').click();
  await page.getByTestId('chat-model-picker-menu').getByRole('button', { name: 'Claude Sonnet 4.6', exact: true }).click();
  await expect.poll(() => mock.sessions[0].model).toBe('test/claude-sonnet-4-6-max');
  await expect(page.getByTestId('chat-model-picker-button')).toContainText('Claude Sonnet 4.6');
  await expect(picker).toHaveText('Max');
  await picker.click();
  await expect(page.getByTestId('chat-thinking-picker-menu').getByRole('button')).toHaveCount(1);
});

test('unknown thinking capabilities do not inherit agent defaults and suffix variants stay exact', async () => {
  delete mock.models[0].thinkingLevels;
  mock.agents[0].thinkingOptions = ['off', 'high', 'ultra'];
  mock.models.push(
    { id: 'route/model', name: 'route/model', provider: 'test', reasoning: false, contextWindow: 1000 },
    { id: 'route/model-high', name: 'route/model-high', provider: 'test', reasoning: false, contextWindow: 1000 },
    { id: 'route/model-ultra', name: 'route/model-ultra', provider: 'test', reasoning: false, contextWindow: 1000 },
    { id: 'route/model-high', name: 'route/model-high', provider: 'test', reasoning: false, contextWindow: 1000 },
  );
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('chat-model-picker-button').click();
  const options = page.locator('[data-testid^="chat-model-picker-option-"]');
  await expect(options).toHaveCount(2); await options.first().click();
  await expect(page.getByTestId('chat-thinking-picker-button')).toHaveCount(0);
  await page.getByTestId('chat-model-picker-button').click(); await options.last().click();
  await expect(page.getByTestId('chat-thinking-picker-button')).toContainText('По умолчанию');
  await page.getByTestId('chat-thinking-picker-button').click();
  await expect(page.getByTestId('chat-thinking-picker-menu').getByRole('button')).toHaveText(['High', 'Ultra']);
  await page.getByTestId('chat-thinking-picker-menu').getByRole('button', { name: 'Ultra', exact: true }).click();
  await page.getByTestId('chat-composer-input').fill('Variant test'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => mock.sessions[0]?.model).toBe('test/route/model-ultra');
  for (let i = 0; i < 3; i++) { await page.getByTestId('chat-model-picker-button').click(); await expect(options).toHaveCount(2); await page.getByTestId('chat-model-picker-button').click(); }
});

test('attachment-only messages remain visible after history reload', async () => {
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await expect(page.getByTestId('chat-composer-input')).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles({ name: 'only-file.txt', mimeType: 'text/plain', buffer: Buffer.from('Attachment without text') });
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.locator('article').filter({ hasText: 'only-file.txt' })).toBeVisible();
  await expect(page.locator('article').filter({ hasText: 'Hello from Gateway' })).toBeVisible();
  await page.reload(); await expect(page.getByTestId('main-layout')).toBeVisible(); await page.getByTestId(`sidebar-session-${mock.sessions[0].key}`).click();
  await expect(page.locator('article').filter({ hasText: 'only-file.txt' })).toBeVisible();
});

test('custom agent badges, setting search and donor switches work', async () => {
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await expect(page.getByTestId('chat-composer-input')).toBeEnabled();
  await page.getByTestId('chat-composer-input').fill('Создай чат'); await page.getByRole('button', { name: 'Отправить', exact: true }).click(); await expect(page.getByTestId('acp-assistant-message')).toBeVisible();
  await page.getByTestId('sidebar-nav-settings').click();
  await chooseSelect(page.getByLabel('Подпись агента в списке чатов', { exact: true }), 'Своё имя для каждого агента');
  await page.getByPlaceholder('Assistant').fill('Помощник');
  await page.locator('#settings-dev-mode').click();
  await expect(page.locator('#settings-dev-mode')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('settings-nav-developer')).toBeVisible();
  const search = page.getByTestId('settings-navigation').getByRole('textbox');
  await search.fill('Размер'); await expect(page.getByTestId('settings-search-result-settings-font-size')).toBeVisible();
  await expect(page.getByTestId('settings-nav-about')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sidebar')).toContainText('Помощник');
});

test('original rich message rendering supports code and math without executing HTML', async () => {
  mock.assistantText = '# Example\n\n**Bold** and $x^2$.\n\n```js\nconst answer = 42;\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n<script>window.INJECTED=true</script>\n<img src="https://example.invalid/private" onerror="window.INJECTED=true">';
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('chat-composer-input').fill('Render formatted content'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  const message = page.getByTestId('acp-assistant-message');
  await expect(message.getByRole('heading', { name: 'Example' })).toBeVisible();
  await expect(message.locator('.katex')).toHaveCount(1);
  await expect(message.locator('pre')).toContainText('const answer = 42;');
  await expect(message.getByRole('table')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { INJECTED?: boolean }).INJECTED)).toBeUndefined();
  await expect(message.locator('img')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/pincer-donor/chat-formatted.png' });
});

test('OpenX scroll navigator stays on the left and previews question-answer turns', async () => {
  const key = 'agent:main:pincer:navigator';
  mock.sessions.push({ key, label: 'Длинный разговор', agentId: 'main' });
  mock.histories.set(key, [
    { role: 'user', content: 'Первый вопрос о подключении' }, { role: 'assistant', content: Array.from({ length: 35 }, (_, index) => `Первый ответ о Gateway, строка ${index + 1}.`).join('\n\n') },
    { role: 'user', content: 'Второй вопрос о памяти' }, { role: 'assistant', content: 'Второй ответ о семантическом поиске' },
    { role: 'user', content: 'Третий вопрос об обновлениях' }, { role: 'assistant', content: 'Третий ответ об установщике' },
  ]);
  await connect(); await page.getByTestId(`sidebar-session-${key}`).click();
  const navigator = page.getByTestId('chat-scroll-navigator');
  await expect(navigator).toBeVisible();
  const scroll = await page.getByTestId('chat-scroll-container').boundingBox();
  const bounds = await navigator.boundingBox();
  expect(bounds!.x).toBeLessThan(scroll!.x + 60);
  expect(Math.abs((bounds!.y + bounds!.height / 2) - (scroll!.y + scroll!.height / 2))).toBeLessThan(4);
  const markers = page.getByTestId('chat-scroll-navigator-markers').getByRole('button');
  await expect(markers).toHaveCount(3);
  await markers.nth(1).hover();
  await expect(page.getByTestId('chat-scroll-preview')).toContainText('Второй вопрос о памяти');
  await expect(page.getByTestId('chat-scroll-preview')).toContainText('Второй ответ о семантическом поиске');
  const container = page.getByTestId('chat-scroll-container');
  await container.evaluate((element) => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); });
  const down = page.getByRole('button', { name: 'Вернуться вниз', exact: true });
  await expect(down).toBeVisible();
  await down.click();
  await expect.poll(() => container.evaluate((element) => Math.round(element.scrollHeight - element.scrollTop - element.clientHeight))).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'artifacts/pincer-donor/chat-scroll-navigator.png' });
});

test('channel controls retain direct actions and reject unavailable credential writes', async () => {
  await connect(); await page.getByTestId('sidebar-nav-channels').click();
  await page.getByTestId('channels-page').getByRole('button', { name: 'Редактировать', exact: true }).first().click();
  const form = page.getByTestId('channel-config-dialog'); await expect(form).toBeVisible();
  await expect(form).toContainText('Изменения будут сохранены на Gateway.');
  await form.getByRole('button', { name: 'Остановить канал' }).click();
  await expect.poll(() => mock.responses.some((item) => item.method === 'channels.stop')).toBe(true);
  await expect(form).not.toBeVisible();
});

test('donor model picker and presets use actual session settings; hidden shortcuts stay inactive', async () => {
  mock.agents[0].thinkingOptions = ['off', 'low', 'high'];
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('chat-model-picker-button').click();
  await page.locator('[data-testid^="chat-model-picker-option-"]').first().hover();
  await page.locator('[data-testid^="chat-model-pin-"]').first().click();
  await expect(page.getByTestId('chat-pinned-models')).toContainText('Test Model');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pincer.pinned-models') || '[]'))).toHaveLength(1);
  await page.getByTestId('chat-model-picker-button').click(); await page.getByTestId('chat-model-picker-button').click();
  await expect(page.getByTestId('chat-pinned-models')).toContainText('Test Model');
  await page.locator('[data-testid^="chat-model-picker-option-"]').first().click();
  await page.getByTestId('chat-thinking-picker-button').click();
  await page.getByTestId('chat-thinking-picker-menu').getByRole('button').last().click();
  expect(mock.sessions).toHaveLength(0);
  await page.getByTestId('chat-composer-input').fill('Проверка модели'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => mock.sessions[0]?.model).toBe('test/test-model');
  await expect.poll(() => mock.sessions[0]?.thinkingLevel).toBe('high');
  await page.getByTestId('chat-model-picker-button').click();
  await page.getByTestId('chat-model-picker-menu').getByRole('button', { name: 'Пресет', exact: true }).click();
  await expect(page.getByTestId('chat-model-presets')).toContainText('Test Model');
  await page.screenshot({ path: 'artifacts/pincer-donor/model-picker.png' });
  await page.keyboard.press('Escape'); await page.getByTestId('sidebar-nav-settings').click();
  const before = mock.sessions.length; await page.keyboard.press('Control+n'); await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).not.toBeVisible(); expect(mock.sessions.length).toBe(before);
});

test('tool cards, token footer, quotas and text selection are confined to the content', async () => {
  const key = 'agent:main:inspection';
  mock.sessions.push({ key, label: 'Tools example', agentId: 'main', model: 'test-model', permissionMode: 'full' });
  mock.histories.set(key, [
    { role: 'user', content: 'Проверь инструменты', timestamp: 1000 },
    { role: 'assistant', content: [{ type: 'toolCall', id: 't1', name: 'exec', arguments: { command: 'Get-Process' } }, { type: 'toolCall', id: 't2', name: 'session_status', arguments: { sessionKey: 'current' } }, { type: 'toolCall', id: 't3', name: 'exec', arguments: { command: 'Get-Date' } }], usage: { input: 100, output: 20 } },
    { role: 'toolResult', toolCallId: 't1', content: 'Id ProcessName\n123 electron' },
    { role: 'toolResult', toolCallId: 't2', content: 'Tokens: 52k in / 151 out' },
    { role: 'toolResult', toolCallId: 't3', content: 'Thursday, September 3, 2026' },
    { role: 'assistant', timestamp: 9000, durationMs: 8000, content: 'Инструменты работают. Готово.', usage: { input: 20, output: 151 } },
  ]);
  await connect(); await page.getByTestId(`sidebar-session-${key}`).click();
  const activity = page.getByTestId('activity-stream'); await expect(activity).toContainText('Выполнено команд: 2');
  await expect(page.getByTestId('tool-activity')).toHaveCount(1);
  await expect(page.getByTestId('tool-call')).toHaveCount(3);
  await expect(page.getByTestId('tool-result').first()).not.toBeVisible();
  await page.getByTestId('tool-activity').first().locator(':scope > button').click();
  await expect(page.getByTestId('tool-result').first()).toContainText('123 electron');
  await expect(page.getByTestId('response-stats')).toHaveText('8 с · 171 выходных токенов');
  await page.getByTestId('chat-request-stats-button').click();
  await expect(page.getByTestId('chat-request-stats-button')).toHaveCSS('border-top-width', '1px');
  await expect(page.getByTestId('chat-request-stats-panel')).toContainText('75% осталось');
  await page.screenshot({ path: 'artifacts/pincer-donor/tool-cards-quotas.png' });
  await page.keyboard.press('Escape');
  const text = page.getByTestId('acp-assistant-message').getByText('Инструменты работают. Готово.', { exact: true });
  await expect(text).toHaveCSS('user-select', 'text');
  await text.hover(); await expect(text).toHaveCSS('cursor', 'text');
  await expect(page.getByTestId('chat-composer-input')).toHaveCSS('cursor', 'text');
  await expect(page.getByTestId('sidebar-resize-handle')).toHaveCSS('cursor', 'col-resize');
  await expect(page.getByTestId('sidebar-new-chat')).toHaveCSS('cursor', 'default');
  await text.dblclick();
  const selectedText = await page.evaluate(() => window.getSelection()?.toString());
  expect(selectedText).not.toBe('');
  await page.keyboard.press('Control+c');
  expect((await application.evaluate(({ clipboard }) => clipboard.readText())).trim()).toBe(selectedText?.trim());
  await expect(page.getByTestId('sidebar-new-chat')).toHaveCSS('user-select', 'none');
});

test('many live tool calls keep their own layout when the activity is expanded', async () => {
  mock.holdRun = true; mock.deltaDelayMs = 60000;
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('chat-composer-input').fill('Запусти много инструментов');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  const state = await page.evaluate(() => window.pincer.chat.snapshot());
  const key = state.selected!; const runId = state.activeRun!;
  for (let index = 0; index < 4; index += 1) {
    mock.broadcast('agent', { sessionKey: key, runId, stream: 'tool', data: { toolCallId: `live-tool-${index}`, name: index % 2 ? 'session_status' : 'exec', phase: 'start', args: index % 2 ? { sessionKey: `agent-${index}` } : { command: `Get-Item item-${index}` } } });
  }
  const activity = page.getByTestId('tool-activity');
  await expect(activity).toHaveAttribute('data-live', 'true');
  await expect(page.getByTestId('tool-call')).toHaveCount(4);
  await activity.locator(':scope > button').click();
  for (let index = 4; index < 12; index += 1) {
    mock.broadcast('agent', { sessionKey: key, runId, stream: 'tool', data: { toolCallId: `live-tool-${index}`, name: index % 2 ? 'session_status' : 'exec', phase: 'start', args: index % 2 ? { sessionKey: `agent-${index}` } : { command: `Get-Item item-${index}` } } });
  }
  await expect(page.getByTestId('tool-call')).toHaveCount(12);
  await expect(page.locator('[data-tool-status="running"]')).toHaveCount(12);
  mock.broadcast('agent', { sessionKey: key, runId, stream: 'tool', data: { toolCallId: 'live-tool-0', name: 'exec', phase: 'end', result: 'ok' } });
  mock.broadcast('agent', { sessionKey: key, runId, stream: 'tool', data: { toolCallId: 'live-tool-1', name: 'session_status', phase: 'end', isError: true, result: 'failed' } });
  await expect(page.locator('[data-tool-status="completed"]')).toHaveCount(1);
  await expect(page.locator('[data-tool-status="failed"]')).toHaveCount(1);
  await page.getByTestId('tool-call').nth(0).locator(':scope > button').click();
  await page.getByTestId('tool-call').nth(1).locator(':scope > button').click();
  await expect(page.getByTestId('tool-call').first().locator('pre').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const rows = page.getByTestId('tool-call').locator(':scope > button');
  const boxes = await rows.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
  for (let index = 1; index < boxes.length; index += 1) expect(boxes[index].top).toBeGreaterThanOrEqual(boxes[index - 1].bottom);
  await page.screenshot({ path: 'artifacts/pincer-donor/live-tool-layout.png' });
});

test('one live thinking indicator and permission choices change Gateway policy', async () => {
  mock.holdRun = true; await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('chat-access-button').click(); await page.getByTestId('chat-access-read-only').click();
  expect(mock.sessions).toHaveLength(0);
  await expect(page.getByTestId('chat-access-button')).toHaveAttribute('aria-label', 'Только чтение');
  await page.getByTestId('chat-access-button').click(); await page.screenshot({ path: 'artifacts/pincer-donor/permissions.png' }); await page.keyboard.press('Escape');
  await page.getByTestId('chat-composer-input').fill('Подумай'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => mock.sessions[0]?.permissionMode).toBe('read-only');
  await expect(page.getByTestId('chat-run-status')).toHaveCount(1);
  await expect(page.getByTestId('chat-run-status')).toContainText(/\d+ с/);
  await expect(page.getByTestId('chat-composer-working-indicator')).toHaveCount(0);
  await expect(page.getByTestId('chat-access-button')).toBeDisabled();
});

test('a running chat stays marked while another session is selected', async () => {
  mock.holdRun = true; mock.deltaDelayMs = 60000; await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('chat-composer-input').fill('Работай в фоне'); await page.getByRole('button', { name: 'Отправить', exact: true }).click(); await expect.poll(() => mock.sessions.length).toBe(1); const running = mock.sessions[0].key;
  await expect(page.getByTestId(`sidebar-session-${running}`)).toContainText('В работе');
  await page.getByTestId('sidebar-new-chat').click(); expect(mock.sessions).toHaveLength(1);
  await expect(page.getByTestId(`sidebar-session-${running}`)).toContainText('В работе');
  await page.getByTestId('chat-composer-input').fill('Другой чат'); await page.getByRole('button', { name: 'Отправить', exact: true }).click(); await expect.poll(() => mock.sessions.length).toBe(2);
  await page.screenshot({ path: 'artifacts/pincer-donor/background-run-other-chat.png' });
  await page.getByTestId(`sidebar-session-${running}`).click(); await expect(page.getByTestId('chat-run-status')).toBeVisible();
  await page.screenshot({ path: 'artifacts/pincer-donor/background-run.png' });
  const other = page.getByTestId(`sidebar-session-${mock.sessions[1].key}`);
  await other.click(); await expect(other).toHaveAttribute('aria-current', 'page');
  const runId = mock.activeRuns.get(running)!;
  mock.activeRuns.delete(running); mock.broadcast('chat', { sessionKey: running, runId, seq: 2, state: 'final' });
  await expect.poll(async () => (await page.evaluate(() => window.pincer.chat.snapshot())).sessions.find((session) => session.key === running)?.activeRunId).toBeUndefined();
  await expect(page.getByTestId(`sidebar-session-${running}`)).not.toContainText('В работе');
});

test('an existing chat locks its agent; Russian creation and task listing work', async () => {
  mock.agents.push({ id: 'researcher', name: 'Исследователь' });
  mock.tasks.push({ id: 'subtask-1', title: 'Анализ проекта', status: 'running', runtime: 'subagent', agentId: 'researcher' });
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('chat-composer-input').fill('Родительский чат'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => mock.sessions.length).toBe(1);
  await expect(page.getByTestId('acp-assistant-message')).toBeVisible();
  await expect(page.getByTestId('chat-header-agent')).toBeDisabled();
  await expect(page.getByTestId('chat-header-agent-menu')).toHaveCount(0);
  await expect(page.getByTestId('chat-composer-agent')).toHaveCount(0);
  await page.getByTestId('sidebar-nav-agents').click(); await expect(page.getByTestId('subagent-task-card')).toContainText('Анализ проекта');
  await page.getByTestId('subagent-task-card').getByRole('button', { name: 'Остановить', exact: true }).click();
  await expect.poll(() => mock.tasks[0].status).toBe('cancelled');
  await page.getByRole('button', { name: 'Добавить агента', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.locator('input').first().fill('Русский помощник');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect.poll(() => mock.agents.some((a) => a.name === 'Русский помощник')).toBe(true);
  await page.screenshot({ path: 'artifacts/pincer-donor/agents-russian.png' });
});

test('usage page displays model-attributed totals and native project directory choice', async () => {
  mock.usageData = { sessions: [{ key: 'usage-test', agentId: 'main', usage: { lastActivity: Date.now(), modelUsage: [{ model: 'gpt-5.6-sol-high', provider: 'codex', totals: { input: 1000, output: 151, cacheRead: 400, cacheWrite: 0, totalTokens: 1551, totalCost: 0, missingCostEntries: 0 } }] } }] };
  await connect(); await page.getByTestId('sidebar-nav-models').click();
  await expect(page.getByTestId('token-usage-entry')).toContainText('GPT 5.6 Sol');
  await expect(page.getByTestId('token-usage-entry')).toContainText('151');
  await page.screenshot({ path: 'artifacts/pincer-donor/model-token-usage.png' });
  await application.evaluate(({ dialog }) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: ['C:/MockWorkspace'] })) as typeof dialog.showOpenDialog; });
  await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
  const form = page.getByRole('dialog'); await form.locator('input').first().fill('Русский проект');
  await form.getByRole('button', { name: 'Обзор', exact: true }).click();
  await expect(page.getByTestId('project-path')).toHaveValue('C:/MockWorkspace');
  await form.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.pincer.chat.snapshot())).projects.some((p) => p.name === 'Русский проект')).toBe(true);
  expect(mock.responses.some((item) => String(item.method).startsWith('projects.'))).toBe(false);
});

test('friendly model names and Thinking variants retain exact provider model identities', async () => {
  mock.models.splice(0, mock.models.length,
    { id: 'agy/agy/gemini-3.7-flash-low', name: 'agy/agy/gemini-3.7-flash-low', provider: 'custom', contextWindow: 1000000, reasoning: true },
    { id: 'agy/agy/gemini-3.7-flash-high', name: 'agy/agy/gemini-3.7-flash-high', provider: 'custom', contextWindow: 1000000, reasoning: true },
    { id: 'agy/agy/gemini-3.7-flash-high', name: 'agy/agy/gemini-3.7-flash-high', provider: 'another', contextWindow: 1000000, reasoning: true },
  );
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('chat-model-picker-button').click();
  const options = page.locator('[data-testid^="chat-model-picker-option-"]');
  await expect(options).toHaveCount(2); await expect(options.first()).toContainText('Gemini 3.7 Flash');
  await options.first().click();
  expect(mock.sessions).toHaveLength(0);
  await page.getByTestId('chat-thinking-picker-button').click();
  await page.getByTestId('chat-thinking-picker-menu').getByRole('button', { name: 'High', exact: true }).click();
  await page.getByTestId('chat-composer-input').fill('Проверка модели'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => mock.sessions[0].model).toBe('custom/agy/agy/gemini-3.7-flash-high');
  await expect(page.getByTestId('chat-model-picker-button')).toContainText('Gemini 3.7 Flash');
  await expect(page.getByTestId('chat-thinking-picker-button')).toContainText('High');
  await page.keyboard.press('Control+,'); await page.getByTestId('settings-theme-dark').click(); await page.getByRole('button', { name: 'Вернуться в приложение' }).click();
  await page.getByTestId('chat-model-picker-button').click();
  await page.screenshot({ path: 'artifacts/pincer-donor/model-names-thinking-dark.png' });
});
