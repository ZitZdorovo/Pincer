import { expect, it, vi } from 'vitest';
import { gatewayQuotas, omniQuotas, QuotaService, quotaUrl } from '../../electron/workspace/quotas';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('projects actual Gateway windows, reset times and async-refreshing without fake zeros', () => {
  expect(gatewayQuotas({ updatedAt: 1788429210225, providers: [], refreshing: true })).toMatchObject({ providers: [], refreshing: true });
  const q = gatewayQuotas({ providers: [{ provider: 'test', windows: [{ label: '5h', usedPercent: 25, resetAt: 1788429999 }, { label: 'week' }], token: 'NEVER_FORWARD' }] });
  expect(q.providers[0].windows[0]).toMatchObject({ usedPercent: 25, resetAt: 1788429999000 });
  expect(q.providers[0].windows[1].usedPercent).toBeUndefined(); expect(JSON.stringify(q)).not.toContain('NEVER_FORWARD');
  expect(() => gatewayQuotas({})).toThrow('INVALID_QUOTA_RESPONSE');
});
it('keeps OmniRoute account/model windows separate and never pretends a past reset means full quota', () => {
  const data = omniQuotas({ caches: { account: { fetchedAt: 1788429210225, plan: 'Pro', quotas: { session: { remainingPercentage: 72, resetAt: 1 }, weekly: { used: 10, total: 20 }, unknown: {}, free: { unlimited: true } } }, deleted: { quotas: { quota: { remainingPercentage: 1 } } } } }, { connections: [{ id: 'account', provider: 'codex', name: 'Work', apiKey: 'NEVER_FORWARD' }] });
  expect(data).toHaveLength(1); expect(data[0].windows.map(w => w.usedPercent)).toEqual([28, 50, undefined, undefined]);
  expect(data[0].windows[3].unlimited).toBe(true); expect(JSON.stringify(data)).not.toContain('NEVER_FORWARD');
});
it('accepts HTTPS or loopback only, never credentials in URLs, fragments or query secrets', () => {
  expect(quotaUrl('http://127.0.0.1:20128/v1/')).toBe('http://127.0.0.1:20128');
  for (const url of ['http://remote.example.com', 'https://user:secret@example.com', 'https://example.com?token=x', 'https://example.com#token=x', 'file:///tmp/x']) expect(() => quotaUrl(url)).toThrow();
});
it('encrypts credentials, isolates Gateways, rejects silent token forwarding and strips remote error bodies', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pincer-quota-')); const path = join(directory, 'quota'); let scope = 'one';
  const request = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes('provider-limits') ? { caches: {} } : { connections: [] }), { status: 200 }));
  const cipher = { encrypt: (s: string) => Buffer.from(Buffer.from(s).toString('base64')), decrypt: (b: Buffer) => Buffer.from(b.toString(), 'base64').toString() };
  const service = new QuotaService(async () => ({ providers: [] }), () => scope, { path, cipher }, request as typeof fetch);
  try {
    await service.configure({ baseUrl: 'https://quota.example.com', managementToken: 'ONLY_FOR_QUOTA' });
    expect(readFileSync(path, 'utf8')).not.toContain('ONLY_FOR_QUOTA'); expect(JSON.stringify(service.settings())).not.toContain('ONLY_FOR_QUOTA');
    await expect(service.configure({ baseUrl: 'https://other.example.com' })).rejects.toThrow('OMNIROUTE_MANAGEMENT_TOKEN_REQUIRED'); expect(request).toHaveBeenCalledTimes(2);
    scope = 'two'; expect(service.settings().configured).toBe(false); scope = 'one';
    expect(new QuotaService(async () => ({ providers: [] }), () => scope, { path, cipher }).settings().configured).toBe(true);
    request.mockImplementation(async () => new Response('Sensitive body ONLY_FOR_QUOTA', { status: 401 }));
    expect(await service.load()).toMatchObject({ errors: ['OMNIROUTE_HTTP_401'] });
    expect(JSON.stringify(await service.load())).not.toContain('ONLY_FOR_QUOTA');
    await service.configure({ baseUrl: '', clear: true }); expect(service.settings().configured).toBe(false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
