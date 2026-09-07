import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
it('preserves an unreadable draft store and restores a usable encrypted vault', () => {
  const fixture = fixtureVault(); dirs.push(fixture.dir); const path = join(fixture.dir, 'drafts.vault'); writeFileSync(path, 'broken');
  const store = new DraftStore(path, fixture.cipher);
  expect(store.read('a'.repeat(64))).toEqual({});
  store.write('a'.repeat(64), 'chat', 'replacement');
  expect(store.read('a'.repeat(64))).toEqual({ chat: 'replacement' });
  const backup = readdirSync(fixture.dir).find((name) => name.startsWith('drafts.vault.unreadable-'));
  expect(backup).toBeTruthy();
  expect(readFileSync(join(fixture.dir, backup!), 'utf8')).toBe('broken');
  expect(readFileSync(path, 'utf8')).not.toContain('replacement');
});
it('returns only provider presentation, never saved credentials', async () => {
  const request = vi.fn(async () => ({ hash: 'v1', config: { models: { providers: { custom: { apiKey: 'PRIVATE_KEY', headers: { Authorization: 'PRIVATE_HEADER' }, baseUrl: 'https://example.com/v1', api: 'openai-completions', models: [{ id: 'model' }] } } } } }));
  const result = await new ConfigurationService({ operatorRequest: request }).providers();
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_KEY|PRIVATE_HEADER/);
  expect(result.providers[0]).toMatchObject({ id: 'custom', hasKey: true, models: ['model'] });
});
it('does not resurrect removed configured models and accepts the refreshed API-key status', async () => {
  const request = vi.fn(async (method: string): Promise<unknown> => {
    if (method === 'config.get') return {
      hash: 'v2',
      config: { models: { providers: { custom: { baseUrl: 'https://example.com/v1', api: 'openai-completions', models: [{ id: 'fresh-model' }] } } } },
      sourceConfig: { models: { providers: { custom: {} } } },
    };
    if (method === 'models.authStatus') return { providers: [{ provider: 'custom', apiKey: true }] };
    if (method === 'models.list') return { models: [{ provider: 'custom', id: 'removed-model' }, { provider: 'custom', id: 'fresh-model' }] };
    throw new Error(`unexpected method ${method}`);
  });
  const result = await new ConfigurationService({ operatorRequest: request }).providers();
  expect(result.providers[0]).toMatchObject({ id: 'custom', hasKey: true, models: ['fresh-model'] });
});
it('refreshes a provider with its current saved key and replaces the old model list', async () => {
  const request = vi.fn(async (method: string): Promise<unknown> => method === 'config.get'
    ? { hash: 'v2', config: { models: { providers: { custom: { baseUrl: 'https://example.com/v1', api: 'openai-completions', apiKey: 'CURRENT_KEY', models: [{ id: 'old-model', name: 'Old' }] } } } } }
    : { ok: true });
  const service = new ConfigurationService({ operatorRequest: request });
  const discover = vi.spyOn(service, 'discoverModels').mockResolvedValue(['fresh-model']);
  await service.refreshProviderModels('v2', 'custom');
  expect(discover).toHaveBeenCalledWith({ baseUrl: 'https://example.com/v1', api: 'openai-completions', apiKey: 'CURRENT_KEY' });
  const [, params] = (request.mock.calls as unknown as Array<[string, { raw: string; replacePaths?: string[] }]>).find(([method]) => method === 'config.patch')!;
  expect(JSON.parse(params.raw)).toEqual({ models: { providers: { custom: { models: [{ id: 'fresh-model', name: 'fresh-model' }] } } } });
  expect(params.replacePaths).toEqual(['models.providers.custom.models']);
});
it('exposes only safe OAuth profile metadata and scopes logout to the selected agent', async () => {
  const request = vi.fn(async (method: string, params?: unknown): Promise<unknown> => {
    if (method === 'config.get') return { hash: 'v1', config: { models: { providers: {} } } };
    if (method === 'models.authStatus') return { providers: [{ provider: 'openai', status: 'ok', profiles: [{ profileId: 'openai:work', type: 'oauth', status: 'ok', email: 'user@example.com', logoutSupported: true, accessToken: 'PRIVATE_TOKEN' }] }] };
    if (method === 'models.authLogout') return { provider: 'openai', removedProfiles: ['openai:work'], params };
    throw new Error('unexpected method');
  });
  const service = new ConfigurationService({ operatorRequest: request });
  const snapshot = await service.providers();
  expect(JSON.stringify(snapshot)).not.toContain('PRIVATE_TOKEN');
  expect(snapshot.providers[0]).toMatchObject({ id: 'openai', hasKey: true, authProfiles: [{ profileId: 'openai:work', type: 'oauth', logoutSupported: true }] });
  await service.authLogout('openai', ['openai:work'], 'main');
  expect(request).toHaveBeenCalledWith('models.authLogout', { provider: 'openai', profileIds: ['openai:work'], agentId: 'main' });
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
it('deletes a provider with an RFC 7396 null tombstone', async () => {
  const request = vi.fn(async (method: string): Promise<unknown> => method === 'config.get'
    ? { hash: 'v1', config: { models: { providers: { first: { apiKey: 'secret', models: [{ id: 'a' }] }, second: { models: [{ id: 'b' }] } } } } }
    : { ok: true });
  await new ConfigurationService({ operatorRequest: request }).deleteProvider('v1', 'first');
  const [, params] = (request.mock.calls as unknown as Array<[string, { raw: string; replacePaths?: string[] }]>).find(([method]) => method === 'config.patch')!;
  expect(JSON.parse(params.raw)).toEqual({ models: { providers: { first: null } } });
  expect(params.replacePaths).toEqual(['models.providers.first.models']);
});
it('removes deleted provider model references from defaults and agents', async () => {
  const request = vi.fn(async (method: string): Promise<unknown> => method === 'config.get'
    ? { hash: 'v1', config: { models: { providers: { custom: { models: [{ id: 'gone' }, { id: 'keep' }] } } }, agents: { defaults: { model: { primary: 'custom/gone', fallbacks: ['custom/keep', 'other/model'] } }, list: [{ id: 'main', model: { primary: 'custom/keep' } }, { id: 'other', model: 'other/model' }] } } }
    : { ok: true });
  await new ConfigurationService({ operatorRequest: request }).deleteProvider('v1', 'custom');
  const [, params] = (request.mock.calls as unknown as Array<[string, { raw: string; replacePaths?: string[] }]>).find(([method]) => method === 'config.patch')!;
  expect(JSON.parse(params.raw)).toEqual({ models: { providers: { custom: null } }, agents: { defaults: { model: { primary: null, fallbacks: ['other/model'] } }, list: [{ id: 'main', model: {} }, { id: 'other', model: 'other/model' }] } });
  expect(params.replacePaths).toEqual(['agents.defaults.model.fallbacks', 'agents.list', 'models.providers.custom.models']);
});
it('removes provider ids from the agent model allowlist before deleting OAuth providers', async () => {
  const request = vi.fn(async (method: string): Promise<unknown> => method === 'config.get'
    ? { hash: 'v1', config: { models: { providers: { openai: { models: [{ id: 'gpt-5.6-sol' }] } } }, agents: { defaults: { models: { 'openai/gpt-5.6-sol': {}, 'other/model': {} } } } } }
    : { ok: true });
  await new ConfigurationService({ operatorRequest: request }).deleteProvider('v1', 'openai');
  const [, params] = (request.mock.calls as unknown as Array<[string, { raw: string }]>).find(([method]) => method === 'config.patch')!;
  expect(JSON.parse(params.raw)).toEqual({ models: { providers: { openai: null } }, agents: { defaults: { models: { 'openai/gpt-5.6-sol': null } } } });
});
it('deletes one model while preserving the provider and other model metadata', async () => {
  const request = vi.fn(async (method: string): Promise<unknown> => method === 'config.get'
    ? { hash: 'v1', config: { models: { providers: { custom: { api: 'openai-completions', models: [{ id: 'gone', name: 'Gone' }, { id: 'keep', name: 'Keep' }] } } }, agents: { defaults: { model: { primary: 'custom/gone', fallbacks: ['custom/keep'] } } } } }
    : { ok: true });
  await new ConfigurationService({ operatorRequest: request }).deleteProviderModel('v1', 'custom', 'gone');
  const [, params] = (request.mock.calls as unknown as Array<[string, { raw: string; replacePaths?: string[] }]>).find(([method]) => method === 'config.patch')!;
  expect(JSON.parse(params.raw)).toEqual({ models: { providers: { custom: { models: [{ id: 'keep', name: 'Keep' }] } } }, agents: { defaults: { model: { primary: null, fallbacks: ['custom/keep'] } } } });
  expect(params.replacePaths).toEqual(['models.providers.custom.models']);
});
it('checks the server memory schema before writing defaults and redacts key-bearing errors', async () => {
  const request = vi.fn(async (method: string): Promise<unknown> => {
    if (method === 'config.schema.lookup') return { path: 'memory.search', schema: { type: 'object' }, children: [] };
    if (method === 'config.get') return { hash: 'v1', config: {} };
    throw new Error('Invalid secret PRIVATE_NEW_KEY');
  });
  await expect(new ConfigurationService({ operatorRequest: request }).saveMemory('v1', { provider: 'openai', model: 'text-embedding-3-small', apiKey: 'PRIVATE_NEW_KEY' })).rejects.toThrow(/^CONFIG_UPDATE_FAILED$/);
});
