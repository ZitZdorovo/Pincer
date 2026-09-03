import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigurationService } from '../../electron/workspace/configuration';
import { DraftStore } from '../../electron/workspace/drafts';
import { fixtureVault } from '../helpers/vault';
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it('keeps text drafts encrypted, isolated by endpoint and durable', () => {
  const fixture = fixtureVault(); dirs.push(fixture.dir); const path = join(fixture.dir, 'drafts.vault');
  const store = new DraftStore(path, fixture.cipher); store.write('a'.repeat(64), 'chat', 'PRIVATE_DRAFT');
  expect(readFileSync(path).includes('PRIVATE_DRAFT')).toBe(false);
  expect(new DraftStore(path, fixture.cipher).read('a'.repeat(64))).toEqual({ chat: 'PRIVATE_DRAFT' });
  expect(store.read('b'.repeat(64))).toEqual({});
  store.write('a'.repeat(64), 'chat', ''); expect(store.read('a'.repeat(64))).toEqual({});
});
it('never resets an unreadable draft store', () => {
  const fixture = fixtureVault(); dirs.push(fixture.dir); const path = join(fixture.dir, 'drafts.vault'); writeFileSync(path, 'broken');
  const store = new DraftStore(path, fixture.cipher);
  expect(() => store.write('a'.repeat(64), 'chat', 'overwrite')).toThrow('DRAFTS_UNREADABLE');
  expect(readFileSync(path, 'utf8')).toBe('broken');
});
it('returns only provider presentation, never saved credentials', async () => {
  const request = vi.fn(async () => ({ hash: 'v1', config: { models: { providers: { custom: { apiKey: 'PRIVATE_KEY', headers: { Authorization: 'PRIVATE_HEADER' }, baseUrl: 'https://example.com/v1', api: 'openai-completions', models: [{ id: 'model' }] } } } } }));
  const result = await new ConfigurationService({ operatorRequest: request }).providers();
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_KEY|PRIVATE_HEADER/);
  expect(result.providers[0]).toMatchObject({ id: 'custom', hasKey: true, models: ['model'] });
});
it('preserves model metadata and unrelated config and guards write revision', async () => {
  const request = vi.fn(async (method: string): Promise<unknown> => method === 'config.get' ? { hash: 'v1', config: { models: { providers: { custom: { baseUrl: 'https://example.com/v1', apiKey: 'private', models: [{ id: 'model', name: 'My Model', contextWindow: 128000 }] } } }, unrelated: 'keep' } } : { ok: true });
  const service = new ConfigurationService({ operatorRequest: request }); const input = { id: 'custom', api: 'openai-completions', baseUrl: 'https://example.com/v1', models: ['model'] };
  await expect(service.saveProvider('old', input)).rejects.toThrow('CONFIG_CONFLICT');
  await service.saveProvider('v1', input);
  const [, params] = (request.mock.calls as unknown as Array<[string, { raw: string; baseHash: string }]>).find(([method]) => method === 'config.patch')!;
  expect(JSON.parse(params.raw)).toEqual({ models: { providers: { custom: { baseUrl: input.baseUrl, api: input.api, models: [{ id: 'model', name: 'My Model', contextWindow: 128000 }] } } } });
  expect(params.baseHash).toBe('v1');
});
it('never moves a saved key to a different provider endpoint implicitly', async () => {
  const request = vi.fn(async () => ({ hash: 'v1', config: { models: { providers: { custom: { apiKey: 'private', baseUrl: 'https://old.example/v1', models: [] } } } } }));
  const service = new ConfigurationService({ operatorRequest: request });
  await expect(service.saveProvider('v1', { id: 'custom', api: 'openai-completions', baseUrl: 'https://new.example/v1', models: ['model'] })).rejects.toThrow('NEW_DESTINATION_REQUIRES_NEW_KEY');
});
it('checks the server memory schema before writing defaults and redacts key-bearing errors', async () => {
  const request = vi.fn(async (method: string): Promise<unknown> => {
    if (method === 'config.schema.lookup') return { path: 'memory.search', schema: { type: 'object' }, children: [] };
    if (method === 'config.get') return { hash: 'v1', config: {} };
    throw new Error('Invalid secret PRIVATE_NEW_KEY');
  });
  await expect(new ConfigurationService({ operatorRequest: request }).saveMemory('v1', { provider: 'openai', model: 'text-embedding-3-small', apiKey: 'PRIVATE_NEW_KEY' })).rejects.toThrow(/^CONFIG_UPDATE_FAILED$/);
});
