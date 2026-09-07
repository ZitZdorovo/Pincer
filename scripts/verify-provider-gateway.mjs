import { _electron as electron, expect } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

// Opt-in only. Updates the explicitly named provider's catalog; creates and
// removes its own disposable provider/session. Does not send inference requests.
const password = process.env.PINCER_DIAGNOSTIC_PASSWORD;
const apiKey = process.env.PINCER_DIAGNOSTIC_API_KEY;
const providerId = process.env.PINCER_DIAGNOSTIC_PROVIDER;
if (!password || !apiKey || !providerId) throw new Error('Explicit diagnostic credentials and provider required');
const directory = mkdtempSync(join(tmpdir(), 'pincer-live-'));
const env = { ...process.env, PINCER_TEST_DATA: directory };
delete env.ELECTRON_RUN_AS_NODE; delete env.PINCER_DIAGNOSTIC_PASSWORD; delete env.PINCER_DIAGNOSTIC_API_KEY;
const app = await electron.launch({ args: ['.'], env });
const page = await app.firstWindow();
let sessionKey; let disposable;
const checked = result => { if (!result.ok) throw new Error(result.error.message); return result.value; };
try {
  await page.waitForFunction(() => Boolean(window.pincer));
  checked(await page.evaluate(password => window.pincer.gateway.connect({ url: 'ws://127.0.0.1:18789', authMode: 'password', credential: password }), password));
  await expect.poll(async () => (await page.evaluate(() => window.pincer.gateway.snapshot())).operator.phase, { timeout: 20000 }).toBe('connected');
  console.log('Gateway', (await page.evaluate(() => window.pincer.gateway.snapshot())).operator.serverVersion);
  let providers = checked(await page.evaluate(() => window.pincer.configuration.providers()));
  assert(providers.providers.some(p => p.id === providerId));
  checked(await page.evaluate(({ hash, providerId, apiKey }) => window.pincer.configuration.refreshProviderModels(hash, providerId, apiKey), { hash: providers.hash, providerId, apiKey }));
  providers = checked(await page.evaluate(() => window.pincer.configuration.providers()));
  const first = providers.providers.find(p => p.id === providerId).models;
  checked(await page.evaluate(({ hash, providerId }) => window.pincer.configuration.refreshProviderModels(hash, providerId), { hash: providers.hash, providerId }));
  providers = checked(await page.evaluate(() => window.pincer.configuration.providers()));
  assert.deepEqual(providers.providers.find(p => p.id === providerId).models, first);
  assert.equal(new Set(first).size, first.length);
  console.log('Refreshed twice; unique models:', first.length);
  disposable = `pincer-diagnostic-${Date.now()}`;
  checked(await page.evaluate(({hash,id}) => window.pincer.configuration.saveProvider(hash,{id,baseUrl:'http://127.0.0.1:1/v1',api:'openai-completions',models:['test-high','test-ultra']}),{hash:providers.hash,id:disposable}));
  providers = checked(await page.evaluate(() => window.pincer.configuration.providers()));
  checked(await page.evaluate(({hash,id}) => window.pincer.configuration.deleteProvider(hash,id),{hash:providers.hash,id:disposable}));
  providers = checked(await page.evaluate(() => window.pincer.configuration.providers()));
  assert(!providers.providers.some(p => p.id === disposable)); disposable = undefined;
  console.log('Disposable provider deletion verified');
  sessionKey = checked(await page.evaluate(() => window.pincer.chat.create('main')));
  if (typeof sessionKey !== 'string') sessionKey = (await page.evaluate(() => window.pincer.chat.snapshot())).selected;
  const variant = first.find(id => id.endsWith('-ultra'));
  assert(variant, 'An actual ultra variant is required for this diagnostic');
  checked(await page.evaluate(model => window.pincer.chat.setModel(model), `${providerId}/${variant}`));
  await page.getByTestId('chat-thinking-picker-button').click();
  await page.getByTestId('chat-thinking-picker-menu').getByRole('button', { name: 'High', exact: true }).click();
  const expected = `${providerId}/${variant.replace(/-ultra$/, '-high')}`;
  await expect.poll(async () => (await page.evaluate(() => window.pincer.chat.snapshot())).model).toBe(expected);
  checked(await page.evaluate(key => window.pincer.chat.select(key), sessionKey));
  assert.equal((await page.evaluate(() => window.pincer.chat.snapshot())).model, expected);
  await page.getByTestId('chat-thinking-picker-button').click();
  await page.getByTestId('chat-thinking-picker-menu').getByRole('button', { name: 'Ultra', exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.pincer.chat.snapshot())).model).toBe(`${providerId}/${variant}`);
  const plain = first.find(id => id.endsWith('/gemini-pro-agent'));
  assert(plain);
  checked(await page.evaluate(model => window.pincer.chat.setModel(model), `${providerId}/${plain}`));
  await expect(page.getByTestId('chat-thinking-picker-button')).toHaveCount(0);
  checked(await page.evaluate(model => window.pincer.chat.setModel(model), expected));
  await page.getByTestId('chat-model-picker-button').click();
  const options = page.locator('[data-testid^="chat-model-picker-option-"]');
  const count = await options.count();
  await page.getByTestId('chat-model-picker-button').click(); await page.getByTestId('chat-model-picker-button').click();
  await expect(options).toHaveCount(count);
  mkdirSync('artifacts/pincer-live', { recursive: true });
  await page.screenshot({ path: 'artifacts/pincer-live/models-thinking.png' });
  console.log('Exact high variant persisted; stable picker groups:', count);
} finally {
  if (sessionKey) checked(await page.evaluate(key => window.pincer.chat.remove(key), sessionKey));
  if (disposable) {
    const providers = checked(await page.evaluate(() => window.pincer.configuration.providers()));
    checked(await page.evaluate(({hash,id}) => window.pincer.configuration.deleteProvider(hash,id),{hash:providers.hash,id:disposable}));
  }
  await app.close();
  rmSync(directory, { recursive: true, force: true });
}
