import { WebSocketServer, type WebSocket } from 'ws';
import { randomUUID, createPublicKey, verify } from 'node:crypto';
import { buildDeviceAuthPayloadV3 } from '@openclaw/gateway-client';
import { validateConnectParams, type ConnectParams, type HelloOk } from '@openclaw/gateway-protocol';
import type { AddressInfo } from 'node:net';
import * as protocol from '@openclaw/gateway-protocol';

export function hello(role: string, protocol = 4): HelloOk {
  return {
    type: 'hello-ok', protocol,
    server: { version: '2026.8.1-test', connId: randomUUID() },
    features: { methods: ['node.invoke.result'], events: ['tick', 'node.invoke.request'] },
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
  readonly sessions: Array<{ key: string; label: string; agentId: string }> = [];
  readonly histories = new Map<string, unknown[]>();
  memoryContent = '# Memory\nTest note';
  embeddingReady = true;
  toolDenied = false;
  holdRun = false;
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
          const validator = (protocol as unknown as Record<string, (input: unknown) => boolean>)[validatorName];
          if (validator && !validator(frame.params)) { socket.send(JSON.stringify({ type: 'res', id: frame.id, ok: false, error: { code: 'INVALID_REQUEST', message: `Invalid ${frame.method} schema` } })); return; }
          const payload = this.request(frame.method, frame.params as Record<string, unknown>);
          socket.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload }));
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
    if (method === 'agents.list') return { defaultId: 'main', agents: [{ id: 'main', name: 'Assistant' }] };
    if (method === 'sessions.list') return { sessions: this.sessions };
    if (method === 'sessions.create') {
      const key = `agent:main:pincer:${randomUUID()}`;
      this.sessions.push({ key, label: 'Test chat', agentId: 'main' }); this.histories.set(key, []);
      return { ok: true, key };
    }
    if (method === 'chat.history') return { messages: this.histories.get(params.sessionKey as string) ?? [], hasMore: false, sessionInfo: { hasActiveRun: this.activeRuns.has(params.sessionKey as string), activeRunIds: this.activeRuns.has(params.sessionKey as string) ? [this.activeRuns.get(params.sessionKey as string)] : [] }, ...(this.activeRuns.has(params.sessionKey as string) ? { inFlightRun: { runId: this.activeRuns.get(params.sessionKey as string), text: 'Answer in progress' } } : {}) };
    if (method === 'chat.send') {
      const key = params.sessionKey as string; const runId = params.idempotencyKey as string;
      const history = this.histories.get(key) ?? []; history.push({ role: 'user', content: params.message }); this.histories.set(key, history);
      this.activeRuns.set(key, runId);
      setTimeout(() => this.broadcast('chat', { sessionKey: key, runId, seq: 1, state: 'delta', deltaText: 'Hello from Gateway' }), 40).unref();
      if (!this.holdRun) setTimeout(() => {
        history.push({ role: 'assistant', content: [{ type: 'text', text: 'Hello from Gateway' }] });
        this.activeRuns.delete(key); this.broadcast('chat', { sessionKey: key, runId, seq: 2, state: 'final' });
      }, 300).unref();
      return { runId, status: 'started' };
    }
    if (method === 'sessions.abort') { this.activeRuns.delete(params.key as string); return { ok: true }; }
    if (method === 'agents.files.get') return { agentId: params.agentId, file: { missing: false, content: this.memoryContent } };
    if (method === 'agents.files.set') { this.memoryContent = params.content as string; return { ok: true }; }
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
