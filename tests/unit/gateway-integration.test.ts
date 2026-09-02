import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { GatewayService } from '../../electron/gateway/service';
import { fixtureVault } from '../helpers/vault';
import { MockGateway } from '../helpers/gateway';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); });
async function setup() {
  const mock = new MockGateway();
  const { vault, dir } = fixtureVault();
  const service = new GatewayService(vault, '0.1.0-test');
  cleanup.push(async () => { rmSync(dir, { recursive: true, force: true }); });
  cleanup.push(() => mock.close());
  cleanup.push(async () => { await service.disconnect(); });
  const url = await mock.url();
  return { mock, vault, service, connect: () => service.configure({ url, authMode: 'token', credential: 'TEST_BOOTSTRAP_SECRET' }) };
}
describe('real WebSocket transport through the pinned official SDK', () => {
  it('performs signed handshakes for both roles and serves declared node commands', async () => {
    const { mock, service, connect } = await setup();
    await connect();
    await expect.poll(() => [service.snapshot().operator.phase, service.snapshot().node.phase]).toEqual(['connected', 'connected']);
    expect(mock.signatureChecks.length).toBeGreaterThanOrEqual(2);
    expect(mock.signatureChecks.every(Boolean)).toBe(true);
    mock.invoke('device.info');
    await expect.poll(() => mock.responses.length).toBeGreaterThan(0);
    expect(mock.responses[0]).toMatchObject({ method: 'node.invoke.result', params: { ok: true, payload: { appVersion: '0.1.0-test' } } });
  });
  it('reconnects both roles after a Gateway restart without changing identity', async () => {
    const { mock, service, connect } = await setup();
    await connect();
    await expect.poll(() => service.snapshot().node.phase).toBe('connected');
    const id = service.snapshot().deviceId;
    const before = mock.connects.length;
    mock.drop();
    await expect.poll(() => mock.connects.length, { timeout: 10000 }).toBeGreaterThan(before + 1);
    await expect.poll(() => [service.snapshot().operator.phase, service.snapshot().node.phase]).toEqual(['connected', 'connected']);
    expect(service.snapshot().deviceId).toBe(id);
  });
  it.each([['pairing', 'pairing-required'], ['auth', 'auth-error'], ['protocol', 'incompatible']] as const)('reports %s instead of an endless connecting spinner', async (mode, phase) => {
    const { mock, service, connect } = await setup();
    mock.mode = mode;
    await connect();
    await expect.poll(() => service.snapshot().operator.phase).toBe(phase);
    if (mode === 'pairing') expect(service.snapshot().operator.failure?.requestId).toBe('pairing-test-123');
    expect(JSON.stringify(service.snapshot())).not.toContain('TEST_BOOTSTRAP_SECRET');
  });
});
