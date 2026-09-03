import { createHash, randomUUID } from 'node:crypto';
import type { EventFrame } from '@openclaw/gateway-protocol';
import { validateSessionsCreateParams, validateProjectsRemoveParams, validateSessionsPatchParams } from '@openclaw/gateway-protocol';
import type { ChatMessage, MemoryFile, MemoryHealth, MemorySearch, WorkspaceState } from '../../shared/contract';
import { GatewayService } from '../gateway/service';
import { isRecord } from '../gateway/validation';
import { parseAttachments } from './attachments';
import { messageFiles } from './messages';
import { projectTranscript, tokenUsage, metric, timestamp, toolInput } from './transcript';
import { RunTiming } from './run-timing';
import { activityText } from './activity';

const record = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown): string => typeof value === 'string' ? value : '';
const permission = (value: unknown): import('../../shared/contract').PermissionMode | null => ['read-only', 'guarded', 'workspace', 'full'].includes(String(value)) ? value as import('../../shared/contract').PermissionMode : null;
export function bounded(value: unknown, max = 1024, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw new Error('INVALID_INPUT');
  return value;
}
export function messageText(value: unknown): string {
  if (typeof value === 'string') return value;
  const item = record(value);
  if (typeof item.content === 'string') return item.content;
  return list(item.content).filter((part) => record(part).type === 'text').map((part) => string(record(part).text)).join('\n');
}
function messages(value: unknown): ChatMessage[] {
  return projectTranscript(value);
}
const hash = (content: string, missing: boolean) => createHash('sha256').update(JSON.stringify([missing, content])).digest('hex');

