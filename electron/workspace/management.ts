import { createHash, randomUUID } from 'node:crypto';
import { validateAgentsCreateParams, validateAgentsUpdateParams, validateAgentsDeleteParams, validateCronAddParams, validateCronUpdateParams, validateSkillsUpdateParams } from '@openclaw/gateway-protocol';
import type { GatewayService } from '../gateway/service';
import { isRecord } from '../gateway/validation';
import { bounded } from './service';
import type { JobEdit, JsonRecord } from '../../shared/management';
const record = (value: unknown): JsonRecord => isRecord(value) ? value : {};
const hash = (content: string, missing: boolean) => createHash('sha256').update(JSON.stringify([content, missing])).digest('hex');
const personalityFiles = new Set(['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md', 'HEARTBEAT.md', 'MEMORY.md', 'BOOTSTRAP.md']);
/** Product-specific operations: renderer cannot supply an arbitrary RPC method. */
export class ManagementService {
  constructor(private gateway: Pick<GatewayService, 'operatorRequest'>) {}
  private async rpc(method: string, params: unknown = {}): Promise<JsonRecord> {
    const value = await this.gateway.operatorRequest(method, params);
    if (!isRecord(value)) throw new Error('INVALID_SERVER_RESPONSE');
    if (value.ok === false) throw new Error(typeof record(value.error).message === 'string' ? record(value.error).message as string : 'OPERATION_FAILED');
    return value;
  }
  async list(page: unknown, agentId: unknown): Promise<JsonRecord> {
    const agent = agentId ? { agentId: bounded(agentId) } : {};
    switch (page) {
      case 'models': return this.rpc('models.list', { ...agent, view: 'configured', includeProviderCapabilities: true });
      case 'agents': return this.rpc('agents.list');
      case 'subagents': return this.rpc('tasks.list', { limit: 200 });
      case 'channels': return this.rpc('channels.status', { probe: true, timeoutMs: 10000 });
      case 'skills': return this.rpc('skills.status', agent);
      case 'cron': return this.rpc('cron.list', { includeDisabled: true, limit: 200, sortBy: 'nextRunAtMs', sortDir: 'asc' });
      default: throw new Error('INVALID_PAGE');
    }
  }
  async saveAgent(id: unknown, input: unknown): Promise<void> {
    if (!isRecord(input) || JSON.stringify(input).length > 16000) throw new Error('INVALID_INPUT');
    const params = id === null ? input : { ...input, agentId: bounded(id) };
    if (!(id === null ? validateAgentsCreateParams(params) : validateAgentsUpdateParams(params))) throw new Error('INVALID_INPUT');
    // Gateway 2026.8.2 derives an ASCII id from name. Keep the user's Unicode
    // display name separate from a collision-resistant internal identifier.
    if (id === null && typeof input.name === 'string' && /[^\x00-\x7F]/.test(input.name)) {
      const created = await this.rpc('agents.create', { ...input, name: `agent-${randomUUID().slice(0, 8)}` });
      const agentId = bounded(created.agentId);
      try { await this.rpc('agents.update', { agentId, name: input.name }); }
      catch { throw new Error(`Агент ${agentId} создан, но имя не сохранено. Переименуйте его в списке / Agent created; rename it in the list.`); }
    } else await this.rpc(id === null ? 'agents.create' : 'agents.update', params);
  }
  async cancelSubagent(id: unknown): Promise<void> {
    const taskId = bounded(id);
    const listed = await this.list('subagents', undefined);
    const task = (Array.isArray(listed.tasks) ? listed.tasks : []).map(record).find((row) => row.id === taskId && (row.runtime === 'subagent' || String(row.kind || '').includes('subagent')));
    if (!task) throw new Error('SUBAGENT_NOT_FOUND');
    const result = await this.rpc('tasks.cancel', { taskId, reason: 'Cancelled from Pincer' });
    if (result.found === false || result.cancelled === false) throw new Error(String(result.reason || 'SUBAGENT_CANCEL_FAILED'));
  }
  usage(range: unknown): Promise<JsonRecord> {
    if (!['7d', '30d', 'all'].includes(String(range))) throw new Error('INVALID_INPUT');
    return this.rpc('sessions.usage', { range, agentScope: 'all', limit: 500, mode: 'gateway' });
  }
  async deleteAgent(agentId: unknown): Promise<void> {
    const params = { agentId: bounded(agentId), deleteFiles: false };
    if (!validateAgentsDeleteParams(params)) throw new Error('INVALID_INPUT');
    await this.rpc('agents.delete', params);
  }
  async agentFile(agentId: unknown, name: unknown): Promise<{ content: string; hash: string }> {
    const agent = bounded(agentId); const fileName = bounded(name, 64);
    if (!personalityFiles.has(fileName)) throw new Error('INVALID_FILE');
    const value = record((await this.rpc('agents.files.get', { agentId: agent, name: fileName })).file);
    if (typeof value.missing !== 'boolean') throw new Error('INVALID_FILE_RESPONSE');
    const content = typeof value.content === 'string' ? value.content : '';
    return { content, hash: hash(content, value.missing) };
  }
  private fileLocks = new Set<string>();
  async saveAgentFile(agentId: unknown, name: unknown, content: unknown, expectedHash: unknown): Promise<void> {
    const agent = bounded(agentId); const fileName = bounded(name, 64); const text = bounded(content, 200000, true); const expected = bounded(expectedHash, 64);
    const key = JSON.stringify([agent, fileName]);
    if (this.fileLocks.has(key)) throw new Error('FILE_BUSY');
    this.fileLocks.add(key);
    try {
      if ((await this.agentFile(agent, fileName)).hash !== expected) throw new Error('FILE_CONFLICT');
      await this.rpc('agents.files.set', { agentId: agent, name: fileName, content: text });
    } finally { this.fileLocks.delete(key); }
  }
  async setSkill(skillKey: unknown, enabled: unknown): Promise<void> {
    const params = { skillKey: bounded(skillKey), enabled };
    if (!validateSkillsUpdateParams(params)) throw new Error('INVALID_INPUT');
    await this.rpc('skills.update', params);
  }
  searchSkills(query: unknown): Promise<JsonRecord> { return this.rpc('skills.search', { query: bounded(query, 1000), limit: 30 }); }
  async installSkill(slug: unknown, agentId: unknown): Promise<void> { await this.rpc('skills.install', { source: 'clawhub', slug: bounded(slug, 512), agentId: bounded(agentId), timeoutMs: 120000 }); }
  async channelAction(channel: unknown, accountId: unknown, action: unknown): Promise<void> {
    if (action !== 'start' && action !== 'stop' && action !== 'logout') throw new Error('INVALID_ACTION');
    await this.rpc(`channels.${action}`, { channel: bounded(channel, 128), accountId: bounded(accountId, 256, true) });
  }
  async saveJob(id: unknown, input: unknown): Promise<void> {
    if (!isRecord(input) || Object.keys(input).some((key) => !['name', 'agentId', 'enabled', 'schedule', 'message'].includes(key))) throw new Error('INVALID_INPUT');
    const job = input as unknown as JobEdit;
    const base = { name: bounded(job.name, 512), agentId: bounded(job.agentId), enabled: job.enabled, schedule: job.schedule, payload: { kind: 'agentTurn', message: bounded(job.message, 100000) } };
    // Do not silently reset delivery, session placement or other options while editing.
    const params = id === null ? { ...base, sessionTarget: 'isolated', wakeMode: 'now', delivery: { mode: 'none' } } : { id: bounded(id), patch: base };
    if (!(id === null ? validateCronAddParams(params) : validateCronUpdateParams(params))) throw new Error('INVALID_INPUT');
    await this.rpc(id === null ? 'cron.add' : 'cron.update', params);
  }
  async toggleJob(id: unknown, enabled: unknown): Promise<void> {
    if (typeof enabled !== 'boolean') throw new Error('INVALID_INPUT');
    await this.rpc('cron.update', { id: bounded(id), patch: { enabled } });
  }
  async deleteJob(id: unknown): Promise<void> { await this.rpc('cron.remove', { id: bounded(id) }); }
  async runJob(id: unknown): Promise<void> { await this.rpc('cron.run', { id: bounded(id), mode: 'force' }); }
  jobRuns(id: unknown): Promise<JsonRecord> { return this.rpc('cron.runs', { id: bounded(id), limit: 100, sortDir: 'desc' }); }
  probeModel(provider: unknown, agentId: unknown): Promise<JsonRecord> { return this.rpc('models.probe', { provider: bounded(provider, 256), agentId: bounded(agentId), timeoutMs: 10000 }); }
}
