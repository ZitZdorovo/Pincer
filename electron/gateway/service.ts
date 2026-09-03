import { GatewayClient, type GatewayClientOptions } from '@openclaw/gateway-client';
import { MIN_NODE_PROTOCOL_VERSION, PROTOCOL_VERSION } from '@openclaw/gateway-protocol';
import type { EventFrame } from '@openclaw/gateway-protocol';
import os from 'node:os';
import type { ConnectionInput, GatewayState, LinkState, Role } from '../../shared/contract';
import { connectionFailure } from './errors';
import { isRecord, parseConnection, sameProfile } from './validation';
import { Vault } from './vault';

// Full operator authority is requested, but actual grants remain Gateway-owned.
export const OPERATOR_SCOPES = [
  'operator.admin', 'operator.read', 'operator.write', 'operator.approvals', 'operator.pairing', 'operator.questions',
];
// Capabilities describe implemented code, not wishes or permission levels.
export const NODE_COMMANDS = ['device.info', 'device.status'];
// Version of the actual standalone transport shipped in this build, never copied from hello.
export const NODE_VERSION = '2026.8.2';

export interface Client {
  start(): void;
  stop(): void;
  stopAndWait(options?: { timeoutMs?: number }): Promise<void>;
  request(method: string, params?: unknown): Promise<unknown>;
}
export type ClientFactory = (options: GatewayClientOptions) => Client;
const terminal = (state: LinkState) => ['pairing-required', 'auth-error', 'incompatible'].includes(state.phase);

/** Fresh connection coordinator. No OpenX runtime, ACP, CLI or local Gateway. */
export class GatewayService {
  private clients: Partial<Record<Role, Client>> = {};
  private generation = 0;
  private listeners = new Set<(state: GatewayState) => void>();
  private eventListeners = new Set<(event: EventFrame) => void>();
  private methods: string[] = [];
  operatorMethods(): string[] { return [...this.methods]; }
  private state: GatewayState;
  private limits = { maxPayload: 25 * 1024 * 1024, maxBytes: 20 * 1024 * 1024, maxImageBytes: 6 * 1024 * 1024 };
  attachmentLimits() { return { ...this.limits }; }

