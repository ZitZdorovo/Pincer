import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { sign, verify } from 'node:crypto';
import { Vault } from '../../electron/gateway/vault';
import { fixtureVault } from '../helpers/vault';

const cleanup: string[] = [];
afterEach(() => { for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const make = () => { const data = fixtureVault(); cleanup.push(data.dir); return data; };
const profile = { url: 'wss://gateway.test/', authMode: 'token' as const };
describe('encrypted fresh identity vault', () => {
  it('persists encrypted secrets and the same signing identity across restart', () => {
    const { vault, path, cipher } = make();
    vault.configure(profile, 'HIGHLY_SECRET_TOKEN');
    const disk = readFileSync(path);
    expect(disk.includes('HIGHLY_SECRET_TOKEN')).toBe(false);
    expect(disk.includes('PRIVATE KEY')).toBe(false);
    const reopened = new Vault(path, cipher);
    expect(reopened.identity).toEqual(vault.identity);
    expect(reopened.credential).toBe('HIGHLY_SECRET_TOKEN');
    expect(verify(null, Buffer.from('proof'), reopened.identity.publicKeyPem, sign(null, Buffer.from('proof'), vault.identity.privateKeyPem))).toBe(true);
  });
  it('isolates issued tokens by endpoint, role and TLS pin', () => {
    const { vault } = make();
    const deps = vault.hostDeps(profile);
    deps.storeDeviceAuthToken!({ deviceId: vault.identity.deviceId, role: 'node', token: 'NODE_SECRET', scopes: [] });
    expect(deps.loadDeviceAuthToken!({ deviceId: vault.identity.deviceId, role: 'node' })?.token).toBe('NODE_SECRET');
    expect(deps.loadDeviceAuthToken!({ deviceId: vault.identity.deviceId, role: 'operator' })).toBeNull();
    expect(vault.hostDeps({ ...profile, url: 'wss://gateway.test/other' }).loadDeviceAuthToken!({ deviceId: vault.identity.deviceId, role: 'node' })).toBeNull();
    expect(vault.hostDeps({ ...profile, tlsFingerprint: 'ab'.repeat(32) }).loadDeviceAuthToken!({ deviceId: vault.identity.deviceId, role: 'node' })).toBeNull();
  });
  it('invalidates role tokens when the bootstrap credential changes', () => {
    const { vault } = make();
    vault.configure(profile, 'first');
    const deps = vault.hostDeps(profile);
    deps.storeDeviceAuthToken!({ deviceId: vault.identity.deviceId, role: 'operator', token: 'ISSUED', scopes: ['operator.admin'] });
    vault.configure(profile, 'second');
    expect(deps.loadDeviceAuthToken!({ deviceId: vault.identity.deviceId, role: 'operator' })).toBeNull();
  });
  it('does not erase a corrupted vault or silently generate a new identity', () => {
    const { path, cipher } = make();
    writeFileSync(path, 'corrupted test data');
    expect(() => new Vault(path, cipher)).toThrow('VAULT_UNREADABLE');
    expect(readFileSync(path, 'utf8')).toBe('corrupted test data');
  });
  it('redacts bootstrap and issued tokens from user-visible server errors', () => {
    const { vault } = make();
    vault.configure(profile, 'raw/secret');
    vault.hostDeps(profile).storeDeviceAuthToken!({ deviceId: vault.identity.deviceId, role: 'node', token: 'NODE_SECRET', scopes: [] });
    expect(vault.redact('raw/secret raw%2Fsecret NODE_SECRET')).toBe('[redacted] [redacted] [redacted]');
  });
});
