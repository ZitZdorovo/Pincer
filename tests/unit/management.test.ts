import { beforeEach, expect, it, vi } from 'vitest';
import * as protocol from '@openclaw/gateway-protocol';
import { ManagementService } from '../../electron/workspace/management';
let service: ManagementService;
const request = vi.fn(async (_method: string, _params: unknown): Promise<unknown> => ({ ok: true }));
beforeEach(() => { request.mockReset(); request.mockResolvedValue({ ok: true }); service = new ManagementService({ operatorRequest: request }); });
it('only maps known pages and rejects arbitrary RPC names', async () => {
  await expect(service.list('config.get', '')).rejects.toThrow('INVALID_PAGE');
  expect(request).not.toHaveBeenCalled();
  await service.list('cron', 'main'); expect(request).toHaveBeenCalledWith('cron.list', expect.objectContaining({ includeDisabled: true }));
});
it('validates agent forms with the pinned upstream schema and preserves files on deletion', async () => {
  await expect(service.saveAgent(null, { name: 'Valid', arbitrary: true })).rejects.toThrow('INVALID_INPUT');
  await service.saveAgent(null, { name: 'Research', workspace: 'C:/research' });
  expect(protocol.validateAgentsCreateParams(request.mock.calls[0][1])).toBe(true);
  await service.deleteAgent('research'); expect(request).toHaveBeenLastCalledWith('agents.delete', { agentId: 'research', deleteFiles: false });
});
it('does not overwrite personality files changed on the server', async () => {
  request.mockResolvedValueOnce({ file: { missing: false, content: 'before' } }); const file = await service.agentFile('main', 'SOUL.md');
  request.mockResolvedValueOnce({ file: { missing: false, content: 'remote edit' } });
  await expect(service.saveAgentFile('main', 'SOUL.md', 'local edit', file.hash)).rejects.toThrow('FILE_CONFLICT');
  expect(request.mock.calls.some(([method]) => method === 'agents.files.set')).toBe(false);
  await expect(service.agentFile('main', '../config.json')).rejects.toThrow('INVALID_FILE');
});
it('validates cron create and edit and does not reset delivery while editing', async () => {
  const input = { name: 'Daily report', agentId: 'main', enabled: true, schedule: { kind: 'cron', expr: '0 9 * * *', tz: 'Europe/Moscow' }, message: 'Report' };
  await service.saveJob(null, input); expect(protocol.validateCronAddParams(request.mock.calls[0][1])).toBe(true);
  await service.saveJob('job-1', input); expect(protocol.validateCronUpdateParams(request.mock.calls[1][1])).toBe(true);
  expect(request.mock.calls[1][1]).not.toHaveProperty('patch.delivery');
  await expect(service.saveJob(null, { ...input, schedule: { kind: 'every', everyMs: -1 } })).rejects.toThrow('INVALID_INPUT');
});
it('requires booleans for switches and explicit channel actions', async () => {
  await expect(service.setSkill('skill', 'false')).rejects.toThrow('INVALID_INPUT');
  await expect(service.toggleJob('job', 'false')).rejects.toThrow('INVALID_INPUT');
  await expect(service.channelAction('telegram', 'default', 'delete')).rejects.toThrow('INVALID_ACTION');
  expect(request).not.toHaveBeenCalled();
});
it('does not turn server policy refusal into success', async () => {
  request.mockResolvedValue({ ok: false, error: { message: 'Installation denied by policy' } });
  await expect(service.installSkill('example/skill', 'main')).rejects.toThrow('Installation denied by policy');
  expect(request).toHaveBeenCalledWith('skills.install', expect.not.objectContaining({ force: true }));
});
it('creates an internal ASCII id and preserves the exact Russian display name', async () => {
  request.mockResolvedValueOnce({ ok: true, agentId: 'generated-id' }).mockResolvedValueOnce({ ok: true });
  await service.saveAgent(null, { name: 'Исследователь Анна' });
  expect(request.mock.calls[0][0]).toBe('agents.create');
  expect(request.mock.calls[0][1]).toEqual({ name: expect.stringMatching(/^agent-[a-f0-9]{8}$/) });
  expect(request).toHaveBeenLastCalledWith('agents.update', { agentId: 'generated-id', name: 'Исследователь Анна' });
});
it('reports partial agent creation without deleting its files or creating it again', async () => {
  request.mockResolvedValueOnce({ agentId: 'new-agent' }).mockRejectedValueOnce(new Error('disconnected'));
  await expect(service.saveAgent(null, { name: 'Анна' })).rejects.toThrow('new-agent');
  expect(request.mock.calls.map(([method]) => method)).toEqual(['agents.create', 'agents.update']);
});
