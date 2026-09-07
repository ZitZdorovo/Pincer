import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProviderCredentials } from '../../electron/workspace/provider-credentials';

it('isolates encrypted provider keys by Gateway identity and destination and fails closed on corruption', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pincer-provider-')); const path = join(dir, 'keys');
  const cipher = { encrypt: (text: string) => Buffer.from(Buffer.from(text).map(byte => byte ^ 73)), decrypt: (bytes: Buffer) => Buffer.from(bytes.map(byte => byte ^ 73)).toString() };
  let scope = 'gateway-device-a';
  try {
    const store = new ProviderCredentials(path, cipher, () => scope);
    store.set('custom', 'https://a.test', 'PRIVATE_KEY');
    expect(readFileSync(path).toString()).not.toContain('PRIVATE_KEY');
    expect(store.get('custom', 'https://a.test')).toBe('PRIVATE_KEY');
    expect(store.get('custom', 'https://b.test')).toBe('');
    scope = 'gateway-device-b'; expect(store.get('custom', 'https://a.test')).toBe('');
    scope = 'gateway-device-a'; store.set('custom', 'https://a.test', ''); expect(store.get('custom', 'https://a.test')).toBe('');
    writeFileSync(path, 'corrupt'); expect(() => store.set('custom', 'https://a.test', 'replacement')).toThrow();
    expect(readFileSync(path, 'utf8')).toBe('corrupt');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
