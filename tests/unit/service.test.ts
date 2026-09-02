import { afterEach, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import type { GatewayClientOptions } from '@openclaw/gateway-client';
import { GatewayService, NODE_COMMANDS, OPERATOR_SCOPES, type Client } from '../../electron/gateway/service';
import { fixtureVault } from '../helpers/vault';
import { hello } from '../helpers/gateway';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() {
  const { vault, dir } = fixtureVault(); dirs.push(dir);
  const options: GatewayClientOptions[] = [];
  const clients: Client[] = [];
  const service = new GatewayService(vault, '0.1.0-test', (opts) => {
    options.push(opts);
    const client: Client = { start: vi.fn(), stop: vi.fn(), stopAndWait: vi.fn(async () => {}), request: vi.fn(async () => ({})) };
    clients.push(client); return client;
  });
  return { service, options, clients, vault };
}
const input = { url: 'wss://gateway.test/', authMode: 'token' as const, credential: 'TEST_BOOTSTRAP_SECRET' };
describe('independent operator and node connections', () => {
  it('uses separate roles with one persistent device and no invented capabilities', async () => {
    const { service, options } = setup();
    await service.configure(input);
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({ role: 'operator', clientName: 'gateway-client', mode: 'ui', scopes: OPERATOR_SCOPES, minProtocol: 4, maxProtocol: 4 });
    expect(options[1]).toMatchObject({ role: 'node', clientName: 'node-host', mode: 'node', scopes: [], commands: NODE_COMMANDS, minProtocol: 3, maxProtocol: 4 });
    expect(options[0].deviceIdentity).toEqual(options[1].deviceIdentity);
    expect(JSON.stringify(service.snapshot())).not.toContain(input.credential);
    expect(JSON.stringify(service.snapshot())).not.toContain('privateKey');
  });
  it('does not confuse one successful role with full connectivity', async () => {
    const { service, options } = setup();
    await service.configure(input);
    options[0].onHelloOk!(hello('operator'));
    expect(service.snapshot().operator.phase).toBe('connected');
    expect(service.snapshot().node.phase).toBe('connecting');
  });
  it('keeps pairing request details after socket closure', async () => {
    const { service, options } = setup();
    await service.configure(input);
    options[1].onConnectError!(Object.assign(new Error('Pairing required'), { code: 'NOT_PAIRED', details: { code: 'PAIRING_REQUIRED', requestId: 'req-123' } }));
    options[1].onClose!(1008, 'connect failed');
    expect(service.snapshot().node).toMatchObject({ phase: 'pairing-required', failure: { requestId: 'req-123' } });
  });
  it('redacts auth failures and ignores old callbacks after switching endpoints', async () => {
    const { service, options } = setup();
    await service.configure(input);
    options[0].onConnectError!(Object.assign(new Error(`Invalid token ${input.credential}`), { code: 'UNAUTHORIZED' }));
    expect(service.snapshot().operator.failure?.message).not.toContain(input.credential);
    await service.configure({ ...input, url: 'wss://other.test/' });
    options[0].onHelloOk!(hello('operator'));
    expect(service.snapshot().operator.phase).toBe('connecting');
    expect(service.snapshot().profile?.url).toBe('wss://other.test/');
  });
  it('never reuses a saved secret at a different endpoint', async () => {
    const { service } = setup();
    await service.configure(input);
    await expect(service.configure({ url: 'wss://other.test/', authMode: 'token' })).rejects.toThrow('CREDENTIAL_REQUIRED');
  });
  it('clears remote version and phase on disconnect and ignores all late callbacks', async () => {
    const { service, options, clients } = setup();
    await service.configure(input);
    options[0].onHelloOk!(hello('operator'));
    await service.disconnect();
    options[0].onClose!(1006, 'late close');
    expect(service.snapshot().operator).toEqual({ phase: 'disconnected' });
    expect(clients.every((client) => vi.mocked(client.stop).mock.calls.length > 0)).toBe(true);
  });
  it('does not execute a node invocation addressed to a different device', async () => {
    const { service, options, clients } = setup();
    await service.configure(input);
    options[1].onHelloOk!(hello('node'));
    options[1].onEvent!({ type: 'event', event: 'node.invoke.request', payload: { id: 'req', nodeId: 'wrong-device', command: 'device.info' } });
    expect(clients[1].request).not.toHaveBeenCalled();
  });
  it('rejects commands that have not been implemented instead of inventing success', async () => {
    const { service, options, clients, vault } = setup();
    await service.configure(input);
    options[1].onHelloOk!(hello('node'));
    options[1].onEvent!({ type: 'event', event: 'node.invoke.request', payload: { id: 'req', nodeId: vault.identity.deviceId, command: 'system.run' } });
    expect(clients[1].request).toHaveBeenCalledWith('node.invoke.result', expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'NOT_IMPLEMENTED' }) }));
  });
});
