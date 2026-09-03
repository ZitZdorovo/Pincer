import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { GatewayService } from '../../electron/gateway/service';
import { ApprovalsService } from '../../electron/workspace/approvals';
import { fixtureVault } from '../helpers/vault';
import { MockGateway } from '../helpers/gateway';
import { pendingApproval } from '../helpers/approval';
let directory: string; let mock: MockGateway; let gateway: GatewayService; let approvals: ApprovalsService;
beforeEach(async () => {
  const fixture = fixtureVault(); directory = fixture.dir; mock = new MockGateway();
  mock.approvals.set('test-approval', pendingApproval());
  gateway = new GatewayService(fixture.vault, '0.2.0'); approvals = new ApprovalsService(gateway);
  await gateway.configure({ url: await mock.url(), authMode: 'token', credential: 'TEST_BOOTSTRAP_SECRET' });
  await expect.poll(() => approvals.snapshot().items.length).toBe(1);
});
afterEach(async () => { await gateway.disconnect(); await mock.close(); rmSync(directory, { recursive: true, force: true }); vi.restoreAllMocks(); });
const displayed = () => approvals.snapshot().items[0];
const decisions = () => mock.responses.filter((frame) => frame.method === 'approval.resolve');
it('recovers pending approvals using advertised lists, strips legacy request details and never auto-approves', () => {
  expect(displayed().approval.status).toBe('pending');
  expect(JSON.stringify(approvals.snapshot())).not.toContain('NEVER_FORWARD');
  expect(decisions()).toHaveLength(0);
  expect(mock.connects.find((item) => item.role === 'operator')?.caps).toContain('approvals');
});
it('rereads before applying exactly one explicit decision', async () => {
  const item = displayed(); await approvals.resolve(item.approval.id, item.reviewToken, 'allow-once');
  expect(decisions()).toHaveLength(1); expect(displayed().approval.status).toBe('allowed');
  await expect(approvals.resolve(item.approval.id, item.reviewToken, 'allow-once')).rejects.toThrow('APPROVAL_CHANGED');
  expect(decisions()).toHaveLength(1);
});
it('requires a new review after command or scope changes', async () => {
  const item = displayed(); mock.approvals.set(item.approval.id, { ...pendingApproval(), presentation: { kind: 'exec', commandText: 'different command', allowedDecisions: ['allow-once', 'deny'] } });
  await expect(approvals.resolve(item.approval.id, item.reviewToken, 'allow-once')).rejects.toThrow('APPROVAL_CHANGED');
  expect(decisions()).toHaveLength(0);
});
it('rejects expired requests and decisions not advertised by the server', async () => {
  const item = displayed(); await expect(approvals.resolve(item.approval.id, item.reviewToken, 'execute')).rejects.toThrow('INVALID_DECISION');
  const approval = mock.approvals.get(item.approval.id)!; mock.approvals.set(item.approval.id, { ...approval, expiresAtMs: Date.now() - 1 });
  await expect(approvals.resolve(item.approval.id, item.reviewToken, 'allow-once')).rejects.toThrow('APPROVAL_FINISHED');
  expect(decisions()).toHaveLength(0);
});
it('invalidates consent across disconnect and reconnect', async () => {
  const item = displayed(); await gateway.disconnect(); gateway.connectSaved();
  await expect.poll(() => gateway.snapshot().operator.phase).toBe('connected');
  await expect(approvals.resolve(item.approval.id, item.reviewToken, 'allow-once')).rejects.toThrow('APPROVAL_CHANGED');
  expect(decisions()).toHaveLength(0);
});
it('ignores a response arriving after the connection changed', async () => {
  const item = displayed(); const original = gateway.operatorRequest.bind(gateway);
  let finish!: (value: unknown) => void;
  vi.spyOn(gateway, 'operatorRequest').mockImplementation((method, params) => method === 'approval.get' ? new Promise((resolve) => { finish = resolve; }) : original(method, params));
  const resolving = approvals.resolve(item.approval.id, item.reviewToken, 'allow-once');
  const rejected = expect(resolving).rejects.toThrow('CONNECTION_CHANGED');
  await gateway.disconnect(); finish({ approval: item.approval }); await rejected;
  expect(decisions()).toHaveLength(0);
});
it('uses only the safe canonical lookup for incoming approval events', async () => {
  const item = pendingApproval('event-approval'); mock.approvals.set(item.id, item);
  mock.broadcast('exec.approval.requested', { id: item.id, request: { command: 'EVENT_MUST_NOT_BE_TRUSTED' } });
  await expect.poll(() => approvals.snapshot().items.length).toBe(2);
  expect(JSON.stringify(approvals.snapshot())).not.toContain('EVENT_MUST_NOT_BE_TRUSTED');
  expect(decisions()).toHaveLength(0);
});
