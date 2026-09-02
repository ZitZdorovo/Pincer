import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockGateway } from '../helpers/gateway';

let application: ElectronApplication;
let page: Page;
let directory: string;
let mock: MockGateway;
let pageErrors: string[];
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

test('clean Electron shell, imported design tokens and no renderer Node privileges', async () => {
  await expect(page).toHaveTitle('Pincer');
  await expect(page.getByTestId('phase-operator')).toHaveText('Отключено');
  await expect(page.getByTestId('phase-node')).toHaveText('Отключено');
  const boundary = await page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>).require,
    process: typeof (globalThis as Record<string, unknown>).process,
    api: Object.keys(window.pincer).sort(),
  }));
  expect(boundary).toEqual({ require: 'undefined', process: 'undefined', api: ['chat', 'gateway', 'memory', 'platform', 'updates', 'window'] });
  await page.screenshot({ path: 'artifacts/pincer-connection-light.png' });
  await page.getByRole('button', { name: 'Сменить тему' }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.screenshot({ path: 'artifacts/pincer-connection-dark.png' });
  await page.getByRole('button', { name: 'Открыть оболочку' }).click();
  await expect(page.getByRole('heading', { name: 'С чего начнём?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Новый чат', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'artifacts/pincer-shell-dark.png' });
  await page.getByRole('button', { name: 'Показать / скрыть боковую панель' }).click();
  await expect(page.locator('aside')).toHaveAttribute('inert', '');
});

test('real dual connection, no plaintext secrets and explicit disconnect', async () => {
  await connect();
  await expect(page.getByTestId('main-layout')).toBeVisible();
  await expect(page.getByTestId('setup-page')).not.toBeVisible();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
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
  await page.getByRole('textbox', { name: 'Напиши сообщение…' }).fill('Hello test');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByTestId('chat-page')).toContainText('Hello from Gateway');
  await expect(page.getByRole('button', { name: 'Остановить', exact: true })).not.toBeVisible();
  await expect(page.getByTestId('chat-page').locator('article').getByText('Hello test', { exact: true })).toHaveCount(1);
  await expect.poll(async () => (await page.evaluate(() => window.pincer.chat.snapshot())).messages.filter((message) => message.role === 'assistant').length).toBe(1);
  expect(mock.responses.filter((request) => request.method === 'chat.send')).toHaveLength(1);
  expect(mock.responses.find((request) => request.method === 'sessions.create')?.params).toMatchObject({ permissionMode: 'full' });
  await page.getByRole('button', { name: 'Сменить тему' }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.screenshot({ path: 'artifacts/pincer-chat-dark.png' });
});

test('memory lives on Gateway, rejects conflicting edits and distinguishes missing embeddings', async () => {
  await connect();
  await page.getByRole('button', { name: 'Память', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Загрузить память' })).toBeEnabled();
  await page.getByRole('button', { name: 'Загрузить память' }).click();
  await expect(page.getByRole('textbox', { name: 'MEMORY.md' })).toHaveValue(mock.memoryContent);
  await page.getByRole('textbox', { name: 'MEMORY.md' }).fill('# Memory\nUpdated by Pincer');
  await page.getByRole('button', { name: 'Сохранить память' }).click();
  await expect.poll(() => mock.memoryContent).toContain('Updated by Pincer');
  mock.embeddingReady = false;
  await page.getByRole('button', { name: 'Проверить семантический поиск' }).click();
  await expect(page.getByTestId('memory-page')).toContainText('Семантический поиск не готов');
  await page.getByRole('textbox', { name: 'Что вспомнить?' }).fill('Pincer');
  await page.getByRole('button', { name: 'Искать в памяти' }).click();
  await expect(page.getByTestId('memory-page')).toContainText('Поиск по словам — не семантический');
  await page.getByRole('textbox', { name: 'MEMORY.md' }).fill('Local change');
  mock.memoryContent = 'Concurrent server change';
  await page.getByRole('button', { name: 'Сохранить память' }).click();
  await expect(page.getByTestId('memory-page')).toContainText('Память изменена на сервере');
  expect(mock.memoryContent).toBe('Concurrent server change');
  await page.screenshot({ path: 'artifacts/pincer-memory.png' });
});

test('update modal follows real progress events and has no simulated development install', async () => {
  test.skip(Boolean(process.env.PINCER_PACKAGED_EXE), 'Development-mode behavior only');
  await page.getByRole('button', { name: 'Открыть оболочку' }).click();
  await page.getByRole('button', { name: 'Обновления', exact: true }).click();
  await expect(page.getByTestId('main-content')).toContainText('сборка для разработки');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('pincer:updates:state', { revision: 500, phase: 'downloading', currentVersion: '0.2.0', version: '0.2.1', percent: 33 }));
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
  await page.screenshot({ path: 'artifacts/pincer-update-modal.png' });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('pincer:updates:state', { revision: 501, phase: 'error', currentVersion: '0.2.0', error: 'UPDATE_FAILED' }));
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByTestId('main-content')).toContainText('Не удалось обновить Pincer');
});

test('validates in Main, rejects unsafe URLs and keeps controls usable at minimum size', async () => {
  const invalid = await page.evaluate(() => window.pincer.gateway.connect({ url: 'ws://public.example.com/', authMode: 'token', credential: 'test' }));
  expect(invalid).toMatchObject({ ok: false, error: { code: 'TLS_REQUIRED' } });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 620));
  await page.getByTestId('remote-gateway-connect').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('remote-gateway-connect')).toBeInViewport();
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.getByRole('heading', { name: 'Connect to OpenClaw' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
