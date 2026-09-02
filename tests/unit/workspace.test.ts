import { afterEach, beforeEach, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { GatewayService, NODE_VERSION } from '../../electron/gateway/service';
import { WorkspaceService, bounded, messageText } from '../../electron/workspace/service';
import { fixtureVault } from '../helpers/vault';
import { MockGateway } from '../helpers/gateway';
let directory: string; let mock: MockGateway; let gateway: GatewayService; let workspace: WorkspaceService;
beforeEach(async () => {
  const fixture = fixtureVault(); directory = fixture.dir; mock = new MockGateway();
  gateway = new GatewayService(fixture.vault, '0.2.0'); workspace = new WorkspaceService(gateway, (value) => fixture.vault.redact(value));
  await gateway.configure({ url: await mock.url(), authMode: 'token', credential: 'TEST_BOOTSTRAP_SECRET' });
  await expect.poll(() => workspace.snapshot().agentId).toBe('main');
});
afterEach(async () => { await gateway.disconnect(); await mock.close(); rmSync(directory, { recursive: true, force: true }); });
it('advertises the installed SDK, separately from Pincer, and opts into tool events', () => {
  expect(mock.connects.every((connection) => connection.client.version === NODE_VERSION)).toBe(true);
  expect(mock.connects[0].client.buildId).toBe('pincer-0.2.0');
  expect(mock.connects.find((connection) => connection.role === 'operator')?.caps).toContain('tool-events');
});
it('creates a full-permission session and sends exactly one request', async () => {
  await workspace.create('main'); await workspace.send('hello', 'send-test');
  await expect.poll(() => workspace.snapshot().messages.some((message) => message.text === 'Hello from Gateway')).toBe(true);
  expect(mock.responses.filter((request) => request.method === 'chat.send')).toHaveLength(1);
  expect(mock.responses.find((request) => request.method === 'sessions.create')?.params).toMatchObject({ permissionMode: 'full' });
});
it('recovers an empty or running session and aborts the specific run only', async () => {
  mock.holdRun = true; await workspace.create('main'); const key = workspace.snapshot().selected!;
  await workspace.send('long run', 'run-exact'); await workspace.select(key);
  expect(workspace.snapshot()).toMatchObject({ activeRun: 'run-exact', stream: 'Answer in progress' });
  await workspace.abort(); expect(workspace.snapshot().activeRun).toBeNull();
  expect(mock.responses.find((request) => request.method === 'sessions.abort')?.params).toEqual({ key, runId: 'run-exact' });
});
it('deduplicates deltas and ignores other sessions', async () => {
  await workspace.create('main'); const key = workspace.snapshot().selected!;
  mock.broadcast('chat', { sessionKey: key, runId: 'delta-run', seq: 1, state: 'delta', deltaText: 'one' });
  mock.broadcast('chat', { sessionKey: key, runId: 'delta-run', seq: 1, state: 'delta', deltaText: 'one' });
  mock.broadcast('chat', { sessionKey: 'other', runId: 'other-run', seq: 1, state: 'delta', deltaText: 'wrong' });
  await expect.poll(() => workspace.snapshot().stream).toBe('one');
});
it('reads and writes only MEMORY.md and detects a changed remote file', async () => {
  const file = await workspace.readMemory('main'); mock.memoryContent = 'Remote change';
  await expect(workspace.saveMemory('main', 'Local change', file.hash)).rejects.toThrow('MEMORY_CONFLICT');
  expect(mock.responses.filter((request) => request.method === 'agents.files.set')).toHaveLength(0);
  const current = await workspace.readMemory('main'); await workspace.saveMemory('main', 'Updated memory', current.hash);
  expect(mock.memoryContent).toBe('Updated memory');
});
it('does not claim vector search when no embedding provider is configured', async () => {
  mock.embeddingReady = false;
  expect(await workspace.memoryStatus('main', true)).toMatchObject({ provider: 'none', ready: false });
  expect(await workspace.searchMemory('main', 'test')).toMatchObject({ semantic: false });
});
it('surfaces tool-policy refusal even when the RPC itself succeeded', async () => {
  mock.toolDenied = true; await expect(workspace.searchMemory('main', 'test')).rejects.toThrow('Memory tool denied by policy');
});
it('rejects invalid IPC inputs and extracts only text content', async () => {
  expect(() => bounded(5)).toThrow('INVALID_INPUT'); expect(() => bounded('x'.repeat(1025))).toThrow('INVALID_INPUT');
  await expect(workspace.memoryStatus('main', 'yes')).rejects.toThrow('INVALID_INPUT');
  expect(messageText({ content: [{ type: 'text', text: 'hello' }, { type: 'image', data: 'private' }] })).toBe('hello');
});
