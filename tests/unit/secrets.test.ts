import { describe, expect, it, vi } from 'vitest';
import { GatewaySecretsService } from '../../electron/workspace/secrets';

describe('GatewaySecretsService', () => {
  it('returns only redacted metadata and uses dedicated store methods', async () => {
    const request = vi.fn(async (method: string, params: Record<string, unknown>) => method === 'secrets.store.list'
      ? { entries: [{ name: 'PRIVATE_TOKEN', kind: 'secret', scopeKind: 'team', scopeId: '', createdAtMs: 1, updatedAtMs: 2, allowedHosts: ['api.example.com'] }, { name: 'VISIBLE_ENV', kind: 'env', scopeKind: 'team', scopeId: '', createdAtMs: 1, updatedAtMs: 2, value: 'MUST_NOT_RENDER' }] }
      : { ok: true, reloaded: true, warningCount: 0, params });
    const service = new GatewaySecretsService({ operatorRequest: request } as never);
    expect(JSON.stringify(await service.list())).not.toContain('MUST_NOT_RENDER');
    expect((await service.list()).entries).toHaveLength(2);
    await service.set({ name: 'API_KEY', value: 'new-value', kind: 'secret', allowedHosts: ['API.EXAMPLE.COM'] });
    expect(request).toHaveBeenLastCalledWith('secrets.store.set', { name: 'API_KEY', value: 'new-value', kind: 'secret', allowedHosts: ['api.example.com'] });
    await service.delete('API_KEY');
    expect(request).toHaveBeenLastCalledWith('secrets.store.delete', { name: 'API_KEY' });
  });

  it('rejects invalid names, hosts and oversized batches before RPC', async () => {
    const request = vi.fn();
    const service = new GatewaySecretsService({ operatorRequest: request } as never);
    await expect(service.set({ name: 'lowercase', value: 'x', kind: 'secret' })).rejects.toThrow('INVALID_SECRET');
    await expect(service.set({ name: 'VALID', value: 'x', kind: 'secret', allowedHosts: ['https://not-a-host/'] })).rejects.toThrow('INVALID_SECRET_HOST');
    await expect(service.setMany([])).rejects.toThrow('INVALID_SECRET');
    expect(request).not.toHaveBeenCalled();
  });
});
