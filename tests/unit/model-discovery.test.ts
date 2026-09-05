import { afterEach, expect, it, vi } from 'vitest';
import { ConfigurationService } from '../../electron/workspace/configuration';
import { quotasForModel } from '../../shared/quotas';

afterEach(() => vi.unstubAllGlobals());
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
it('shows only matching model windows and their accounts for routed models', () => {
  const providers = [{ provider: 'gemini', displayName: 'Gemini', source: 'omniroute' as const, windows: [{ label: 'Pro', model: 'gemini-pro-agent', accountId: 'work' }, { label: 'Flash', model: 'gemini-flash', accountId: 'personal' }] }, { provider: 'claude', displayName: 'Claude', source: 'gateway' as const, windows: [{ label: 'Week' }] }];
  expect(quotasForModel(providers, 'custom/gemini-pro-agent', 'custom')).toEqual([{ ...providers[0], windows: [providers[0].windows[0]] }]);
  expect(quotasForModel(providers, '')).toEqual([]);
});