  constructor(private readonly vault: Vault, version: string, private readonly factory: ClientFactory = (options) => new GatewayClient(options)) {
    this.state = {
      revision: 0, profile: vault.profile, hasCredential: Boolean(vault.credential),
      deviceId: vault.identity.deviceId, appVersion: version, nodeVersion: NODE_VERSION,
      operator: { phase: 'disconnected' }, node: { phase: 'disconnected' },
      nodeCommands: [...NODE_COMMANDS], requestedScopes: [...OPERATOR_SCOPES],
    };
  }
  snapshot(): GatewayState { return structuredClone(this.state); }
  onOperatorEvent(listener: (event: EventFrame) => void): () => void {
    this.eventListeners.add(listener);
    return () => { this.eventListeners.delete(listener); };
  }
  async operatorRequest(method: string, params: unknown = {}): Promise<unknown> {
    const client = this.clients.operator;
    const generation = this.generation;
    if (!client || this.state.operator.phase !== 'connected') throw new Error('NOT_CONNECTED');
    const result = await client.request(method, params);
    if (generation !== this.generation) throw new Error('CONNECTION_CHANGED');
    return result;
  }
  subscribe(listener: (state: GatewayState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async configure(input: ConnectionInput): Promise<GatewayState> {
    const parsed = parseConnection(input);
    const profile = { url: parsed.url, authMode: parsed.authMode, tlsFingerprint: parsed.tlsFingerprint };
    const credential = parsed.credential || (sameProfile(this.vault.profile, profile) ? this.vault.credential : '');
    if (!credential.trim()) throw new Error('CREDENTIAL_REQUIRED');
    await this.disconnect();
    this.vault.configure(profile, credential);
    return this.connectSaved();
  }

  connectSaved(): GatewayState {
    const profile = this.vault.profile;
    if (!profile || !this.vault.credential) throw new Error('CREDENTIAL_REQUIRED');
    if (Object.keys(this.clients).length) throw new Error('ALREADY_CONNECTING');
    const generation = ++this.generation;
    this.state.profile = profile;
    this.state.hasCredential = true;
    this.state.operator = { phase: 'connecting' };
    this.state.node = { phase: 'connecting' };
    this.emit();

    for (const role of ['operator', 'node'] as const) {
      const current = () => generation === this.generation;
      const options: GatewayClientOptions = {
        url: profile.url, tlsFingerprint: profile.tlsFingerprint,
        ...(profile.authMode === 'token' ? { token: this.vault.credential } : { password: this.vault.credential }),
        clientName: role === 'node' ? 'node-host' : 'gateway-client',
        clientDisplayName: `Pincer — ${os.hostname()}`,
        clientVersion: NODE_VERSION,
        clientBuildId: `pincer-${this.state.appVersion}`,
        platform: process.platform === 'win32' ? 'windows' : process.platform,
        deviceFamily: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'Mac' : 'Linux',
        mode: role === 'node' ? 'node' : 'ui', role,
        scopes: role === 'operator' ? [...OPERATOR_SCOPES] : [],
        caps: role === 'node' ? ['device'] : ['tool-events', 'approvals'],
        commands: role === 'node' ? [...NODE_COMMANDS] : undefined,
        minProtocol: role === 'node' ? MIN_NODE_PROTOCOL_VERSION : PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        deviceIdentity: this.vault.identity,
        instanceId: this.vault.identity.deviceId,
        hostDeps: this.vault.hostDeps(profile),
        requestTimeoutMs: 30000, connectChallengeTimeoutMs: 15000,
        notifyOnStartupRetry: true,
        onHelloOk: (hello) => {
          if (!current()) return;
          if (role === 'operator') {
            this.methods = [...hello.features.methods];
            this.limits = { maxPayload: hello.policy.maxPayload, maxBytes: hello.policy.attachments?.maxBytes ?? 20 * 1024 * 1024, maxImageBytes: hello.policy.attachments?.maxImageBytes ?? 6 * 1024 * 1024 };
          }
          this.set(role, {
            phase: 'connected', serverVersion: hello.server.version, protocol: hello.protocol,
            grantedScopes: hello.auth?.scopes ?? [], connectedAt: Date.now(),
          });
        },
        onConnectError: (error) => {
          if (!current()) return;
          this.set(role, connectionFailure(error, (text) => this.vault.redact(text)));
        },
        onReconnectPaused: (info) => {
          if (!current()) return;
          // Preserve the pairing request ID and structured auth/version error.
          if (!terminal(this.state[role])) {
            this.set(role, connectionFailure(Object.assign(new Error(info.reason), { code: info.detailCode ?? 'RECONNECT_PAUSED' }), (text) => this.vault.redact(text)));
          }
        },
        onClose: (_code, reason) => {
          if (!current() || terminal(this.state[role])) return;
          this.set(role, {
            phase: 'reconnecting',
            failure: this.state[role].failure ?? { code: 'CONNECTION_LOST', message: this.vault.redact(reason || 'Connection lost') },
          });
        },
        onEvent: (event) => {
          if (role === 'operator' && current()) for (const listener of this.eventListeners) listener(event);
          if (role === 'node' && current() && this.state.node.phase === 'connected') {
            void this.handleNodeEvent(event, generation);
          }
        },
        onGap: () => {
          if (role === 'operator' && current()) for (const listener of this.eventListeners) listener({ type: 'event', event: 'pincer.gap' });
        },
      };
      try {
        const client = this.factory(options);
        this.clients[role] = client;
        client.start();
      } catch (error) {
        this.set(role, connectionFailure(error, (text) => this.vault.redact(text)));
        this.clients[role]?.stop();
      }
    }
    return this.snapshot();
  }

  async disconnect(): Promise<GatewayState> {
    ++this.generation; // Stale callbacks cannot mutate the next endpoint's state.
    const clients = Object.values(this.clients);
    this.clients = {};
    for (const client of clients) client.stop();
    this.state.operator = { phase: 'disconnected' };
    this.state.node = { phase: 'disconnected' };
    this.emit();
    await Promise.all(clients.map((client) => client.stopAndWait({ timeoutMs: 1000 })));
    return this.snapshot();
  }

  private async handleNodeEvent(event: EventFrame, generation: number): Promise<void> {
    if (event.event !== 'node.invoke.request' || !isRecord(event.payload)) return;
    const { id, nodeId, command } = event.payload;
    if (typeof id !== 'string' || id.length === 0 || id.length > 256
        || nodeId !== this.vault.identity.deviceId || typeof command !== 'string') return;
    const client = this.clients.node;
    if (!client || generation !== this.generation) return;
    let result: Record<string, unknown>;
    // No shell, files, notifications or other features are silently implemented here.
    if (command === 'device.info') {
      result = { id, nodeId, ok: true, payload: {
        name: os.hostname(), platform: process.platform, arch: os.arch(),
        osVersion: os.release(), appVersion: this.state.appVersion,
      } };
    } else if (command === 'device.status') {
      result = { id, nodeId, ok: true, payload: {
        uptimeSeconds: os.uptime(), totalMemoryBytes: os.totalmem(), freeMemoryBytes: os.freemem(),
      } };
    } else {
      result = { id, nodeId, ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'This command is not implemented in Pincer stage 1.' } };
    }
    try { await client.request('node.invoke.result', result); }
    catch (error) {
      if (generation === this.generation && this.state.node.phase === 'connected') {
        this.set('node', { ...this.state.node, failure: connectionFailure(error, (text) => this.vault.redact(text)).failure });
      }
    }
  }
  private set(role: Role, state: LinkState): void { this.state[role] = state; this.emit(); }
  private emit(): void {
    this.state.revision += 1;
    for (const listener of this.listeners) listener(this.snapshot());
  }
}
