import { WebSocketServer, type WebSocket } from 'ws';
import { randomUUID, createPublicKey, verify, createHash } from 'node:crypto';
import { buildDeviceAuthPayloadV3 } from '@openclaw/gateway-client';
import { validateConnectParams, type ConnectParams, type HelloOk } from '@openclaw/gateway-protocol';
import type { AddressInfo } from 'node:net';
import * as protocol from '@openclaw/gateway-protocol';

function mergePatch(target: unknown, patch: unknown): unknown {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const output: Record<string, unknown> = target && typeof target === 'object' && !Array.isArray(target) ? { ...target as Record<string, unknown> } : {};
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === null) delete output[key]; else output[key] = mergePatch(output[key], value);
  }
  return output;
}

export function hello(role: string, protocol = 4): HelloOk {
  return {
    type: 'hello-ok', protocol,
    server: { version: '2026.8.1-test', connId: randomUUID() },
    features: { methods: ['node.invoke.result', 'approval.get', 'approval.resolve', 'approval.history', 'exec.approval.list', 'plugin.approval.list'], events: ['tick', 'node.invoke.request', 'exec.approval.requested'] },
    snapshot: { presence: [], health: {}, stateVersion: { presence: 1, health: 1 }, uptimeMs: 1 },
    auth: { deviceToken: `device-token-${role}`, role, scopes: role === 'operator' ? ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals', 'operator.pairing', 'operator.questions'] : [] },
    policy: { maxPayload: 1048576, maxBufferedBytes: 1048576, tickIntervalMs: 30000 },
  };
}

export type MockMode = 'ready' | 'pairing' | 'auth' | 'protocol' | 'silent';
export class MockGateway {
  readonly server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  readonly connects: ConnectParams[] = [];
  readonly responses: Array<Record<string, unknown>> = [];
  readonly signatureChecks: boolean[] = [];
  readonly nodes = new Map<WebSocket, string>();
  mode: MockMode = 'ready';
  readonly sessions: Array<{ key: string; label: string; agentId: string; pinned?: boolean; model?: string; thinkingLevel?: string; permissionMode?: string | null; spawnDepth?: number; execCwd?: string }> = [];
  readonly tasks: Array<Record<string, unknown>> = [];
  usageData: Record<string, unknown> = { sessions: [] };
  quotaData: Record<string, unknown> = { providers: [{ provider: 'test', displayName: 'Test provider', windows: [{ label: '5h', usedPercent: 25 }] }] };
  readonly models: Array<{ id: string; name: string; provider: string; contextWindow: number; reasoning: boolean; thinkingLevels?: { id: string; label: string }[]; thinkingDefault?: string }> = [{ id: 'test-model', name: 'Test Model', provider: 'test', contextWindow: 200000, reasoning: true, thinkingLevels: ['off', 'minimal', 'low', 'medium', 'high'].map(id => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) })) }];
  sessionThinkingOptions = ['off', 'low', 'high'];
  readonly projects: Array<{ id: string; displayName: string; repoRoot: string; source: string }> = [];
  workspaceContent = 'Original workspace text';
  configHash = 'config-v1';
  config: Record<string, unknown> = {
    memory: { search: { provider: 'none' } },
    gateway: { mode: 'local', cliAgents: false },
    ui: { enabled: false },
    messages: {},
    tts: { auto: 'off', persona: '', personas: {}, provider: '', providers: {}, enabled: false },
    talk: { activeProvider: '', providers: {}, realtime: { brain: 'agent-consult', mode: 'realtime', model: '', provider: '', providers: {}, speakerVoice: '' }, speechLocale: '' },
    agents: { defaults: { codeMode: 'off', swarm: false, model: { primary: 'test/test-model' } } },
    tools: { toolSearch: false, loopDetection: false, lightweightLocalModels: false },
    logging: { audit: { messages: 'off' } },
    desktop: { host: { enabled: false } },
    cloudWorkers: { desktopEnabled: false },
  };
  readonly secretEntries: Array<Record<string, unknown>> = [];
  readonly agents: Array<Record<string, unknown>> = [{ id: 'main', name: 'Assistant', workspace: 'C:/MockWorkspace', model: { primary: 'test/test-model' } }];
  readonly skills = [{ name: 'test-skill', skillKey: 'test-skill', description: 'Test skill', disabled: false, eligible: true, source: 'workspace' }];
  readonly plugins: Array<Record<string, unknown>> = [{ id: 'obsidian', name: 'Obsidian', description: 'Obsidian workspace integration', kind: ['integration'], origin: 'official', installed: true, enabled: true, state: 'enabled', removable: true, version: '1.0.0' }];
  readonly jobs: Array<Record<string, unknown>> = [];
  readonly files = new Map<string, string>();
  readonly histories = new Map<string, unknown[]>();
  readonly approvals = new Map<string, protocol.ApprovalSnapshot>();
  memoryContent = '# Memory\nTest note';
  embeddingReady = true;
  toolDenied = false;
  holdRun = false;
  deltaDelayMs = 40;
  readonly responseDelayMs = new Map<string, number>();
  assistantText = 'Hello from Gateway';
  readonly activeRuns = new Map<string, string>();
  private ticker: ReturnType<typeof setInterval>;
  constructor() {
    this.server.on('connection', (socket) => {
      const nonce = randomUUID();
      const timestamp = Date.now();
      if (this.mode !== 'silent') socket.send(JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce, ts: timestamp } }));
      socket.on('close', () => { this.nodes.delete(socket); });
      socket.on('message', (bytes) => {
        const frame = JSON.parse(bytes.toString()) as { id: string; method: string; params: unknown };
        if (frame.method !== 'connect') {
          this.responses.push({ method: frame.method, params: frame.params });
          const validatorName = ({ 'chat.send': 'validateChatSendParams', 'chat.history': 'validateChatHistoryParams', 'sessions.create': 'validateSessionsCreateParams', 'sessions.list': 'validateSessionsListParams', 'sessions.subscribe': 'validateSessionsSubscribeParams', 'sessions.messages.subscribe': 'validateSessionsMessagesSubscribeParams', 'sessions.messages.unsubscribe': 'validateSessionsMessagesUnsubscribeParams', 'sessions.abort': 'validateSessionsAbortParams', 'agents.files.get': 'validateAgentsFilesGetParams', 'agents.files.set': 'validateAgentsFilesSetParams', 'tools.invoke': 'validateToolsInvokeParams' } as Record<string, string>)[frame.method];
          const derivedValidator = 'validate' + frame.method.split('.').map((part) => part[0].toUpperCase() + part.slice(1)).join('') + 'Params';
          const validator = (protocol as unknown as Record<string, (input: unknown) => boolean>)[validatorName || derivedValidator];
          if (validator && !validator(frame.params)) { socket.send(JSON.stringify({ type: 'res', id: frame.id, ok: false, error: { code: 'INVALID_REQUEST', message: `Invalid ${frame.method} schema` } })); return; }
          if (frame.method === 'sessions.create' && frame.params && typeof frame.params === 'object' && 'projectId' in frame.params && 'cwd' in frame.params) { socket.send(JSON.stringify({ type: 'res', id: frame.id, ok: false, error: { code: 'INVALID_REQUEST', message: 'sessions.create projectId cannot be combined with cwd or execNode' } })); return; }
          const payload = this.request(frame.method, frame.params as Record<string, unknown>);
          const respond = () => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload })); };
          const delay = this.responseDelayMs.get(frame.method) ?? 0;
          if (delay > 0) setTimeout(respond, delay).unref(); else respond();
          return;
        }
        if (!validateConnectParams(frame.params)) {
          socket.send(JSON.stringify({ type: 'res', id: frame.id, ok: false, error: { code: 'INVALID_REQUEST', message: 'Invalid connect schema' } }));
          return;
        }
        const params = frame.params;
        this.connects.push(params);
        const device = params.device;
        if (device) {
          const token = params.auth?.deviceToken ?? params.auth?.token ?? params.auth?.bootstrapToken ?? null;
          const payload = buildDeviceAuthPayloadV3({
            deviceId: device.id, clientId: params.client.id, clientMode: params.client.mode,
            role: params.role ?? 'operator', scopes: params.scopes ?? [], signedAtMs: device.signedAt,
            token, nonce, platform: params.client.platform, deviceFamily: params.client.deviceFamily,
          });
          const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: device.publicKey }, format: 'jwk' });
          this.signatureChecks.push(device.nonce === nonce && device.signedAt === timestamp && verify(null, Buffer.from(payload), key, Buffer.from(device.signature, 'base64url')));
        } else this.signatureChecks.push(false);

        const errors = {
          pairing: { code: 'NOT_PAIRED', message: 'Pairing required', details: { code: 'PAIRING_REQUIRED', requestId: 'pairing-test-123' } },
          auth: { code: 'UNAUTHORIZED', message: 'Invalid token TEST_BOOTSTRAP_SECRET', details: { code: 'AUTH_TOKEN_MISMATCH' } },
          protocol: { code: 'INVALID_REQUEST', message: 'Protocol version mismatch', details: { code: 'PROTOCOL_VERSION_MISMATCH' } },
        };
        if (this.mode !== 'ready' && this.mode !== 'silent') {
          socket.send(JSON.stringify({ type: 'res', id: frame.id, ok: false, error: errors[this.mode] }));
          return;
        }
        socket.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: hello(params.role ?? 'operator') }));
        if (params.role === 'node' && device) this.nodes.set(socket, device.id);
      });
    });
    this.ticker = setInterval(() => {
      for (const socket of this.server.clients) if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'event', event: 'tick', payload: { ts: Date.now() } }));
    }, 1000);
    this.ticker.unref();
  }
  async url(): Promise<string> {
    if (!this.server.address()) await new Promise<void>((resolve) => this.server.once('listening', resolve));
    return `ws://127.0.0.1:${(this.server.address() as AddressInfo).port}/`;
  }
  broadcast(event: string, payload: unknown): void { for (const socket of this.server.clients) if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'event', event, payload })); }
  private request(method: string, params: Record<string, unknown>): unknown {
    if (method === 'exec.approval.list' || method === 'plugin.approval.list') return [...this.approvals.values()].filter((item) => item.status === 'pending' && method.startsWith(item.presentation.kind)).map((item) => ({ id: item.id, request: { env: { PRIVATE_ENV: 'NEVER_FORWARD' } } }));
    if (method === 'approval.get') return { approval: this.approvals.get(params.id as string) };
    if (method === 'approval.history') return { items: [...this.approvals.values()].filter((item) => item.status !== 'pending') };
    if (method === 'approval.resolve') {
      const approval = this.approvals.get(params.id as string);
      if (!approval || approval.status !== 'pending') return { applied: false, approval };
      const terminal = { ...approval, status: params.decision === 'deny' ? 'denied' : 'allowed', decision: params.decision, resolvedAtMs: Date.now(), reason: 'user' } as protocol.ApprovalSnapshot;
      this.approvals.set(approval.id, terminal); return { applied: true, approval: terminal };
    }
    if (method === 'config.get') return { hash: this.configHash, config: this.config };
    if (method === 'config.schema') return {
      version: 'test-schema', generatedAt: Date.now(),
      schema: { type: 'object', additionalProperties: false, properties: {
        gateway: { type: 'object', title: 'Gateway', properties: { mode: { type: 'string', enum: ['local', 'remote'] }, cliAgents: { type: 'boolean', title: 'CLI Agents Enabled' } }, additionalProperties: false },
        memory: { type: 'object', title: 'Memory', properties: { search: { type: 'object', title: 'Memory Search', properties: { provider: { type: 'string' }, apiKey: { type: 'string' } }, additionalProperties: false } }, additionalProperties: false },
        ui: { type: 'object', title: 'UI', properties: { enabled: { type: 'boolean' } }, additionalProperties: false },
        tts: { type: 'object', title: 'TTS', description: 'Text-to-speech policy for reading agent replies aloud on supported voice or audio surfaces.', properties: {
          auto: { type: 'string', title: 'Auto', enum: ['off', 'always', 'inbound', 'tagged'] },
          persona: { type: 'string', title: 'TTS Persona', description: 'Default TTS persona id. Local TTS persona preferences can override this per host.' },
          personas: { type: 'object', title: 'TTS Personas', description: 'Named TTS personas that define stable spoken identity plus provider-specific speech bindings.', additionalProperties: { type: 'object' } },
          provider: { type: 'string', title: 'Provider' },
          providers: { type: 'object', title: 'TTS Provider Settings', description: 'Provider-specific TTS settings keyed by speech provider id.', additionalProperties: { type: 'object' } },
          enabled: { type: 'boolean', title: 'Enabled' },
        }, additionalProperties: false },
        talk: { type: 'object', title: 'Talk', description: 'Voice and speech settings', properties: {
          activeProvider: { type: 'string', title: 'Talk Active Provider', description: 'Active Talk provider id.' },
          providers: { type: 'object', title: 'Talk Provider Settings', description: 'Provider-specific Talk settings keyed by provider id.', additionalProperties: { type: 'object' } },
          realtime: { type: 'object', title: 'Talk Realtime', description: 'Realtime Talk provider, model, voice, mode, transport, and brain strategy.', properties: {
            brain: { type: 'string', title: 'Talk Realtime Brain', enum: ['agent-consult', 'direct-tools', 'none'] },
            mode: { type: 'string', title: 'Talk Realtime Mode', enum: ['realtime', 'stt-tts', 'transcription'] },
            model: { type: 'string', title: 'Talk Realtime Model' }, provider: { type: 'string', title: 'Talk Realtime Provider' },
            providers: { type: 'object', title: 'Talk Realtime Provider Settings', additionalProperties: { type: 'object' } },
            speakerVoice: { type: 'string', title: 'Talk Realtime Speaker Voice' },
          }, additionalProperties: false },
          speechLocale: { type: 'string', title: 'Talk Speech Locale' },
        }, additionalProperties: false },
        agents: { type: 'object', title: 'Agents', properties: { defaults: { type: 'object', title: 'Agent Defaults', properties: {
          codeMode: { type: 'string', title: 'Code Mode', enum: ['off', 'auto'] }, swarm: { type: 'boolean', title: 'Swarm' },
        }, additionalProperties: false } }, additionalProperties: false },
        tools: { type: 'object', title: 'Tools', properties: {
          toolSearch: { type: 'boolean', title: 'Tool Search' }, loopDetection: { type: 'boolean', title: 'Tool Loop Detection' }, lightweightLocalModels: { type: 'boolean', title: 'Lightweight Local Model Tools' },
        }, additionalProperties: false },
        messages: { type: 'object', title: 'Messages', properties: {
          queue: { type: 'object', title: 'Queue', properties: {
            mode: { anyOf: ['steer', 'followup', 'collect', 'interrupt'].map(value => ({ type: 'string', const: value })) },
            byChannel: { type: 'object', additionalProperties: { type: 'string' } },
            drop: { type: 'string', enum: ['old', 'new', 'summarize'] },
          }, additionalProperties: false },
          ackReaction: { type: 'string' }, ackReactionScope: { type: 'string', enum: ['group-mentions', 'group-all', 'direct', 'all'] },
          removeAckAfterReply: { type: 'boolean' },
        }, additionalProperties: false },
        logging: { type: 'object', title: 'Logging', properties: { audit: { type: 'object', title: 'Audit Ledger', properties: { messages: { type: 'string', title: 'Message Audit Scope', enum: ['off', 'direct', 'all'] } }, additionalProperties: false } }, additionalProperties: false },
        desktop: { type: 'object', title: 'Desktop', properties: { host: { type: 'object', title: 'Gateway Host Desktop', properties: { enabled: { type: 'boolean', title: 'Gateway Host Desktop (Labs)' } }, additionalProperties: false } }, additionalProperties: false },
        cloudWorkers: { type: 'object', title: 'Cloud Workers', properties: { desktopEnabled: { type: 'boolean', title: 'Cloud Worker Desktop (Labs)' } }, additionalProperties: false },
      } },
      uiHints: { 'memory.search.apiKey': { sensitive: true, label: 'API key' }, 'tts.enabled': { advanced: true }, 'talk.realtime.providers': { advanced: true }, 'gateway.cliAgents': { label: 'CLI Agents Enabled' } },
    };
    if (method === 'config.schema.lookup') return { path: params.path, schema: { type: 'object' }, children: [] };
    if (method === 'config.patch') { if (params.baseHash !== this.configHash) return { ok: false }; this.config = mergePatch(this.config, JSON.parse(params.raw as string)) as Record<string, unknown>; this.configHash = randomUUID(); return { ok: true }; }
    if (method === 'secrets.store.list') return { entries: this.secretEntries };
    if (method === 'secrets.store.set') {
      const index = this.secretEntries.findIndex((entry) => entry.name === params.name);
      const entry = { name: params.name, kind: params.kind, scopeKind: 'team', scopeId: '', createdAtMs: Date.now(), updatedAtMs: Date.now(), ...(params.kind === 'env' ? { value: params.value } : {}), ...(params.allowedHosts ? { allowedHosts: params.allowedHosts } : {}) };
      if (index >= 0) this.secretEntries[index] = entry; else this.secretEntries.push(entry);
      return { ok: true, reloaded: true, warningCount: 0 };
    }
    if (method === 'secrets.store.delete') { const index = this.secretEntries.findIndex((entry) => entry.name === params.name); if (index >= 0) this.secretEntries.splice(index, 1); return { ok: true, reloaded: true, warningCount: 0 }; }
    if (method === 'users.self') return { profile: { id: 'profile-test', displayName: 'Test User', avatarMime: null, mergedInto: null, createdAt: 1, updatedAt: 1, emails: ['test@example.invalid'], githubIdentity: null, hasAvatar: false, role: 'owner' } };
    if (method === 'users.set-display-name') return { profile: { id: params.profileId, displayName: params.displayName, avatarMime: null, mergedInto: null, createdAt: 1, updatedAt: 2, emails: ['test@example.invalid'], githubIdentity: null, hasAvatar: false, role: 'owner' } };
    if (method === 'device.pair.list') return { pending: [], paired: [] };
    if (method.startsWith('device.pair.')) return { ok: true };
    if (method === 'logs.tail') return { file: 'gateway.log', cursor: 1, size: 20, lines: ['Gateway ready'], truncated: false };
    if (method === 'agents.list') return { defaultId: 'main', agents: this.agents };
    if (method === 'agents.create') { const id = `test-agent-${this.agents.length}`; this.agents.push({ id, ...params }); return { ok: true, agentId: id }; }
    if (method === 'agents.update') { const agent = this.agents.find((item) => item.id === params.agentId); if (agent) Object.assign(agent, params); return { ok: true }; }
    if (method === 'agents.delete') { const index = this.agents.findIndex((item) => item.id === params.agentId); if (index >= 0) this.agents.splice(index, 1); return { ok: true }; }
    if (method === 'models.list') return { models: this.models };
    if (method === 'tasks.list') return { tasks: this.tasks };
    if (method === 'tasks.cancel') { const task = this.tasks.find((t) => t.id === params.taskId); if (task) task.status = 'cancelled'; return { found: Boolean(task), cancelled: Boolean(task) }; }
    if (method === 'sessions.usage') return this.usageData;
    if (method === 'usage.status') return this.quotaData;
    if (method === 'models.probe') return { ok: true, results: [{ provider: params.provider, status: 'ok' }] };
    if (method === 'skills.status') return { skills: this.skills };
    if (method === 'skills.update') { const skill = this.skills.find((item) => item.skillKey === params.skillKey); if (skill) skill.disabled = params.enabled === false; return { ok: true }; }
    if (method === 'skills.search') return { results: [{ slug: 'example/test-skill', displayName: 'Catalog skill', summary: 'Test catalog entry' }] };
    if (method === 'skills.install') return { ok: true };
    if (method === 'plugins.list') return { plugins: this.plugins, diagnostics: [], mutationAllowed: true };
    if (method === 'plugins.search') return { results: [{ score: 1, package: { name: '@openclaw/github', displayName: 'GitHub', family: 'code-plugin', channel: 'official', isOfficial: true, summary: 'GitHub integration', latestVersion: '1.0.0', runtimeId: 'github' } }] };
    if (method === 'plugins.inspect') return { ok: true, plugin: this.plugins.find((item) => item.id === params.pluginId) || { id: params.pluginId, name: params.pluginId, installed: false, enabled: false }, source: { kind: 'official-catalog', spec: String(params.pluginId) }, declared: { channels: [], providers: [], tools: ['obsidian.read'], contracts: [], hooks: [], mcpServers: [], cliCommands: [], cliBackends: [], skills: [], dangerousConfigFlags: [] }, reviewToken: 'test-plugin-review', grants: { hooks: { allowPromptInjection: { effective: false }, allowConversationAccess: { effective: false } } }, trust: { disposition: 'clean', reasons: [] } };
    if (method === 'plugins.refresh') return { ok: true };
    if (method === 'plugins.install') { const id = String(params.pluginId || params.packageName); const plugin = this.plugins.find((item) => item.id === id); if (plugin) Object.assign(plugin, { installed: true, enabled: true, state: 'enabled' }); else this.plugins.push({ id, name: id, installed: true, enabled: true, state: 'enabled', removable: true }); return { ok: true, plugin: this.plugins.at(-1), restartRequired: true }; }
    if (method === 'plugins.setEnabled') { const plugin = this.plugins.find((item) => item.id === params.pluginId); if (plugin) Object.assign(plugin, { enabled: params.enabled, state: params.enabled ? 'enabled' : 'disabled' }); return { ok: true, plugin, restartRequired: true }; }
    if (method === 'plugins.uninstall') { const index = this.plugins.findIndex((item) => item.id === params.pluginId); if (index >= 0) this.plugins.splice(index, 1); return { ok: true, pluginId: params.pluginId, restartRequired: true, removed: [params.pluginId] }; }
    if (method === 'channels.status') return { channelAccounts: { telegram: [{ accountId: 'default', name: 'Test Telegram', running: true, connected: true }] } };
    if (method === 'cron.list') return { jobs: this.jobs };
    if (method === 'cron.add') { const job = { id: randomUUID(), ...params, state: {} }; this.jobs.push(job); return job; }
    if (method === 'cron.update') { const job = this.jobs.find((item) => item.id === params.id); if (job) Object.assign(job, params.patch); return job; }
    if (method === 'cron.remove') { const index = this.jobs.findIndex((item) => item.id === params.id); if (index >= 0) this.jobs.splice(index, 1); return { ok: true }; }
    if (method === 'cron.run') return { ok: true, ran: true };
    if (method === 'cron.runs') return { entries: [{ jobId: params.id, status: 'ok', summary: 'Completed' }] };
    if (method === 'sessions.list') return { sessions: this.sessions };
    if (method === 'projects.list') return { projects: this.projects };
    if (method === 'projects.register') { const project = { id: `project-${this.projects.length}`, displayName: params.name as string, repoRoot: params.path as string, source: 'registered' }; this.projects.push(project); return project; }
    if (method === 'sessions.files.list') return { sessionKey: params.sessionKey, root: 'C:/MockWorkspace', files: [], browser: { path: '', entries: [{ path: 'README.md', name: 'README.md', kind: 'file', size: 24 }] } };
    if (method === 'sessions.files.get') return { sessionKey: params.sessionKey, root: 'C:/MockWorkspace', file: { path: params.path, name: 'README.md', kind: 'read', missing: false, previewKind: 'text', content: this.workspaceContent, hash: createHash('sha256').update(this.workspaceContent).digest('hex') } };
    if (method === 'sessions.files.set') { if (params.expectedHash !== createHash('sha256').update(this.workspaceContent).digest('hex')) return { ok: false, error: { message: 'FILE_CONFLICT' } }; this.workspaceContent = params.content as string; return { ok: true }; }
    if (method === 'sessions.patch') { const session = this.sessions.find((item) => item.key === params.key); if (Object.hasOwn(params, 'expectedPermissionMode') && params.expectedPermissionMode !== (session?.permissionMode ?? null)) return { ok: false, error: { message: 'PERMISSION_CONFLICT' } }; if (session) Object.assign(session, params); return { ok: true, entry: session }; }
    if (method === 'sessions.delete') { const index = this.sessions.findIndex((item) => item.key === params.key); if (index >= 0) this.sessions.splice(index, 1); this.histories.delete(params.key as string); return { ok: true }; }
    if (method === 'sessions.create') {
      const key = `agent:${params.agentId}:pincer:${randomUUID()}`;
      this.sessions.push({ key, label: 'Test chat', agentId: params.agentId as string, model: 'test-model', permissionMode: params.permissionMode as string, spawnDepth: params.spawnDepth as number, execCwd: params.cwd as string || this.projects.find((project) => project.id === params.projectId)?.repoRoot }); this.histories.set(key, params.message ? [{ role: 'user', content: params.message, timestamp: Date.now() }] : []);
      return { ok: true, key };
    }
    if (method === 'chat.history') return { messages: this.histories.get(params.sessionKey as string) ?? [], hasMore: false, sessionInfo: { ...this.sessions.find((s) => s.key === params.sessionKey), modelProvider: 'test', thinkingOptions: this.sessionThinkingOptions, contextTokens: 200000, totalTokens: 12345, hasActiveRun: this.activeRuns.has(params.sessionKey as string), activeRunIds: this.activeRuns.has(params.sessionKey as string) ? [this.activeRuns.get(params.sessionKey as string)] : [] }, ...(this.activeRuns.has(params.sessionKey as string) ? { inFlightRun: { runId: this.activeRuns.get(params.sessionKey as string), text: 'Answer in progress' } } : {}) };
    if (method === 'chat.send') {
      const key = params.sessionKey as string; const runId = params.idempotencyKey as string;
      const history = this.histories.get(key) ?? []; history.push({ role: 'user', content: params.message, attachments: params.attachments, timestamp: Date.now() }); this.histories.set(key, history);
      this.activeRuns.set(key, runId);
      setTimeout(() => this.broadcast('chat', { sessionKey: key, runId, seq: 1, state: 'delta', deltaText: this.assistantText }), this.deltaDelayMs).unref();
      if (!this.holdRun) setTimeout(() => {
        history.push({ role: 'assistant', timestamp: Date.now(), model: 'test-model', provider: 'test', usage: { input: 52, output: 151, cacheRead: 10, cacheWrite: 0, totalTokens: 213 }, content: [{ type: 'text', text: this.assistantText }] });
        this.activeRuns.delete(key); this.broadcast('chat', { sessionKey: key, runId, seq: 2, state: 'final' });
      }, 300).unref();
      return { runId, status: 'started' };
    }
    if (method === 'sessions.abort') { this.activeRuns.delete(params.key as string); return { ok: true }; }
    if (method === 'agents.files.get') return { agentId: params.agentId, file: { missing: false, content: params.name === 'MEMORY.md' ? this.memoryContent : this.files.get(`${params.agentId}/${params.name}`) || '' } };
    if (method === 'agents.files.set') { if (params.name === 'MEMORY.md') this.memoryContent = params.content as string; else this.files.set(`${params.agentId}/${params.name}`, params.content as string); return { ok: true }; }
    if (method === 'doctor.memory.status') return { provider: this.embeddingReady ? 'openai' : 'none', embedding: { ok: this.embeddingReady, checked: true, ...(this.embeddingReady ? {} : { error: 'No embedding provider configured' }) } };
    if (method === 'tools.invoke') return this.toolDenied ? { ok: false, error: { message: 'Memory tool denied by policy' } } : { ok: true, output: { content: [{ type: 'text', text: JSON.stringify({ results: [{ path: 'MEMORY.md', snippet: this.memoryContent }], provider: this.embeddingReady ? 'openai' : 'none' }) }] } };
    return {};
  }
  invoke(command: string, overrideNodeId?: string): void {
    for (const [socket, nodeId] of this.nodes) socket.send(JSON.stringify({ type: 'event', event: 'node.invoke.request', payload: { id: randomUUID(), nodeId: overrideNodeId ?? nodeId, command, paramsJSON: '{}' } }));
  }
  drop(): void { for (const socket of this.server.clients) socket.close(1012, 'Gateway restarting'); }
  async close(): Promise<void> {
    clearInterval(this.ticker);
    for (const socket of this.server.clients) socket.terminate();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
