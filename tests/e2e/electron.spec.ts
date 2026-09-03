import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
test('settings share the main sidebar width and bounded chat surface; preferences really apply', async () => {
  await connect();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 850));
  const sidebar = await page.getByTestId('sidebar-layout-slot').boundingBox();
  await page.keyboard.press('Control+,');
  await expect(page.getByTestId('settings-navigation')).toHaveCSS('width', `${sidebar!.width}px`);
  const content = page.getByTestId('settings-content'); await expect(content).toHaveCSS('border-top-left-radius', '16px');
  const bounds = await content.boundingBox(); expect(bounds!.x).toBe(sidebar!.width); expect(bounds!.height).toBeLessThanOrEqual(810);
  await page.getByTestId('settings-theme-light').click();
  await expect(page.getByTestId('settings-theme-light')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'artifacts/pincer-donor/settings-new-light.png' });
  await page.getByTestId('settings-theme-dark').click();
  await page.getByLabel('Шрифт чата', { exact: true }).selectOption('serif');
  await page.getByRole('button', { name: 'Фиолетовый', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent-color', 'violet');
  await expect(page.locator('html')).toHaveAttribute('data-chat-font', 'serif');
  await page.screenshot({ path: 'artifacts/pincer-donor/settings-new-dark.png' });
  await page.getByLabel('Ширина сообщений', { exact: true }).fill('1008');
  await page.getByRole('switch', { name: 'Сворачивать ход работы', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.getByTestId('chat-composer').evaluate(el => getComputedStyle(el).maxWidth)).toBe('1040px');
  await page.keyboard.press('Control+,');
  await expect(page.getByRole('switch', { name: 'Сворачивать ход работы', exact: true })).toHaveAttribute('aria-checked', 'true');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 620));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/pincer-donor/settings-minimum.png' });
});
test('complete Gateway settings are edited inside Pincer with profile, devices and logs', async () => {
  mock.config = { ...mock.config, ui: { enabled: false } };
  await connect(); await page.keyboard.press('Control+,');
  await expect(page.getByTestId('settings-content').locator('header')).toHaveCount(0);
  await expect(page.getByTestId('gateway-settings-root')).toHaveValue('ui');
  await page.getByLabel('ui.enabled', { exact: true }).selectOption('true');
  await page.getByRole('button', { name: 'Сохранить на Gateway', exact: true }).click();
  await page.getByRole('button', { name: 'Применить изменения', exact: true }).click();
  await expect.poll(() => (mock.config.ui as { enabled?: boolean }).enabled).toBe(true);
  await page.getByTestId('settings-nav-profile').click(); await expect(page.getByRole('textbox', { name: 'Отображаемое имя' })).toHaveValue('Test User');
  await page.getByTestId('settings-nav-devices').click(); await expect(page.getByText('Связанные устройства · 0')).toBeVisible();
  await page.getByTestId('settings-nav-logs').click(); await expect(page.getByText('Gateway ready')).toBeVisible();
  await page.getByTestId('settings-nav-advanced').click(); await expect(page.getByTestId('gateway-settings-root').locator('option')).toHaveCount(3);
  await page.screenshot({ path: 'artifacts/pincer-donor/settings-complete-schema.png' });
});
test('connection settings use one surface and separate connection from Gateway configuration', async () => {
  await connect(); await page.keyboard.press('Control+,'); await page.getByTestId('settings-nav-gateway').click();
  await expect(page.getByRole('tab', { name: 'Подключение', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('connection-status')).toBeVisible(); await expect(page.getByTestId('gateway-settings-root')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/pincer-donor/settings-connection.png' });
  await page.getByRole('tab', { name: 'Параметры Gateway', exact: true }).click();
  await expect(page.getByTestId('gateway-settings-root')).toHaveValue('gateway');
  await expect(page.getByTestId('connection-status')).toHaveCount(0);
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
    const form = page.getByTestId('quota-source-form'); await form.getByLabel('Адрес OmniRoute').fill(`http://127.0.0.1:${address.port}`); await form.getByLabel('Management token').fill('QUOTA_TEST_SECRET');
    await form.getByRole('button', { name: 'Проверить и сохранить' }).click();
    await expect(form.getByRole('status')).toContainText('Подключение проверено'); await expect(form.getByLabel('Management token')).toHaveValue('');
    await expect(page.getByTestId('provider-quotas')).toContainText('64% осталось'); await expect(page.getByTestId('provider-quotas')).toContainText('Test account');
    expect(calls).toBeGreaterThanOrEqual(4); expect(readFileSync(join(directory, 'quota-sources.vault')).toString()).not.toContain('QUOTA_TEST_SECRET');
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('QUOTA_TEST_SECRET');
    expect(JSON.stringify(await page.evaluate(() => window.pincer.management.quotas()))).not.toContain('MUST_NOT_REACH_UI');
    await page.screenshot({ path: 'artifacts/pincer-donor/settings-provider-limits.png' });
    await page.keyboard.press('Escape'); await page.getByTestId('chat-request-stats-button').click(); await expect(page.getByTestId('chat-request-stats-panel')).toContainText('64% осталось');
  } finally { source.closeAllConnections(); await new Promise<void>(resolve => source.close(() => resolve())); }
});
test('provider quotas recheck an asynchronous Gateway refresh instead of claiming no limits', async () => {
  mock.quotaData = { providers: [], refreshing: true, updatedAt: Date.now() };
  await connect(); await page.getByTestId('chat-request-stats-button').click();
  await expect(page.getByTestId('chat-request-stats-panel')).toContainText('Gateway запрашивает свежие лимиты');
  mock.quotaData = { providers: [{ provider: 'test', windows: [{ label: '5h', usedPercent: 40, resetAt: Date.now() + 50000 }] }] };
  await expect(page.getByTestId('chat-request-stats-panel')).toContainText('60% осталось', { timeout: 10000 });
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
  await expect(page.getByTestId('setup-page')).toBeVisible();
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
  expect(boundary).toEqual({ require: 'undefined', process: 'undefined', api: ['approvals', 'chat', 'configuration', 'desktop', 'drafts', 'files', 'gateway', 'gatewayAdmin', 'management', 'memory', 'platform', 'settings', 'updates', 'window'] });
  await page.screenshot({ path: 'artifacts/pincer-connection-light.png' });
  await page.keyboard.press('Control+,'); await page.getByTestId('settings-theme-dark').click(); await page.getByRole('button', { name: 'Вернуться в приложение' }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.screenshot({ path: 'artifacts/pincer-connection-dark.png' });
  await expect(page.getByRole('heading', { name: 'Чем могу помочь?' })).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeDisabled();
  await page.screenshot({ path: 'artifacts/pincer-shell-dark.png' });
  await page.getByRole('button', { name: 'Скрыть боковую панель' }).click();
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
 const handle = page.getByTestId('sidebar-resize-handle'); await handle.focus(); await page.keyboard.press('ArrowRight');
 await expect.poll(() => page.getByTestId('sidebar-layout-slot').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(330);
 const key = (await page.evaluate(() => window.pincer.chat.snapshot())).selected!;
 const row = page.getByTestId(`sidebar-session-${key}`);
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

test('settings preserve draft, sending shortcut and theme; chat find locates text', async () => {
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  const editor = page.getByTestId('chat-composer-input'); await editor.fill('Keep my draft');
  await page.getByTestId('sidebar-nav-settings').click();
  await page.getByTestId('settings-theme-dark').click(); await expect(page.locator('html')).toHaveClass('dark');
  await page.locator('#send-shortcut').selectOption('ctrl-enter');
  await page.getByRole('button', { name: 'Вернуться в приложение' }).click();
  await expect(editor).toHaveValue('Keep my draft'); await editor.press('Enter');
  expect(mock.responses.filter((item) => item.method === 'chat.send')).toHaveLength(0);
  await editor.press('Control+Enter'); await expect(page.getByTestId('chat-page')).toContainText('Hello from Gateway');
  await page.keyboard.press('Control+f'); await page.getByPlaceholder('Поиск в чате').fill('Gateway');
  await expect(page.getByText('1/1', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('sidebar-nav-settings').click();
  await page.screenshot({ path: 'artifacts/pincer-settings-dark.png' });
});

test('agent forms, personality file editing and skill switches use the Gateway', async () => {

 await connect(); await page.getByTestId('sidebar-nav-agents').click(); await expect(page.getByTestId('agents-page')).toContainText('Assistant');
 await page.getByTestId('agents-add-button').click(); await page.locator('#agent-name').fill('Research'); await page.getByTestId('add-agent-dialog').getByRole('button', { name: 'Сохранить', exact: true }).click();
 await expect(page.getByTestId('agents-page')).toContainText('Research');
 await page.getByTestId('agents-page').getByText('Research', { exact: true }).hover(); await page.getByTestId('agent-settings-test-agent-1').click();
 await expect(page.getByTestId('agent-settings-personality')).toBeEnabled();
 await page.getByTestId('agent-settings-personality').fill('A careful research assistant'); await page.getByTestId('agent-settings-personality-save').click();
 await expect.poll(() => mock.files.get('test-agent-1/SOUL.md')).toBe('A careful research assistant');
 await page.keyboard.press('Escape'); await page.screenshot({ path: 'artifacts/pincer-agents-light.png' });
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
 await editor.getByRole('button', { name: 'Создать', exact: true }).click();
 await page.getByTestId('sidebar-project-project-0').click({ button: 'right' });
 await page.getByTestId('node-context-menu').getByRole('button', { name: 'Новый чат', exact: true }).click();
 await expect.poll(() => mock.sessions[0]?.execCwd).toBe('C:/Research');
 expect(mock.responses.find((item) => item.method === 'sessions.create')?.params).toMatchObject({ projectId: 'project-0' });
 await expect(page.getByTestId('chat-page')).toContainText('Research');

});

test('workspace files read, save and preserve remote conflicts', async () => {
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByRole('button', { name: 'Рабочая область', exact: true }).click();
  await page.getByTestId('workspace-files').getByRole('button', { name: /README.md/ }).click();
  await expect(page.getByTestId('file-preview-content')).toHaveCSS('user-select', 'text');
  await page.getByTestId('workspace-files').getByRole('button', { name: 'Редактировать', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'README.md', exact: true });
  await expect(editor).toHaveValue('Original workspace text');
  await editor.fill('Updated from Pincer'); await page.getByTestId('workspace-files').getByRole('button', { name: 'Сохранить' }).click();
  await expect.poll(() => mock.workspaceContent).toBe('Updated from Pincer');
  await expect(page.getByTestId('workspace-files').getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  mock.workspaceContent = 'Remote concurrent edit'; await editor.fill('Local second edit');
  await page.getByTestId('workspace-files').getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('workspace-files').getByRole('alert')).toContainText('FILE_SAVE_FAILED');
  expect(mock.workspaceContent).toBe('Remote concurrent edit');
  await page.screenshot({ path: 'artifacts/pincer-workspace-files.png' });
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

test('text drafts survive restart and are encrypted on disk', async () => {
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  const key = (await page.evaluate(() => window.pincer.chat.snapshot())).selected!;
  await page.getByTestId('chat-composer-input').fill('PRIVATE_DRAFT_67f112');
  await expect.poll(async () => { const state = await page.evaluate(() => window.pincer.chat.snapshot()); const result = await page.evaluate((scope) => window.pincer.drafts.read(scope), state.scope); return result.ok ? result.value[key] : ''; }).toBe('PRIVATE_DRAFT_67f112');
  expect(readFileSync(join(directory, 'drafts.vault')).includes('PRIVATE_DRAFT_67f112')).toBe(false);
  await application.close(); application = await launchApplication(); page = await application.firstWindow();
  await expect(page.getByTestId('main-layout')).toBeVisible();
  await page.getByTestId(`sidebar-session-${key}`).click();
  await expect(page.getByTestId('chat-composer-input')).toHaveValue('PRIVATE_DRAFT_67f112');
});

test('provider and embedding forms write guarded settings, never return saved keys', async () => {
  await connect(); await page.getByTestId('sidebar-nav-models').click();
  await page.getByRole('button', { name: 'Добавить провайдера', exact: true }).click();
  const provider = page.getByTestId('add-provider-dialog');
  await page.getByTestId('add-provider-type-custom').click();
  await page.getByTestId('add-provider-base-url-input').fill('https://provider.example/v1');
  await page.getByTestId('add-provider-api-key-input').fill('PRIVATE_PROVIDER_KEY');
  await page.getByTestId('add-provider-models-input').fill('my-model');
  await page.getByTestId('add-provider-submit-button').click(); await expect(provider).not.toBeVisible();
  const providers = await page.evaluate(() => window.pincer.configuration.providers());
  expect(JSON.stringify(providers)).not.toContain('PRIVATE_PROVIDER_KEY');
  await openMemory();
  await page.getByRole('button', { name: 'Настроить embeddings' }).click();
  const memory = page.getByRole('dialog', { name: 'Семантическая память' });
  await memory.getByLabel('Провайдер embeddings').fill('openai');
  await memory.getByLabel('Модель embeddings').fill('text-embedding-3-small');
  await memory.getByLabel('API key', { exact: true }).fill('PRIVATE_EMBEDDING_KEY');
  await memory.getByRole('button', { name: 'Сохранить на Gateway' }).click();
  await expect(memory).not.toBeVisible();
  const config = await page.evaluate(() => window.pincer.configuration.memory());
  expect(config).toMatchObject({ ok: true, value: { provider: 'openai', model: 'text-embedding-3-small', hasKey: true } });
  expect(JSON.stringify(config)).not.toContain('PRIVATE_EMBEDDING_KEY');
});

test('pending permissions recover at connection and require an explicit decision', async () => {
  const approval = pendingApproval(); mock.approvals.set(approval.id, approval);
  await connect(); await page.getByRole('button', { name: 'Разрешения', exact: true }).click();
  const card = page.getByTestId('approval-card');
  await expect(card).toContainText('node --version');
  expect(mock.responses.filter((item) => item.method === 'approval.resolve')).toHaveLength(0);
  await page.screenshot({ path: 'artifacts/pincer-approval-light.png' });
  await card.getByRole('button', { name: 'Разрешить один раз' }).click();
  await expect(card).toContainText('Разрешено');
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
  await expect(card).toContainText('Отклонено');
  expect(mock.responses.find((item) => item.method === 'approval.resolve')?.params).toMatchObject({ decision: 'deny', kind: 'plugin' });
});

test('new chats use the selected agent without altering existing conversations', async () => {
  mock.agents.push({ id: 'research', name: 'Research' });
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  const form = page.getByRole('dialog', { name: 'Новый чат', exact: true });
  await form.getByLabel('Агент нового чата').selectOption('research');
  await form.getByRole('button', { name: 'Создать чат' }).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByTestId('chat-page')).toContainText('Research');
  expect(mock.responses.find((item) => item.method === 'sessions.create')?.params).toMatchObject({ agentId: 'research' });
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
  await page.getByTestId('sidebar-nav-settings').click();
  await page.getByLabel('Подпись агента в списке чатов', { exact: true }).selectOption('custom');
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
    { role: 'user', content: 'Первый вопрос о подключении' }, { role: 'assistant', content: 'Первый ответ о Gateway' },
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
  await page.screenshot({ path: 'artifacts/pincer-donor/chat-scroll-navigator.png' });
});

test('channel controls retain direct actions and reject unavailable credential writes', async () => {
  await connect(); await page.getByTestId('sidebar-nav-channels').click();
  await page.getByTestId('channels-page').getByRole('button', { name: 'Редактировать', exact: true }).first().click();
  const form = page.getByTestId('channel-config-dialog'); await expect(form).toBeVisible();
  await expect(form).toContainText('Настройка и привязка каналов пока недоступны');
  await form.getByRole('button', { name: 'Остановить канал' }).click();
  await expect.poll(() => mock.responses.some((item) => item.method === 'channels.stop')).toBe(true);
  await expect(form).not.toBeVisible();
});

test('donor model picker and presets use actual session settings; hidden shortcuts stay inactive', async () => {
  mock.agents[0].thinkingOptions = ['off', 'low', 'high'];
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('chat-model-picker-button').click();
  await page.locator('[data-testid^="chat-model-picker-option-"]').first().click();
  await expect.poll(() => mock.sessions[0]?.model).toBe('test/test-model');
  await page.getByTestId('chat-thinking-picker-button').click();
  await page.getByTestId('chat-thinking-picker-menu').getByRole('button').last().click();
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
  await page.getByTestId('tool-activity').first().locator(':scope > summary').click();
  await expect(page.getByTestId('tool-result').first()).toContainText('123 electron');
  await expect(page.getByTestId('response-stats')).toHaveText('8 с · 171 выходных токенов');
  await page.getByTestId('chat-request-stats-button').click();
  await expect(page.getByTestId('chat-request-stats-panel')).toContainText('75% осталось');
  await page.screenshot({ path: 'artifacts/pincer-donor/tool-cards-quotas.png' });
  await page.keyboard.press('Escape');
  const text = page.getByTestId('acp-assistant-message').getByText('Инструменты работают. Готово.', { exact: true });
  await expect(text).toHaveCSS('user-select', 'text');
  await text.hover(); await expect(text).toHaveCSS('cursor', 'default');
  await expect(page.getByTestId('chat-composer-input')).toHaveCSS('cursor', 'default');
  await expect(page.getByTestId('sidebar-new-chat')).toHaveCSS('cursor', 'default');
  await text.dblclick();
  const selectedText = await page.evaluate(() => window.getSelection()?.toString());
  expect(selectedText).not.toBe('');
  await page.keyboard.press('Control+c');
  expect((await application.evaluate(({ clipboard }) => clipboard.readText())).trim()).toBe(selectedText?.trim());
  await expect(page.getByTestId('sidebar-new-chat')).toHaveCSS('user-select', 'none');
});

test('one live thinking indicator and permission choices change Gateway policy', async () => {
  mock.holdRun = true; await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('chat-access-button').click(); await page.getByTestId('chat-access-read-only').click();
  await expect.poll(() => mock.sessions[0]?.permissionMode).toBe('read-only');
  await expect(page.getByTestId('chat-access-button')).toHaveAttribute('aria-label', 'Только чтение');
  await page.getByTestId('chat-access-button').click(); await page.screenshot({ path: 'artifacts/pincer-donor/permissions.png' }); await page.keyboard.press('Escape');
  await page.getByTestId('chat-composer-input').fill('Подумай'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByTestId('chat-run-status')).toHaveCount(1);
  await expect(page.getByTestId('chat-run-status')).toContainText(/\d+ с/);
  await expect(page.getByTestId('chat-composer-working-indicator')).toHaveCount(0);
  await expect(page.getByTestId('chat-access-button')).toBeDisabled();
});

test('a running chat stays marked while another session is selected', async () => {
  mock.holdRun = true; mock.deltaDelayMs = 60000; await connect(); await page.getByTestId('sidebar-new-chat').click();
  const running = mock.sessions[0].key; await page.getByTestId('chat-composer-input').fill('Работай в фоне'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByTestId(`sidebar-session-${running}`)).toContainText('В работе');
  await page.getByTestId('sidebar-new-chat').click(); await expect.poll(() => mock.sessions.length).toBe(2);
  await expect(page.getByTestId(`sidebar-session-${running}`)).toContainText('В работе');
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

test('agent picker dispatches the chosen profile; Russian creation and task listing work', async () => {
  mock.agents.push({ id: 'researcher', name: 'Исследователь' });
  mock.tasks.push({ id: 'subtask-1', title: 'Анализ проекта', status: 'running', runtime: 'subagent', agentId: 'researcher' });
  await connect(); await page.getByTestId('sidebar-new-chat').click();
  await page.getByRole('dialog', { name: 'Новый чат', exact: true }).getByRole('button', { name: 'Создать чат' }).click();
  await expect.poll(() => mock.sessions.length).toBe(1);
  const parent = mock.sessions[0].key;
  await page.getByTestId('chat-header-agent').click(); await page.screenshot({ path: 'artifacts/pincer-donor/header-agent-picker.png' }); await page.getByTestId('chat-header-agent-menu').getByRole('button', { name: 'Исследователь', exact: true }).click();
  await expect(page.getByTestId('chat-header-agent')).toContainText('Исследователь');
  await expect(page.getByTestId('chat-composer-agent')).toHaveCount(0);
  await page.getByTestId('chat-composer-input').fill('Найди решение'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => mock.sessions.length).toBe(2);
  expect(mock.responses.findLast((r) => r.method === 'sessions.create')?.params).toMatchObject({ parentSessionKey: parent, agentId: 'researcher', message: 'Найди решение' });
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
  await expect.poll(() => mock.projects.some((p) => p.displayName === 'Русский проект')).toBe(true);
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
  await expect(options).toHaveCount(2); await expect(options.first()).toHaveText('Gemini 3.7 Flash');
  await options.first().click();
  await expect.poll(() => mock.sessions[0].model).toBe('custom/agy/agy/gemini-3.7-flash-low');
  await page.getByTestId('chat-thinking-picker-button').click();
  await page.getByTestId('chat-thinking-picker-menu').getByRole('button', { name: 'High', exact: true }).click();
  await expect.poll(() => mock.sessions[0].model).toBe('custom/agy/agy/gemini-3.7-flash-high');
  await expect(page.getByTestId('chat-model-picker-button')).toContainText('Gemini 3.7 Flash');
  await expect(page.getByTestId('chat-thinking-picker-button')).toContainText('High');
  await page.keyboard.press('Control+,'); await page.getByTestId('settings-theme-dark').click(); await page.getByRole('button', { name: 'Вернуться в приложение' }).click();
  await page.getByTestId('chat-model-picker-button').click();
  await page.screenshot({ path: 'artifacts/pincer-donor/model-names-thinking-dark.png' });
});
