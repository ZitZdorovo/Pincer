import { afterEach, expect, it, vi } from 'vitest';
import { ConfigurationService } from '../../electron/workspace/configuration';
import { quotasForModel } from '../../shared/quotas';

afterEach(() => vi.unstubAllGlobals());
it('never sends a redacted Gateway key to the provider or reports a stale catalog as refreshed', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const request = vi.fn(async (method: string) => method === 'config.get'
    ? { hash: 'v1', config: { models: { providers: { custom: { baseUrl: 'https://example.test/v1', api: 'openai-completions', apiKey: '__OPENCLAW_REDACTED__', models: [{ id: 'old' }] } } } } }
    : { models: [{ provider: 'custom', id: 'old' }], providerOutcomes: [] });
  const service = new ConfigurationService({ operatorRequest: request });
  await expect(service.refreshProviderModels('v1', 'custom')).rejects.toThrow('MODEL_DISCOVERY_KEY_REQUIRED');
  expect(fetcher).not.toHaveBeenCalled();
  expect(request.mock.calls.some(([method]) => method === 'config.patch')).toBe(false);
});
it('refreshes a masked-key provider using an explicitly supplied key without writing it back', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'fresh-high' }, { id: 'fresh-high' }, { id: 'fresh-ultra' }] }))));
  const request = vi.fn(async (method: string, _params: unknown) => method === 'config.get'
    ? { hash: 'v1', config: { models: { providers: { custom: { baseUrl: 'https://example.test/v1', api: 'openai-completions', apiKey: '__OPENCLAW_REDACTED__' } } } } }
    : { ok: true });
  await new ConfigurationService({ operatorRequest: request }).refreshProviderModels('v1', 'custom', 'EXPLICIT_KEY');
  const write = request.mock.calls.find(([method]) => method === 'config.patch')![1] as { raw: string };
  expect(JSON.parse(write.raw).models.providers.custom.models.map((m: {id: string}) => m.id)).toEqual(['fresh-high', 'fresh-ultra']);
  expect(write.raw).not.toContain('EXPLICIT_KEY');
});
it('loads and saves a 512-model catalog without truncation and accepts a full models URL', async () => {
  const data = Array.from({ length: 512 }, (_, index) => ({ id: `model-${index}` }));
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data })));
  vi.stubGlobal('fetch', fetcher);
  const request = vi.fn(async (method: string): Promise<unknown> => method === 'config.get' ? { hash: 'v1', config: {} } : { ok: true });
  const service = new ConfigurationService({ operatorRequest: request });
  const models = await service.discoverModels({ baseUrl: 'https://example.test/v1/models', api: 'openai-completions' });
  expect(String(fetcher.mock.calls[0][0])).toBe('https://example.test/v1/models');
  expect(models).toEqual(data.map(row => row.id));
  await service.saveProvider('v1', { id: 'custom', baseUrl: 'https://example.test/v1/models', api: 'openai-completions', models });
  const call = (request.mock.calls as unknown as [string, { raw: string }][]).find(([method]) => method === 'config.patch')!;
  const saved = JSON.parse(call[1].raw).models.providers.custom;
  expect(saved.baseUrl).toBe('https://example.test/v1');
  expect(saved.models).toHaveLength(512);
});
it('loads every catalog entry, follows pagination and deduplicates model IDs', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'first' }, { id: 'second' }], has_more: true, last_id: 'second' }))).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'second' }, { id: 'third' }] })));
  vi.stubGlobal('fetch', fetcher);
  const service = new ConfigurationService({ operatorRequest: vi.fn() });
  expect(await service.discoverModels({ baseUrl: 'https://example.test/v1', api: 'openai-completions', apiKey: 'test-key' })).toEqual(['first', 'second', 'third']);
  expect(String(fetcher.mock.calls[1][0])).toContain('after_id=second');
  expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer test-key' } });
});
it('reports an empty catalog without inventing a default model', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"data":[]}')));
  await expect(new ConfigurationService({ operatorRequest: vi.fn() }).discoverModels({ baseUrl: 'https://example.test/v1', api: 'openai-completions' })).rejects.toThrow('EMPTY_MODEL_CATALOG');
});
it('supports native Google catalogs and preserves every model id', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'models/gemini-2.5-pro' }], nextPageToken: 'next-page' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash' }] })));
  vi.stubGlobal('fetch', fetcher);
  const service = new ConfigurationService({ operatorRequest: vi.fn() });
  await expect(service.discoverModels({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta', api: 'google-generative-ai', apiKey: 'google-key' })).resolves.toEqual(['gemini-2.5-pro', 'gemini-2.5-flash']);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { 'x-goog-api-key': 'google-key' } });
  expect(String(fetcher.mock.calls[1][0])).toContain('pageToken=next-page');
});
it('accepts a newly introduced OpenClaw provider protocol without a client release', async () => {
  const request = vi.fn(async (method: string): Promise<unknown> => method === 'config.get' ? { hash: 'v1', config: {} } : { ok: true });
  await new ConfigurationService({ operatorRequest: request }).saveProvider('v1', { id: 'custom', baseUrl: 'https://provider.example/v1', api: 'future-provider-protocol', models: ['model'] });
  expect(request.mock.calls.some(([method]) => method === 'config.patch')).toBe(true);
});
it('shows only matching model windows and their accounts for routed models', () => {
  const providers = [{ provider: 'gemini', displayName: 'Gemini', source: 'omniroute' as const, windows: [{ label: 'Pro', model: 'gemini-pro-agent', accountId: 'work' }, { label: 'Flash', model: 'gemini-flash', accountId: 'personal' }] }, { provider: 'claude', displayName: 'Claude', source: 'gateway' as const, windows: [{ label: 'Week' }] }];
  expect(quotasForModel(providers, 'custom/gemini-pro-agent', 'custom')).toEqual([{ ...providers[0], windows: [providers[0].windows[0]] }]);
  expect(quotasForModel(providers, '')).toEqual([]);
});
