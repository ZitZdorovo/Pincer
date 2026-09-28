import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
it('keeps a successful model change selected after history reload', async () => {
  mock.models.push({ id: 'alternate-model', name: 'Alternate Model', provider: 'alternate', contextWindow: 64000, reasoning: false });
  await workspace.refresh(); await workspace.create('main');
  await workspace.setModel('alternate/alternate-model');
  expect(mock.sessions[0].model).toBe('alternate/alternate-model');
  expect(workspace.snapshot().model).toBe('alternate/alternate-model');
  expect(workspace.snapshot().sessions[0].model).toBe('alternate/alternate-model');
});
it('refreshes the configured model catalog without changing the selected chat model', async () => {
  await workspace.create('main'); await workspace.setModel('test/test-model');
  const selected = workspace.snapshot().selected;
  const freshModel = { id: 'fresh-model', name: 'Fresh Gateway Model', provider: 'fresh', contextWindow: 128000, reasoning: true, thinkingLevels: [{ id: 'low', label: 'Low' }, { id: 'max', label: 'Max' }], thinkingDefault: 'low' };
  mock.models.splice(0, 1, freshModel, { ...freshModel });
  await workspace.refreshModels();
  expect(workspace.snapshot()).toMatchObject({ selected, model: 'test/test-model', loading: false });
  expect(workspace.snapshot().models).toEqual([{ id: 'fresh/fresh-model', name: 'Fresh Gateway Model', provider: 'fresh', contextWindow: 128000, reasoning: true, thinkingLevels: [{ id: 'low', label: 'Low' }, { id: 'max', label: 'Max' }], thinkingDefault: 'low' }]);
  expect(mock.responses.findLast((request) => request.method === 'models.list')?.params).toMatchObject({ agentId: 'main', view: 'configured' });
});
it('keeps a new chat local until the first send and stores non-Git project folders in Pincer', async () => {
  const existingCreates = mock.responses.filter((request) => request.method === 'sessions.create').length;
  await workspace.registerProject('Far Cry 4', 'C:\\Users\\zdawn\\Documents\\My Games\\Far Cry 4');
  const project = workspace.snapshot().projects[0];
  expect(project).toMatchObject({ name: 'Far Cry 4', path: 'C:\\Users\\zdawn\\Documents\\My Games\\Far Cry 4' });
  expect(mock.responses.some((request) => String(request.method).startsWith('projects.'))).toBe(false);
  await workspace.prepare({ projectId: project.id, cwd: project.path });
  expect(workspace.snapshot()).toMatchObject({ selected: null, draftLocation: { projectId: project.id, cwd: project.path } });
  expect(mock.responses.filter((request) => request.method === 'sessions.create')).toHaveLength(existingCreates);
  await workspace.create('main', workspace.snapshot().draftLocation);
  const create = mock.responses.findLast((request) => request.method === 'sessions.create')?.params;
  expect(create).toMatchObject({ agentId: 'main', cwd: project.path });
  expect(create).not.toHaveProperty('projectId');
});
it('inherits the active project for a new chat and returns to the default workspace after leaving it', async () => {
  await workspace.registerProject('Research', 'C:\\Research');
  const project = workspace.snapshot().projects[0];
  await workspace.prepare({ projectId: project.id, cwd: 'C:\\Research\\Notes' });
  await workspace.prepare();
  expect(workspace.snapshot().draftLocation).toEqual({ projectId: project.id, cwd: 'C:\\Research\\Notes' });
  await workspace.prepare({ projectId: project.id, cwd: project.path });
  await workspace.prepare();
  expect(workspace.snapshot().draftLocation).toEqual({ projectId: project.id, cwd: project.path });

  await workspace.create('main', workspace.snapshot().draftLocation);
  const projectChat = workspace.snapshot().selected!;
  await workspace.prepare();
  expect(workspace.snapshot().draftLocation).toEqual({ projectId: project.id, cwd: project.path });

  mock.sessions.find((session) => session.key === projectChat)!.execCwd = '/root/openclaw/workspace';
  await workspace.refresh();
  expect(workspace.snapshot().sessions.find((session) => session.key === projectChat)?.cwd).toBe(project.path);
  await workspace.select(projectChat);
  await workspace.prepare();
  expect(workspace.snapshot().draftLocation).toEqual({ projectId: project.id, cwd: project.path });

  await workspace.prepare({});
  expect(workspace.snapshot().draftLocation).toEqual({});
  await workspace.create('main');
  const defaultChat = workspace.snapshot().selected!;
  expect(mock.responses.findLast((request) => request.method === 'sessions.create')?.params).not.toHaveProperty('cwd');
  await workspace.prepare();
  expect(workspace.snapshot().draftLocation).toEqual({});

  await workspace.select(projectChat);
  await workspace.prepare();
  expect(workspace.snapshot().draftLocation).toEqual({ projectId: project.id, cwd: project.path });
  await workspace.select(defaultChat);
  await workspace.prepare();
  expect(workspace.snapshot().draftLocation).toEqual({});
});
it('binds a Windows project on a Linux Gateway to the Pincer node', async () => {
  mock.platform = 'linux';
  await workspace.refresh();
  await expect.poll(() => gateway.snapshot().node.phase).toBe('connected');
  const localPath = 'C:\\Users\\zdawn\\Desktop\\project';
  await workspace.registerProject('Local project', localPath);
  await workspace.create('main', { cwd: localPath });
  expect(mock.responses.findLast((request) => request.method === 'sessions.create')?.params).toMatchObject({ cwd: localPath, execNode: gateway.snapshot().deviceId });
});
it('retains a separate chosen workspace for every chat when Gateway reports one shared cwd', async () => {
  await workspace.create('main', { cwd: 'C:\\First' });
  const first = workspace.snapshot().selected!;
  await workspace.create('main', { cwd: 'C:\\Second' });
  const second = workspace.snapshot().selected!;
  for (const session of mock.sessions) session.execCwd = 'C:\\Gateway';
  await workspace.refresh();
  expect(workspace.snapshot().sessions.find((session) => session.key === first)?.cwd).toBe('C:\\First');
  expect(workspace.snapshot().sessions.find((session) => session.key === second)?.cwd).toBe('C:\\Second');
  await workspace.select(first);
  await workspace.prepare();
  expect(workspace.snapshot().draftLocation).toEqual({});
});
it('keeps a local project available when the node is offline', async () => {
  mock.platform = 'linux';
  await workspace.refresh();
  await gateway.disconnect();
  const localPath = 'C:\\Users\\zdawn\\Desktop\\offline-project';
  await workspace.registerProject('Offline project', localPath);
  expect(workspace.snapshot().projects[0]).toMatchObject({ name: 'Offline project', path: localPath });
  await expect(workspace.create('main', { cwd: localPath })).rejects.toThrow('LOCAL_NODE_UNAVAILABLE');
});
it('lists downloadable Gateway artifacts and previews images', async () => {
  await workspace.create('main');
  const key = workspace.snapshot().selected!;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64').toString('base64');
  mock.artifacts.set(key, [{ id: 'image-1', title: 'picture.png', mimeType: 'image/png', data: png }, { id: 'document-1', title: 'sample.pdf', mimeType: 'application/pdf', data: Buffer.from('PDF').toString('base64') }]);
  await workspace.select(key);
  expect(workspace.snapshot().artifacts).toMatchObject([{ title: 'picture.png', imageData: `data:image/png;base64,${png}` }, { title: 'sample.pdf' }]);
  expect(await workspace.downloadArtifact('document-1')).toMatchObject({ title: 'sample.pdf', data: Buffer.from('PDF').toString('base64') });
});
it('attaches equal-named images to the response identified by each artifact ID', async () => {
  await workspace.create('main'); const key = workspace.snapshot().selected!;
  mock.histories.set(key, [
    { role: 'user', content: 'First' },
    { role: 'assistant', content: [{ type: 'image', artifactId: 'first', url: '/signed/first', mimeType: 'image/png' }] },
    { role: 'user', content: 'Again' },
    { role: 'assistant', content: [{ type: 'image', artifactId: 'second', url: '/signed/second', mimeType: 'image/png' }] },
  ]);
  const png = Buffer.from('small-image').toString('base64');
  mock.artifacts.set(key, [
    { id: 'first', title: 'same.png', mimeType: 'image/png', data: png },
    { id: 'second', title: 'same.png', mimeType: 'image/png', data: png },
  ]);
  await workspace.select(key);
  const answers = workspace.snapshot().messages.filter((message) => message.role === 'assistant');
  expect(answers[0].files).toMatchObject([{ name: 'same.png', artifactId: 'first' }]);
  expect(answers[1].files).toMatchObject([{ name: 'same.png', artifactId: 'second' }]);
});
it('requests real Gateway context compaction for the selected session', async () => {
  await workspace.create('main'); const key = workspace.snapshot().selected;
  await workspace.compact();
  expect(mock.responses.findLast((item) => item.method === 'sessions.compact')?.params).toEqual({ key });
});
it('preserves 16-second measured duration through a racing history reload with identical timestamps', async () => {
  mock.holdRun = true; mock.deltaDelayMs = 60000; await workspace.create('main');
  const start = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
  try {
    await workspace.send('Sixteen seconds', 'timed-run'); const key = workspace.snapshot().selected!;
    expect(workspace.snapshot()).toMatchObject({ runStartedAt: start, runPhase: 'starting' });
    mock.broadcast('agent', { sessionKey: key, runId: 'timed-run', stream: 'tool', data: { toolCallId: 'tool1', name: 'exec', phase: 'start', args: { command: 'whoami' } } });
    await expect.poll(() => workspace.snapshot().runPhase).toBe('working');
    clock.mockReturnValue(start + 16000);
    mock.histories.get(key)!.push({ role: 'assistant', content: 'Done', timestamp: start, usage: { output: 1102 } }); mock.activeRuns.delete(key);
    const reload = workspace.select(key);
    mock.broadcast('chat', { sessionKey: key, runId: 'timed-run', seq: 2, state: 'final', message: { content: 'Done' } });
    await reload;
    await expect.poll(() => workspace.snapshot().activeRun).toBeNull();
    await workspace.select(key);
    expect(workspace.snapshot().messages.at(-1)).toMatchObject({ durationMs: 16000, usage: { output: 1102 } });
    await workspace.select(key); expect(workspace.snapshot().messages.at(-1)?.durationMs).toBe(16000);
  } finally { clock.mockRestore(); }
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
it('keeps run state on its own session while another chat is selected', async () => {
  mock.holdRun = true; mock.deltaDelayMs = 60000; await workspace.create('main');
  const running = workspace.snapshot().selected!; await workspace.send('Background work', 'background-run');
  expect(workspace.snapshot().sessions.find((session) => session.key === running)?.activeRunId).toBe('background-run');
  await workspace.create('main'); expect(workspace.snapshot().selected).not.toBe(running);
  expect(workspace.snapshot().sessions.find((session) => session.key === running)?.activeRunId).toBe('background-run');
  mock.activeRuns.delete(running); mock.broadcast('chat', { sessionKey: running, runId: 'background-run', seq: 2, state: 'final' });
  await expect.poll(() => workspace.snapshot().sessions.find((session) => session.key === running)?.activeRunId).toBeUndefined();
  expect(workspace.snapshot().sessions.find((session) => session.key === running)?.lastRunState).toBe('completed');
  expect(workspace.snapshot().sessions.find((session) => session.key === running)?.unread).toBe(true);
  mock.broadcast('agent', { sessionKey: running, runId: 'background-run', stream: 'lifecycle', data: { phase: 'end' } });
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(workspace.snapshot().sessions.find((session) => session.key === running)).toMatchObject({ lastRunState: 'completed' });
  expect(workspace.snapshot().sessions.find((session) => session.key === running)?.activeRunId).toBeUndefined();
  await workspace.refresh();
  expect(workspace.snapshot().sessions.find((session) => session.key === running)?.lastRunState).toBe('completed');
  await workspace.select(running);
  expect(workspace.snapshot().sessions.find((session) => session.key === running)?.unread).toBe(false);
  expect(mock.responses.findLast((request) => request.method === 'sessions.patch')?.params).toMatchObject({ key: running, unread: false });
  await workspace.send('Another turn', 'next-run');
  expect(workspace.snapshot().sessions.find((session) => session.key === running)).toMatchObject({ activeRunId: 'next-run' });
  expect(workspace.snapshot().sessions.find((session) => session.key === running)?.lastRunState).toBeUndefined();
});
it('reconciles a missed final event against Gateway history', async () => {
  mock.holdRun = true; mock.deltaDelayMs = 60000; await workspace.create('main');
  const key = workspace.snapshot().selected!; await workspace.send('Check background status', 'missed-final');
  mock.activeRuns.delete(key);
  mock.histories.get(key)!.push({ role: 'assistant', content: 'Done', timestamp: Date.now() });
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
  try {
    mock.broadcast('tick', { ts: Date.now() });
    await expect.poll(() => workspace.snapshot().sessions.find((session) => session.key === key)?.lastRunState).toBe('completed');
    expect(workspace.snapshot().sessions.find((session) => session.key === key)?.activeRunId).toBeUndefined();
  } finally { clock.mockRestore(); }
});
it('uses Gateway session status for an already finished chat and a missed final event', async () => {
  mock.sessions.push({ key: 'agent:main:finished', label: 'Earlier task', agentId: 'main', status: 'done', lastRunId: 'earlier-run', unread: true });
  await workspace.refresh();
  expect(workspace.snapshot().sessions.find((session) => session.key === 'agent:main:finished')).toMatchObject({ gatewayStatus: 'done', lastRunState: 'completed', unread: true });
  await workspace.select('agent:main:finished');
  expect(workspace.snapshot().sessions.find((session) => session.key === 'agent:main:finished')?.unread).toBe(false);

  mock.holdRun = true; await workspace.create('main');
  const key = workspace.snapshot().selected!;
  await workspace.send('Long task', 'status-run');
  expect(workspace.snapshot().sessions.find((session) => session.key === key)?.gatewayStatus).toBe('running');
  mock.activeRuns.delete(key);
  const row = mock.sessions.find((session) => session.key === key)!;
  row.status = 'done';
  mock.broadcast('tick', { ts: Date.now() + 31_000 });
  await expect.poll(() => workspace.snapshot().sessions.find((session) => session.key === key)?.gatewayStatus).toBe('done');
  expect(workspace.snapshot().sessions.find((session) => session.key === key)).toMatchObject({ lastRunState: 'completed' });
  expect(workspace.snapshot().sessions.find((session) => session.key === key)?.activeRunId).toBeUndefined();
});
it('shows compaction only from real Gateway events and waits for retry completion', async () => {
  mock.holdRun = true; mock.deltaDelayMs = 60000; await workspace.create('main'); const key = workspace.snapshot().selected!;
  await workspace.send('compact', 'compact-run');
  mock.broadcast('agent', { key, runId: 'compact-run', stream: 'compaction', data: { phase: 'start' } });
  await expect.poll(() => workspace.snapshot().compaction?.phase).toBe('running');
  mock.broadcast('agent', { sessionKey: key, runId: 'compact-run', stream: 'compaction', data: { phase: 'end', completed: true, willRetry: true } });
  await expect.poll(() => workspace.snapshot().compaction?.phase).toBe('running');
  mock.broadcast('agent', { sessionKey: key, runId: 'compact-run', stream: 'lifecycle', data: { phase: 'end' } });
  await expect.poll(() => workspace.snapshot().compaction?.phase).toBe('completed');
  expect(workspace.snapshot().liveActivity?.filter(block => block.kind === 'compaction')).toHaveLength(1);
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
it('applies real permission modes with a precondition and refuses unknown modes', async () => {
  await workspace.create('main');
  await workspace.setPermission('read-only');
  expect(mock.sessions[0].permissionMode).toBe('read-only');
  expect(workspace.snapshot().permissionMode).toBe('read-only');
  expect(mock.responses.findLast((r) => r.method === 'sessions.patch')?.params).toMatchObject({ permissionMode: 'read-only', expectedPermissionMode: 'full' });
  await expect(workspace.setPermission('super-admin')).rejects.toThrow('INVALID_INPUT');
  await workspace.setPermission(null); expect(workspace.snapshot().permissionMode).toBeNull();
  mock.sessions[0].permissionMode = 'guarded';
  await expect(workspace.setPermission('full')).rejects.toThrow('PERMISSION_CONFLICT');
  expect(workspace.snapshot().permissionMode).toBeNull();
});
it('invokes the selected agent in a child session without changing the parent agent', async () => {
  mock.agents.push({ id: 'researcher', name: 'Исследователь' }); await workspace.refresh();
  await workspace.create('main'); const parent = workspace.snapshot().selected;
  await workspace.setPermission('read-only');
  await workspace.send('Проверь проект', 'invoke-agent', undefined, 'researcher');
  expect(mock.responses.findLast((r) => r.method === 'sessions.create')?.params).toMatchObject({ agentId: 'researcher', parentSessionKey: parent, spawnDepth: 1, permissionMode: 'read-only', message: 'Проверь проект', idempotencyKey: 'invoke-agent' });
  expect(workspace.snapshot().selected).not.toBe(parent);
  expect(mock.sessions[0].agentId).toBe('main');
});
