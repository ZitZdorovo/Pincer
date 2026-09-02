import { createHash, randomUUID } from 'node:crypto';
import type { EventFrame } from '@openclaw/gateway-protocol';
import type { ChatMessage, MemoryFile, MemoryHealth, MemorySearch, WorkspaceState } from '../../shared/contract';
import { GatewayService } from '../gateway/service';
import { isRecord } from '../gateway/validation';

const record = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown): string => typeof value === 'string' ? value : '';
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
  return list(value).map((item) => ({ role: string(record(item).role) || 'assistant', text: messageText(item) })).filter((item) => item.text);
}
const hash = (content: string, missing: boolean) => createHash('sha256').update(JSON.stringify([missing, content])).digest('hex');

/** Explicit product operations. This class is the only chat/memory RPC adapter. */
export class WorkspaceService {
  private state: WorkspaceState = { revision: 0, loading: false, agents: [], agentId: '', sessions: [], selected: null, messages: [], activeRun: null, stream: '', tool: null, hasMore: false, error: null };
  private listeners = new Set<(state: WorkspaceState) => void>();
  private epoch = 0;
  private endpoint = '';
  private connectedAt: number | undefined;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private sequence = new Map<string, number>();
  private nextOffset = 0;
  private sending = false;
  private historyLoad: { epoch: number; changed: boolean } | null = null;
  constructor(private gateway: GatewayService, private redact: (message: string) => string) {
    gateway.onOperatorEvent((event) => this.event(event));
    gateway.subscribe((state) => {
      const endpoint = JSON.stringify(state.profile);
      if (endpoint !== this.endpoint) {
        this.endpoint = endpoint;
        ++this.epoch;
        this.state = { ...this.state, agents: [], agentId: '', sessions: [], selected: null, messages: [], activeRun: null, stream: '', tool: null, error: null, hasMore: false };
        this.sequence.clear();
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
  private rpc(method: string, params: unknown = {}) { return this.gateway.operatorRequest(method, params); }
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
      this.state.agents = list(agents.agents).map((entry) => ({ id: string(record(entry).id), name: string(record(entry).name) || string(record(entry).id) })).filter((agent) => agent.id);
      this.state.agentId = string(agents.defaultId) || this.state.agents[0]?.id || '';
      this.state.sessions = list(record(sessionsValue).sessions).map((entry) => {
        const item = record(entry);
        return { key: string(item.key), title: string(item.label) || string(item.derivedTitle) || string(item.displayName) || string(item.key), agentId: string(item.agentId) || undefined };
      }).filter((entry) => entry.key);
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
    const epoch = ++this.epoch;
    this.state.selected = selected;
    this.historyLoad = { epoch, changed: false };
    this.state.loading = true; this.state.error = null;
    if (previous !== selected) { this.state.messages = []; this.state.activeRun = null; this.state.stream = ''; this.state.tool = null; }
    this.emit();
    try {
      if (previous && previous !== selected) await this.rpc('sessions.messages.unsubscribe', { key: previous });
      await this.rpc('sessions.messages.subscribe', { key: selected });
      const value = record(await this.rpc('chat.history', { sessionKey: selected, limit: 100 }));
      if (epoch !== this.epoch) return;
      this.state.messages = messages(value.messages);
      const info = record(value.sessionInfo);
      const inFlight = record(value.inFlightRun);
      this.state.activeRun = string(inFlight.runId) || string(list(info.activeRunIds)[0]) || null;
      this.state.stream = string(inFlight.text);
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
      this.state.messages = [...messages(value.messages), ...this.state.messages];
      this.state.hasMore = value.hasMore === true;
      this.nextOffset = typeof value.nextOffset === 'number' ? value.nextOffset : this.nextOffset + list(value.messages).length;
    } finally { if (epoch === this.epoch) { this.state.loading = false; this.emit(); } }
  }
  async create(agentId: unknown): Promise<void> {
    const agent = bounded(agentId);
    const value = record(await this.rpc('sessions.create', { agentId: agent, permissionMode: 'full', idempotencyKey: randomUUID() }));
    const key = bounded(value.key);
    await this.select(key);
    // Keep the new session immediately visible even before the broadcast/list catches up.
    if (!this.state.sessions.some((session) => session.key === key)) this.state.sessions.unshift({ key, title: key, agentId: agent });
    this.emit();
  }
  async send(text: unknown, idempotencyKey: unknown): Promise<void> {
    const message = bounded(text, 100000);
    const id = bounded(idempotencyKey, 128);
    if (!this.state.selected) throw new Error('SELECT_CHAT');
    if (this.sending || this.state.activeRun) throw new Error('RUN_ACTIVE');
    const key = this.state.selected; const epoch = this.epoch;
    this.sending = true; this.state.error = null;
    try {
      const reply = record(await this.rpc('chat.send', { sessionKey: key, message, idempotencyKey: id }));
      if (epoch !== this.epoch) return;
      this.state.activeRun = string(reply.runId) || this.state.activeRun;
      this.state.messages.push({ role: 'user', text: message });
      const session = this.state.sessions.find((entry) => entry.key === key);
      if (session?.title === key) session.title = message.split('\n')[0].slice(0, 100);
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
    if (this.state.selected) await this.select(this.state.selected);
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
    if (event.event === 'pincer.gap') { this.scheduleReload(); return; }
    if (event.event === 'session.message' || event.event === 'sessions.messages') { if (payload.key === this.state.selected || payload.sessionKey === this.state.selected) this.scheduleReload(); return; }
    if (payload.sessionKey !== this.state.selected) return;
    // History is authoritative. A racing delta may already be included in its snapshot;
    // reload once after hydration instead of appending it twice or losing a final event.
    if (this.historyLoad) { this.historyLoad.changed = true; return; }
    const runId = string(payload.runId);
    if (!runId) return;
    if (event.event === 'agent' && payload.stream === 'tool') {
      this.state.tool = string(record(payload.data).name) || 'tool'; this.emit(); return;
    }
    if (event.event !== 'chat') return;
    const seq = typeof payload.seq === 'number' ? payload.seq : 0;
    const previous = this.sequence.get(runId) ?? -1;
    if (seq <= previous) return;
    this.sequence.set(runId, seq);
    if (this.sequence.size > 200) this.sequence.delete(this.sequence.keys().next().value!);
    if (previous >= 0 && seq > previous + 1) this.scheduleReload();
    if (payload.state === 'delta') {
      this.state.activeRun = runId;
      const fullText = messageText(payload.message);
      this.state.stream = fullText || (payload.replace ? string(payload.deltaText) : this.state.stream + string(payload.deltaText));
    } else if (payload.state === 'status') this.state.activeRun = runId;
    else if (['final', 'aborted', 'error'].includes(string(payload.state))) {
      const finalText = messageText(payload.message) || this.state.stream;
      if (finalText) this.state.messages.push({ role: 'assistant', text: finalText });
      this.state.activeRun = null; this.state.stream = ''; this.state.tool = null;
      if (payload.state === 'error') this.fail(new Error(string(payload.errorMessage) || 'CHAT_FAILED'));
      this.scheduleReload();
    }
    this.emit();
  }
  private scheduleReload(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => { this.refreshTimer = undefined; if (this.state.selected) void this.select(this.state.selected).catch((error) => this.fail(error)); }, 250);
    this.refreshTimer.unref();
  }
  private fail(error: unknown): void { this.state.error = { code: 'WORKSPACE_ERROR', message: this.redact(error instanceof Error ? error.message : 'WORKSPACE_ERROR') }; this.emit(); }
  private emit(): void { this.state.revision++; for (const listener of this.listeners) listener(this.snapshot()); }
}
