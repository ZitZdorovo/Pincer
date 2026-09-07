import { expect, it, vi } from 'vitest';
import { GatewaySettingsService } from '../../electron/workspace/settings';
import { resolveSchema } from '../../shared/settings';

const snapshot = () => ({ operator: { phase: 'connected', connectedAt: 1 }, profile: { url: 'ws://127.0.0.1' } }) as ReturnType<import('../../electron/gateway/service').GatewayService['snapshot']>;
it('keeps primitive schema nodes primitive', () => {
  expect(resolveSchema({ type: 'boolean' }, false)).toEqual({ type: 'boolean' });
  expect(resolveSchema({ type: 'string', enum: ['local', 'remote'] }, 'local')).toEqual({ type: 'string', enum: ['local', 'remote'] });
  expect(resolveSchema({ allOf: [{ type: 'object', properties: { enabled: { type: 'boolean' } } }] }, {})).toEqual(expect.objectContaining({ properties: { enabled: { type: 'boolean' } } }));
});
it('loads every schema root and never sends saved secrets to Renderer', async () => {
  const request = vi.fn(async (method: string, params: Record<string, unknown>) => method === 'config.schema'
    ? { version: '8', schema: { type: 'object', properties: { agents: { type: 'object' }, models: { type: 'object', properties: { providers: { type: 'object', additionalProperties: true } } } } }, uiHints: { 'models.providers.*.apiKey': { sensitive: true } } }
    : method === 'config.get' ? { hash: 'v1', config: { models: { providers: { private: { baseUrl: 'https://api.example', apiKey: 'PRIVATE_KEY' } } } } }
    : method === 'config.patch' ? { ok: true, params } : {});
  const service = new GatewaySettingsService({ operatorRequest: request, snapshot });
  expect((await service.catalog()).roots.map(r => r.key)).toEqual(['agents', 'models']);
  const document = await service.section('models'); expect(JSON.stringify(document)).not.toContain('PRIVATE_KEY');
  expect(request.mock.calls.filter(([method]) => method === 'config.schema')).toHaveLength(1);
  await service.save(document.lease, document.value);
  const raw = String((request.mock.calls.find(([method]) => method === 'config.patch')?.[1] as Record<string, unknown>).raw);
  expect(raw).toContain('PRIVATE_KEY'); expect(raw).not.toContain('__PINCER_PROTECTED_');
});
it('rejects moved protected values and a stale server revision', async () => {
  let hash = 'v1';
  const request = vi.fn(async (method: string) => method === 'config.schema' ? { schema: { type: 'object', properties: { env: { type: 'object', additionalProperties: { type: 'string' } } } }, uiHints: {} } : method === 'config.get' ? { hash, config: { env: { TOKEN: 'PRIVATE' } } } : { ok: true });
  const service = new GatewaySettingsService({ operatorRequest: request, snapshot }); const document = await service.section('env');
  await expect(service.save(document.lease, { MOVED: (document.value as Record<string, string>).TOKEN })).rejects.toThrow('SECRET_REFERENCE_MOVED');
  const fresh = await service.section('env'); hash = 'v2'; await expect(service.save(fresh.lease, fresh.value)).rejects.toThrow('CONFIG_CONFLICT');
});
it('saves every root shown on one settings tab in one atomic config patch', async () => {
  const request = vi.fn(async (method: string, params: Record<string, unknown>) => method === 'config.schema'
    ? { schema: { type: 'object', properties: { messages: { type: 'object', properties: { prefix: { type: 'string' } } }, attachments: { type: 'object', properties: { ttlHours: { type: 'number' } } } } }, uiHints: {} }
    : method === 'config.get' ? { hash: 'same-revision', config: { messages: { prefix: '' }, attachments: { ttlHours: 24 } } }
    : method === 'config.patch' ? { ok: true, params } : {});
  const service = new GatewaySettingsService({ operatorRequest: request, snapshot });
  const messages = await service.section('messages');
  const attachments = await service.section('attachments');
  await service.saveMany([
    { lease: messages.lease, value: { prefix: '[Pincer]' } },
    { lease: attachments.lease, value: { ttlHours: 48 } },
  ]);
  const patches = request.mock.calls.filter(([method]) => method === 'config.patch');
  expect(patches).toHaveLength(1);
  expect(patches[0][1]).toEqual(expect.objectContaining({
    baseHash: 'same-revision',
    raw: '{"messages":{"prefix":"[Pincer]"},"attachments":{"ttlHours":48}}',
    replacePaths: ['messages', 'attachments'],
  }));
});