/** Explicit product operations. This class is the only chat/memory RPC adapter. */
export class WorkspaceService {
  private state: WorkspaceState = { scope: '', revision: 0, loading: false, agents: [], agentId: '', sessions: [], selected: null, messages: [], activeRun: null, stream: '', tool: null, hasMore: false, error: null, models: [], model: null, thinking: null, projects: [], projectError: null };
  private listeners = new Set<(state: WorkspaceState) => void>();
  private epoch = 0;
  private endpoint = '';
  private connectedAt: number | undefined;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private sequence = new Map<string, number>();
  private nextOffset = 0;
  private rawHistory: unknown[] = [];
  private sending = false;
  private runsBySession = new Map<string, { id: string; startedAt?: number; phase: import('../../shared/contract').RunPhase }>();
  private historyLoad: { epoch: number; changed: boolean } | null = null;
  constructor(private gateway: GatewayService, private redact: (message: string) => string, private timing = new RunTiming()) {
    gateway.onOperatorEvent((event) => this.event(event));
    gateway.subscribe((state) => {
      const endpoint = JSON.stringify(state.profile);
      if (endpoint !== this.endpoint) {
        this.endpoint = endpoint;
        this.state.scope = createHash('sha256').update(endpoint).digest('hex');
        ++this.epoch;
        this.state = { ...this.state, agents: [], agentId: '', sessions: [], selected: null, messages: [], activeRun: null, stream: '', tool: null, error: null, hasMore: false, models: [], model: null, thinking: null, projects: [], projectError: null };
        this.sequence.clear(); this.runsBySession.clear(); this.rawHistory = []; this.state.liveTools = []; this.state.runStartedAt = undefined; this.state.permissionMode = 'full'; this.state.effectivePermissionMode = 'full'; this.state.contextTokens = undefined; this.state.contextWindow = undefined; this.state.thinkingOptions = []; this.state.spawnDepth = undefined;
        this.timing.clearActive(); this.state.runPhase = undefined; this.state.liveActivity = []; this.state.compaction = undefined;
        this.emit();
      }
      if (state.operator.phase !== 'connected') {
        if (this.connectedAt !== undefined) ++this.epoch;
        this.connectedAt = undefined;
      } else if (state.operator.connectedAt !== this.connectedAt) {
        this.connectedAt = state.operator.connectedAt;
        void this.refresh().catch((error) => this.fail(error));
      }
    });
  }
  snapshot(): WorkspaceState { return structuredClone(this.state); }
  subscribe(listener: (state: WorkspaceState) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private async rpc(method: string, params: unknown = {}) {
    const value = await this.gateway.operatorRequest(method, params);
    if (record(value).ok === false) throw new Error(string(record(record(value).error).message) || 'OPERATION_FAILED');
    return value;
  }
  async refresh(): Promise<void> {
    const epoch = this.epoch;
    this.state.loading = true; this.state.error = null; this.emit();
    try {
      const [agentsValue, sessionsValue] = await Promise.all([
        this.rpc('agents.list'), this.rpc('sessions.list', { limit: 100, includeDerivedTitles: true, includeLastMessage: true }),
      ]);
      if (epoch !== this.epoch) return;
      const agents = record(agentsValue);
      if (!Array.isArray(agents.agents) || !Array.isArray(record(sessionsValue).sessions)) throw new Error('INVALID_WORKSPACE_RESPONSE');
      this.state.agents = list(agents.agents).map((entry) => ({ id: string(record(entry).id), name: string(record(entry).name) || string(record(entry).id), thinkingOptions: list(record(entry).thinkingOptions).filter((option): option is string => typeof option === 'string') })).filter((agent) => agent.id);
      this.state.agentId = string(agents.defaultId) || this.state.agents[0]?.id || '';
      this.state.sessions = list(record(sessionsValue).sessions).map((entry) => {
        const item = record(entry);
        const key = string(item.key); const known = this.runsBySession.get(key);
        const serverRun = string(list(item.activeRunIds)[0]) || string(record(item.inFlightRun).runId);
        if (serverRun) this.runsBySession.set(key, { id: serverRun, startedAt: known?.startedAt ?? timestamp(item.runStartedAt ?? item.startedAt), phase: known?.phase ?? 'starting' });
        const run = serverRun ? this.runsBySession.get(key) : known;
        return { key, title: string(item.label) || string(item.derivedTitle) || string(item.displayName) || key, agentId: string(item.agentId) || undefined, pinned: item.pinned === true, updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : undefined, model: string(item.model) || undefined, cwd: string(item.execCwd) || string(item.spawnedCwd) || string(item.spawnedWorkspaceDir) || undefined, activeRunId: run?.id, runStartedAt: run?.startedAt, runPhase: run?.phase };
      }).filter((entry) => entry.key);
      const catalog = record(await this.rpc('models.list', { agentId: this.state.agentId, view: 'configured', includeProviderCapabilities: true }));
      if (epoch !== this.epoch) return;
      this.state.models = list(catalog.models).map((entry) => {
        const model = record(entry); const provider = string(model.provider); const id = string(model.id);
        return { id: provider && !id.startsWith(`${provider}/`) ? `${provider}/${id}` : id, name: string(model.name) || id, provider, contextWindow: typeof model.contextWindow === 'number' ? model.contextWindow : undefined, reasoning: model.reasoning === true };
      }).filter((model) => model.id);
      try {
        const projects = record(await this.rpc('projects.list'));
        if (epoch !== this.epoch) return;
        if (!Array.isArray(projects.projects)) throw new Error('PROJECTS_UNAVAILABLE');
        this.state.projects = projects.projects.map((entry) => { const project = record(entry); return { id: string(project.id), name: string(project.displayName), path: string(project.repoRoot) }; }).filter((project) => project.id);
        this.state.projectError = null;
      } catch (error) { if (epoch === this.epoch) this.state.projectError = this.redact(error instanceof Error ? error.message : 'PROJECTS_UNAVAILABLE'); }
      // Subscription is re-established after every transport reconnect.
      await this.rpc('sessions.subscribe', { limit: 100 });
      if (epoch !== this.epoch) return;
      if (this.state.selected) await this.select(this.state.selected);
    } catch (error) { if (epoch === this.epoch) { this.fail(error); throw error; } }
    finally { if (epoch === this.epoch) { this.state.loading = false; this.emit(); } }
  }
  async select(key: unknown): Promise<void> {
    const selected = bounded(key);
    const previous = this.state.selected;
    const previousRun = this.state.activeRun; const previousTools = this.state.liveTools; const previousActivity = this.state.liveActivity; const previousCompaction = this.state.compaction;
    const epoch = ++this.epoch;
    this.state.selected = selected;
    this.historyLoad = { epoch, changed: false };
    this.state.loading = true; this.state.error = null;
    if (previous !== selected) { this.state.messages = []; this.state.activeRun = null; this.state.stream = ''; this.state.tool = null; this.state.runStartedAt = undefined; this.state.runPhase = undefined; this.state.liveTools = []; this.state.liveActivity = []; this.state.compaction = undefined; }
    this.emit();
    try {
      if (previous && previous !== selected) await this.rpc('sessions.messages.unsubscribe', { key: previous });
      await this.rpc('sessions.messages.subscribe', { key: selected });
      const value = record(await this.rpc('chat.history', { sessionKey: selected, limit: 100 }));
      if (epoch !== this.epoch) return;
      this.rawHistory = list(value.messages);
      this.state.messages = this.timing.apply(this.state.scope, selected, messages(this.rawHistory));
      const info = record(value.sessionInfo);
      const session = this.state.sessions.find((item) => item.key === selected);
      const rawModel = string(info.modelOverride) || string(info.model) || string(value.model) || session?.model || '';
      const provider = string(info.providerOverride) || string(info.modelProvider) || string(value.modelProvider);
      const qualified = provider && !rawModel.startsWith(`${provider}/`) ? `${provider}/${rawModel}` : rawModel;
      this.state.model = this.state.models.find((m) => m.id === qualified)?.id || this.state.models.find((m) => m.id === rawModel || m.id.endsWith('/' + rawModel))?.id || qualified || null;
      this.state.thinking = string(info.thinkingLevel) || string(value.thinkingLevel) || string(info.thinkingDefault) || null;
      this.state.thinkingOptions = list(info.thinkingOptions ?? info.thinkingLevels).map((v) => string(v) || string(record(v).value) || string(record(v).id)).filter(Boolean);
      this.state.spawnDepth = metric(info.spawnDepth) ?? 0;
      this.state.permissionMode = permission(info.permissionMode ?? value.permissionMode);
      this.state.effectivePermissionMode = permission(info.effectivePermissionMode ?? value.effectivePermissionMode) ?? this.state.permissionMode ?? undefined;
      this.state.contextTokens = metric(info.totalTokens, value.totalTokens, record(value.usage).totalTokens);
      if (this.state.contextTokens === undefined) {
        const latest = [...this.rawHistory].reverse().map(record).find((row) => row.role === 'assistant' && tokenUsage(row.usage));
        const usage = tokenUsage(latest?.usage);
        if (usage) this.state.contextTokens = usage.totalTokens ?? (usage.input !== undefined ? usage.input + (usage.cacheRead || 0) + (usage.cacheWrite || 0) + (usage.output || 0) : undefined);
      }
      this.state.contextWindow = metric(info.contextTokens, value.contextTokens, info.contextWindow, value.contextWindow, this.state.models.find((m) => m.id === this.state.model)?.contextWindow);
      const inFlight = record(value.inFlightRun);
      this.state.activeRun = string(inFlight.runId) || string(list(info.activeRunIds)[0]) || null;
      if (this.state.activeRun) this.setSessionRun(selected, this.state.activeRun, this.timing.get(this.state.activeRun)?.phase ?? (inFlight.text ? 'responding' : 'starting'), this.timing.get(this.state.activeRun)?.started ?? timestamp(inFlight.startedAt ?? inFlight.startedAtMs));
      else this.setSessionRun(selected, null);
      const observed = this.timing.get(this.state.activeRun);
      this.state.runStartedAt = this.state.activeRun ? observed?.started ?? timestamp(inFlight.startedAt ?? inFlight.startedAtMs) ?? this.state.runStartedAt : undefined;
      this.state.runPhase = this.state.activeRun ? observed?.phase ?? (inFlight.text ? 'responding' : 'starting') : undefined;
      this.state.liveTools = this.state.activeRun && this.state.activeRun === previousRun ? previousTools ?? [] : [];
      this.state.stream = string(inFlight.text);
      this.state.liveActivity = this.state.activeRun && this.state.activeRun === previousRun ? previousActivity ?? [] : [];
      if (this.state.stream) activityText(this.state.liveActivity, this.state.stream);
      this.state.compaction = this.state.activeRun && this.state.activeRun === previousRun ? previousCompaction : undefined;
      this.state.tool = null;
      this.state.hasMore = value.hasMore === true;
      this.nextOffset = typeof value.nextOffset === 'number' ? value.nextOffset : this.state.messages.length;
    } catch (error) { if (epoch === this.epoch) { this.fail(error); throw error; } }
    finally {
      if (this.historyLoad?.epoch === epoch) {
        const changed = this.historyLoad.changed;
        this.historyLoad = null;
        if (changed && epoch === this.epoch) this.scheduleReload();
      }
      if (epoch === this.epoch) { this.state.loading = false; this.emit(); }
    }
  }
  async more(): Promise<void> {
    if (!this.state.selected || !this.state.hasMore || this.state.loading) return;
    const epoch = this.epoch;
    this.state.loading = true; this.emit();
    try {
      const value = record(await this.rpc('chat.history', { sessionKey: this.state.selected, limit: 100, offset: this.nextOffset }));
      if (epoch !== this.epoch) return;
      this.rawHistory = [...list(value.messages), ...this.rawHistory];
      this.state.messages = this.timing.apply(this.state.scope, this.state.selected!, messages(this.rawHistory));
      this.state.hasMore = value.hasMore === true;
      this.nextOffset = typeof value.nextOffset === 'number' ? value.nextOffset : this.nextOffset + list(value.messages).length;
    } finally { if (epoch === this.epoch) { this.state.loading = false; this.emit(); } }
  }
  async create(agentId: unknown, location: unknown = {}): Promise<void> {
    const agent = bounded(agentId);
    if (!isRecord(location) || Object.keys(location).some((key) => !['projectId', 'cwd'].includes(key))) throw new Error('INVALID_INPUT');
    const chosenMode = this.state.selected || this.state.permissionMode === undefined ? 'full' : this.state.permissionMode;
    const params = { ...location, agentId: agent, ...(chosenMode ? { permissionMode: chosenMode } : {}), idempotencyKey: randomUUID() };
    if (!validateSessionsCreateParams(params)) throw new Error('INVALID_INPUT');
    const value = record(await this.rpc('sessions.create', params));
    const key = bounded(value.key);
    await this.select(key);
    // Keep the new session immediately visible even before the broadcast/list catches up.
    if (!this.state.sessions.some((session) => session.key === key)) this.state.sessions.unshift({ key, title: key, agentId: agent, cwd: string(location.cwd) || this.state.projects.find((project) => project.id === location.projectId)?.path });
    this.emit();
  }
  async registerProject(name: unknown, path: unknown): Promise<void> {
    await this.rpc('projects.register', { name: bounded(name, 128), path: bounded(path, 8192) });
    await this.refresh();
  }
  async removeProject(id: unknown): Promise<void> {
    const params = { id: bounded(id, 64), deleteCheckout: false };
    if (!validateProjectsRemoveParams(params)) throw new Error('INVALID_INPUT');
    await this.rpc('projects.remove', params); await this.refresh();
  }
  async send(text: unknown, idempotencyKey: unknown, attachments?: unknown, targetAgentId?: unknown): Promise<void> {
    const message = bounded(text, 100000, true);
    const limits = this.gateway.attachmentLimits();
    const files = parseAttachments(attachments, limits);
    if (!message.trim() && !files.length) throw new Error('EMPTY_MESSAGE');
    const id = bounded(idempotencyKey, 128);
    if (!this.state.selected) throw new Error('SELECT_CHAT');
    if (this.sending || this.state.activeRun) throw new Error('RUN_ACTIVE');
    const key = this.state.selected; const epoch = this.epoch;
    if (targetAgentId !== undefined) {
      const agentId = bounded(targetAgentId);
      if (!this.state.agents.some((agent) => agent.id === agentId)) throw new Error('AGENT_NOT_FOUND');
      const params = { agentId, parentSessionKey: key, spawnDepth: (this.state.spawnDepth ?? 0) + 1, message, idempotencyKey: id, ...(files.length ? { attachments: files } : {}), ...(this.state.permissionMode ? { permissionMode: this.state.permissionMode } : {}) };
      if (!validateSessionsCreateParams(params)) throw new Error('INVALID_INPUT');
      this.sending = true;
      try {
        const created = record(await this.rpc('sessions.create', params));
        if (epoch !== this.epoch) return;
        const child = bounded(created.key); await this.select(child);
        if (!this.state.sessions.some((session) => session.key === child)) this.state.sessions.unshift({ key: child, title: message.slice(0, 100), agentId });
        this.emit();
      } finally { this.sending = false; }
      return;
    }
    const params = { sessionKey: key, message, idempotencyKey: id, ...(files.length ? { attachments: files } : {}) };
    if (Buffer.byteLength(JSON.stringify({ type: 'req', id: randomUUID(), method: 'chat.send', params }), 'utf8') > limits.maxPayload) throw new Error('MESSAGE_TOO_LARGE');
    this.sending = true; this.state.error = null;
    const started = Date.now();
    this.timing.begin(id, this.state.scope, key, { role: 'user', text: message, files: files.length ? messageFiles({ attachments: files }) : undefined }, this.state.messages, started);
    this.state.runStartedAt = started; this.state.runPhase = 'starting'; this.setSessionRun(key, id, 'starting', started); this.state.liveTools = []; this.state.liveActivity = []; this.state.compaction = undefined;
    try {
      const reply = record(await this.rpc('chat.send', params));
      this.timing.rename(id, string(reply.runId) || id);
      if (epoch !== this.epoch) return;
      this.state.activeRun = string(reply.runId) || this.state.activeRun;
      this.setSessionRun(key, this.state.activeRun || id, 'starting', started);
      const observed = this.timing.get(this.state.activeRun);
      this.state.runStartedAt = observed?.started ?? started; this.state.runPhase = observed?.phase ?? 'starting';
      this.state.messages.push({ role: 'user', text: message, ...(files.length ? { files: messageFiles({ attachments: files }) } : {}) });
      const session = this.state.sessions.find((entry) => entry.key === key);
      if (session?.title === key) session.title = message.split('\n')[0].slice(0, 100) || files[0]?.fileName || key;
      this.emit();
    } catch (error) {
      // No blind resend: a timeout may mean the server accepted the message.
      if (epoch === this.epoch) { this.fail(error); this.scheduleReload(); }
      throw error;
    } finally { this.sending = false; }
  }
  async abort(): Promise<void> {
    if (!this.state.activeRun || !this.state.selected) return;
    await this.rpc('sessions.abort', { key: this.state.selected, runId: this.state.activeRun });
    this.setSessionRun(this.state.selected, null);
    if (this.state.selected) await this.select(this.state.selected);
  }
  async setPermission(mode: unknown): Promise<void> {
    const key = this.state.selected; const epoch = this.epoch;
    if (mode !== null && permission(mode) === null) throw new Error('INVALID_INPUT');
    if (!key) { this.state.permissionMode = permission(mode); this.state.effectivePermissionMode = permission(mode) ?? undefined; this.emit(); return; }
    if (this.state.activeRun) throw new Error('RUN_ACTIVE');
    const params = { key, permissionMode: mode, expectedPermissionMode: this.state.permissionMode ?? null };
    if (!validateSessionsPatchParams(params)) throw new Error('INVALID_INPUT');
    await this.rpc('sessions.patch', params);
    if (epoch === this.epoch) { this.state.permissionMode = permission(mode); this.state.effectivePermissionMode = permission(mode) ?? undefined; this.emit(); }
  }
  async rename(key: unknown, title: unknown): Promise<void> {
    const selected = bounded(key); const label = bounded(title, 512).trim();
    await this.rpc('sessions.patch', { key: selected, label });
    const session = this.state.sessions.find((entry) => entry.key === selected);
    if (session) session.title = label;
    this.emit();
  }
  async pin(key: unknown, pinned: unknown): Promise<void> {
    if (typeof pinned !== 'boolean') throw new Error('INVALID_INPUT');
    const selected = bounded(key); await this.rpc('sessions.patch', { key: selected, pinned });
    const session = this.state.sessions.find((entry) => entry.key === selected);
    if (session) session.pinned = pinned;
    this.emit();
  }
  async remove(key: unknown): Promise<void> {
    const selected = bounded(key);
    // A deliberate UI confirmation is required before calling this operation.
    await this.rpc('sessions.delete', { key: selected, deleteTranscript: true });
    this.state.sessions = this.state.sessions.filter((entry) => entry.key !== selected);
    this.runsBySession.delete(selected);
    if (this.state.selected === selected) { ++this.epoch; this.state.selected = null; this.state.messages = []; this.state.activeRun = null; this.state.stream = ''; }
    this.emit();
  }
  async setModel(model: unknown, thinking?: unknown): Promise<void> {
    const selected = this.state.selected;
    if (!selected) throw new Error('SELECT_CHAT');
    if (this.state.activeRun) throw new Error('RUN_ACTIVE');
    const epoch = this.epoch;
    const id = bounded(model, 512); const effort = thinking === undefined ? undefined : bounded(thinking, 64);
    await this.rpc('sessions.patch', { key: selected, model: id, ...(effort ? { thinkingLevel: effort } : {}) });
    if (epoch === this.epoch) { this.state.model = id; if (effort) this.state.thinking = effort; this.state.contextWindow = this.state.models.find((model) => model.id === id)?.contextWindow; this.emit(); await this.select(selected); }
  }
  async setThinking(thinking: unknown): Promise<void> {
    const selected = this.state.selected; const epoch = this.epoch;
    if (!selected) throw new Error('SELECT_CHAT');
    if (this.state.activeRun) throw new Error('RUN_ACTIVE');
    const effort = bounded(thinking, 64);
    await this.rpc('sessions.patch', { key: selected, thinkingLevel: effort });
    if (epoch === this.epoch) { this.state.thinking = effort; this.emit(); }
  }
  async readMemory(agentId: unknown): Promise<MemoryFile> {
    const agent = bounded(agentId);
    const value = record(await this.rpc('agents.files.get', { agentId: agent, name: 'MEMORY.md' }));
    if (!isRecord(value.file) || typeof value.file.missing !== 'boolean') throw new Error('INVALID_MEMORY_RESPONSE');
    const content = string(value.file.content); const missing = value.file.missing;
    return { agentId: agent, content, missing, hash: hash(content, missing) };
  }
  private savingMemory = new Set<string>();
  async saveMemory(agentId: unknown, content: unknown, expectedHash: unknown): Promise<MemoryFile> {
    const agent = bounded(agentId); const text = bounded(content, 200000, true); const expected = bounded(expectedHash, 64);
    if (this.savingMemory.has(agent)) throw new Error('MEMORY_BUSY');
    this.savingMemory.add(agent);
    try {
      const current = await this.readMemory(agent);
      if (current.hash !== expected) throw new Error('MEMORY_CONFLICT');
      await this.rpc('agents.files.set', { agentId: agent, name: 'MEMORY.md', content: text });
      return this.readMemory(agent);
    } finally { this.savingMemory.delete(agent); }
  }
  async memoryStatus(agentId: unknown, probe: unknown): Promise<MemoryHealth> {
    if (typeof probe !== 'boolean') throw new Error('INVALID_INPUT');
    const result = record(await this.rpc('doctor.memory.status', { agentId: bounded(agentId), ...(probe ? { probe: true } : {}) }));
    const embedding = record(result.embedding);
    return { provider: string(result.provider) || null, checked: embedding.checked !== false && typeof embedding.ok === 'boolean', ready: embedding.ok === true && result.provider !== 'none', error: string(embedding.error) || null };
  }
  async searchMemory(agentId: unknown, query: unknown): Promise<MemorySearch> {
    const value = record(await this.rpc('tools.invoke', { name: 'memory_search', agentId: bounded(agentId), args: { query: bounded(query, 4000), maxResults: 8 } }));
    if (value.ok !== true) throw new Error(string(record(value.error).message) || 'MEMORY_SEARCH_UNAVAILABLE');
    const output = value.output;
    const text = messageText(output) || JSON.stringify(output ?? {} , null, 2);
    let metadata = record(record(output).details);
    try { metadata = { ...metadata, ...record(JSON.parse(text)) }; } catch { /* Plain text tool result. */ }
    if (metadata.disabled === true || metadata.unavailable === true) throw new Error(string(metadata.error) || 'MEMORY_SEARCH_UNAVAILABLE');
    return { text, semantic: metadata.provider === 'none' || metadata.mode === 'fts-only' ? false : typeof metadata.provider === 'string' ? true : null };
  }
  private event(event: EventFrame): void {
    const payload = record(event.payload);
    const runId = string(payload.runId);
    const sessionKey = string(payload.sessionKey) || string(payload.key);
    const terminal = event.event === 'chat' && ['final', 'aborted', 'error'].includes(string(payload.state));
    // Observe timing even while another chat is selected or history is in flight.
    const observed = this.timing.get(runId);
    if (observed?.scope === this.state.scope && observed.session === payload.sessionKey) {
      if (terminal) this.timing.finish(runId);
      if (event.event === 'agent' && payload.stream === 'tool') this.timing.phase(runId, 'working');
      else if ((event.event === 'chat' && payload.state === 'delta') || (event.event === 'agent' && ['assistant', 'reasoning'].includes(string(payload.stream)))) this.timing.phase(runId, 'responding');
    }
    if (event.event === 'pincer.gap') { this.scheduleReload(); return; }
    if (event.event === 'session.message' || event.event === 'sessions.messages') { if (payload.key === this.state.selected || payload.sessionKey === this.state.selected) this.scheduleReload(); return; }
    const trackedSessionRun = Boolean(sessionKey && runId);
    if (trackedSessionRun) {
      if (terminal) this.setSessionRun(sessionKey, null);
      else {
        const phase = event.event === 'agent' && payload.stream === 'tool'
          ? 'working'
          : ((event.event === 'chat' && payload.state === 'delta') || (event.event === 'agent' && ['assistant', 'reasoning'].includes(string(payload.stream))))
            ? 'responding'
            : this.runsBySession.get(sessionKey)?.phase ?? 'starting';
        this.setSessionRun(sessionKey, runId, phase, observed?.started);
      }
    }
    if (payload.sessionKey !== this.state.selected) {
      // A terminal event for a background session must immediately refresh its
      // sidebar badge even though that chat is not currently rendered.
      if (trackedSessionRun) this.emit();
      return;
    }
    // Match the installed Control UI contract: end alone is NOT success.
    if (event.event === 'agent' && payload.stream === 'compaction' && runId) {
      if (this.state.activeRun && this.state.activeRun !== runId) return;
      const data = record(payload.data); const blocks = this.state.liveActivity ??= [];
      let block = blocks.findLast(b => b.kind === 'compaction' && b.id.startsWith(runId + ':'));
      if (data.phase === 'start') {
        if (block?.kind !== 'compaction' || block.phase !== 'running') { block = { kind: 'compaction', id: `${runId}:${blocks.length}`, phase: 'running' }; blocks.push(block); }
      } else if (data.phase === 'end') {
        if (data.completed !== true) {
          if (block) blocks.splice(blocks.indexOf(block), 1);
          this.state.compaction = undefined; this.emit(); return;
        }
        if (block?.kind !== 'compaction') { block = { kind: 'compaction', id: `${runId}:${blocks.length}`, phase: data.willRetry === true ? 'running' : 'completed' }; blocks.push(block); }
        block.phase = data.willRetry === true ? 'running' : 'completed';
      } else return;
      if (block?.kind === 'compaction') this.state.compaction = { id: block.id, phase: block.phase };
      this.emit(); return;
    }
    // History is authoritative. A racing delta may already be included in its snapshot;
    // reload once after hydration instead of appending it twice or losing a final event.
    if (this.historyLoad) { this.historyLoad.changed = true; return; }
    if (!runId) return;
    if (event.event === 'agent' && payload.stream === 'tool') {
      this.state.activeRun = runId; this.state.runStartedAt ??= observed?.started;
      this.state.runPhase = 'working';
      const data = record(payload.data); const id = string(data.toolCallId) || string(data.id);
      this.state.tool = string(data.name) || 'tool';
      if (id) {
        const tools = this.state.liveTools ??= [];
        let tool = tools.find((item) => item.id === id);
        if (!tool) { tool = { id, name: this.state.tool, input: '', output: '', status: 'running' }; tools.push(tool); (this.state.liveActivity ??= []).push({ kind: 'tool', toolId: id }); }
        if (data.args !== undefined || data.input !== undefined) tool.input = toolInput(data.args ?? data.input);
        if (data.result !== undefined || data.partialResult !== undefined) tool.output = messageText(data.result ?? data.partialResult) || JSON.stringify(data.result ?? data.partialResult, null, 2);
        if (data.phase === 'result' || data.phase === 'end') tool.status = data.isError === true ? 'failed' : 'completed';
      }
      this.emit(); return;
    }
    if (event.event !== 'chat') {
      if (event.event === 'agent' && payload.stream === 'lifecycle' && this.state.compaction?.phase === 'running' && ['end', 'error'].includes(string(record(payload.data).phase))) {
        const block = (this.state.liveActivity ?? []).find(b => b.kind === 'compaction' && b.id === this.state.compaction!.id);
        const phase = record(payload.data).phase === 'error' ? 'failed' : 'completed';
        if (block?.kind === 'compaction') block.phase = phase;
        this.state.compaction = { ...this.state.compaction, phase }; this.emit(); return;
      }
      if (event.event === 'agent' && ['assistant', 'reasoning'].includes(string(payload.stream))) {
        if (this.state.runPhase !== 'working') this.state.runPhase = 'responding';
        if (payload.stream === 'assistant') activityText(this.state.liveActivity ??= [], string(record(payload.data).text));
        this.emit();
      }
      return;
    }
    const seq = typeof payload.seq === 'number' ? payload.seq : 0;
    const previous = this.sequence.get(runId) ?? -1;
    if (seq <= previous) return;
    this.sequence.set(runId, seq);
    if (this.sequence.size > 200) this.sequence.delete(this.sequence.keys().next().value!);
    if (previous >= 0 && seq > previous + 1) this.scheduleReload();
    if (payload.state === 'delta') {
      this.state.activeRun = runId;
      this.state.runStartedAt ??= observed?.started;
      if (this.state.runPhase !== 'working') this.state.runPhase = 'responding';
      const fullText = messageText(payload.message);
      this.state.stream = fullText || (payload.replace ? string(payload.deltaText) : this.state.stream + string(payload.deltaText));
      activityText(this.state.liveActivity ??= [], this.state.stream);
    } else if (payload.state === 'status') { this.state.activeRun = runId; this.state.runStartedAt ??= observed?.started; this.state.runPhase ??= 'starting'; }
    else if (['final', 'aborted', 'error'].includes(string(payload.state))) {
      const finalText = messageText(payload.message) || this.state.stream;
      activityText(this.state.liveActivity ??= [], finalText);
      if (finalText || this.state.liveTools?.length || this.state.liveActivity?.length) this.state.messages.push({ role: 'assistant', text: this.state.liveActivity.filter(b => b.kind === 'text').map(b => b.text).join('\n\n') || finalText, tools: this.state.liveTools, activity: this.state.liveActivity, usage: tokenUsage(record(payload.message).usage), durationMs: observed?.duration ?? (this.state.runStartedAt !== undefined ? Math.max(0, Date.now() - this.state.runStartedAt) : undefined) });
      this.state.activeRun = null; this.state.stream = ''; this.state.tool = null;
      this.state.runStartedAt = undefined; this.state.runPhase = undefined; this.state.liveTools = []; this.state.liveActivity = [];
      if (payload.state === 'error') this.fail(new Error(string(payload.errorMessage) || 'CHAT_FAILED'));
      this.scheduleReload();
    }
    this.emit();
  }
  private setSessionRun(key: string, runId: string | null, phase: import('../../shared/contract').RunPhase = 'starting', startedAt?: number): void {
    if (runId) {
      const previous = this.runsBySession.get(key);
      this.runsBySession.set(key, { id: runId, phase: previous?.id === runId && previous.phase === 'working' ? 'working' : phase, startedAt: previous?.id === runId ? previous.startedAt ?? startedAt : startedAt });
    } else this.runsBySession.delete(key);
    const run = this.runsBySession.get(key); const session = this.state.sessions.find((entry) => entry.key === key);
    if (session) { session.activeRunId = run?.id; session.runStartedAt = run?.startedAt; session.runPhase = run?.phase; }
  }
  private scheduleReload(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => { this.refreshTimer = undefined; if (this.state.selected) void this.select(this.state.selected).catch((error) => this.fail(error)); }, 250);
    this.refreshTimer.unref();
  }
  private fail(error: unknown): void { this.state.error = { code: 'WORKSPACE_ERROR', message: this.redact(error instanceof Error ? error.message : 'WORKSPACE_ERROR') }; this.emit(); }
  private emit(): void { this.state.revision++; for (const listener of this.listeners) listener(this.snapshot()); }
}
