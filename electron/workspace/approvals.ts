import { createHash } from 'node:crypto';
import {
  validateApprovalGetParams, validateApprovalGetResult, validateApprovalHistoryResult,
  validateApprovalResolveParams, validateApprovalResolveResult,
  type ApprovalSnapshot, type EventFrame,
} from '@openclaw/gateway-protocol';
import type { ApprovalItem, ApprovalState } from '../../shared/approvals';
import type { GatewayService } from '../gateway/service';
import { isRecord } from '../gateway/validation';

type Gateway = Pick<GatewayService, 'snapshot' | 'subscribe' | 'onOperatorEvent' | 'operatorRequest' | 'operatorMethods'>;
/** Incoming events are hints only. Decisions always use a freshly fetched reviewer-safe snapshot. */
export class ApprovalsService {
  private state: ApprovalState = { revision: 0, connected: false, items: [], error: null };
  private listeners = new Set<(state: ApprovalState) => void>();
  private epoch = 0;
  private endpoint = '';
  private fetching = new Map<string, number>();
  private sequence = 0;
  private resolving = new Set<string>();
  constructor(private gateway: Gateway) {
    gateway.onOperatorEvent((event) => this.event(event));
    gateway.subscribe((state) => {
      const endpoint = JSON.stringify(state.profile);
      const connected = state.operator.phase === 'connected';
      if (endpoint !== this.endpoint) { this.endpoint = endpoint; ++this.epoch; this.state.items = []; this.state.error = null; }
      if (connected !== this.state.connected) {
        ++this.epoch;
        this.state.connected = connected;
        if (connected) {
          for (const item of this.state.items) if (item.approval.status === 'pending') this.lookup(item.approval.id);
          this.recover();
        }
      }
      this.emit();
    });
  }
  snapshot(): ApprovalState { return structuredClone(this.state); }
  subscribe(listener: (state: ApprovalState) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit() { ++this.state.revision; for (const listener of this.listeners) listener(this.snapshot()); }
  private token(approval: ApprovalSnapshot): string { return createHash('sha256').update(JSON.stringify([this.endpoint, this.epoch, approval])).digest('hex'); }
  private remember(approval: ApprovalSnapshot): void {
    const item: ApprovalItem = { approval, reviewToken: this.token(approval) };
    const existing = this.state.items.find((entry) => entry.approval.id === approval.id);
    // A late history/get response must not resurrect a terminal request.
    if (existing && existing.approval.status !== 'pending' && approval.status === 'pending') return;
    this.state.items = [item, ...this.state.items.filter((entry) => entry.approval.id !== approval.id)]
      .sort((a, b) => Number(b.approval.status === 'pending') - Number(a.approval.status === 'pending') || b.approval.createdAtMs - a.approval.createdAtMs).slice(0, 100);
    this.emit();
  }
  private async get(id: string): Promise<ApprovalSnapshot> {
    if (!validateApprovalGetParams({ id }) || id.length > 1024) throw new Error('INVALID_APPROVAL');
    const value = await this.gateway.operatorRequest('approval.get', { id });
    if (!validateApprovalGetResult(value) || value.approval.id !== id) throw new Error('INVALID_APPROVAL_RESPONSE');
    return value.approval;
  }
  private lookup(id: string): void {
    const epoch = this.epoch; const sequence = ++this.sequence; this.fetching.set(id, sequence);
    void this.get(id).then((approval) => {
      if (epoch === this.epoch && this.fetching.get(id) === sequence) this.remember(approval);
    }).catch(() => {
      if (epoch === this.epoch) { this.state.error = 'APPROVAL_UNAVAILABLE'; this.emit(); }
    }).finally(() => { if (this.fetching.get(id) === sequence) this.fetching.delete(id); });
  }
  private event(event: EventFrame): void {
    if (event.event === 'pincer.gap') { for (const item of this.state.items) if (item.approval.status === 'pending') this.lookup(item.approval.id); this.recover(); return; }
    if (!['exec.approval.requested', 'exec.approval.resolved', 'plugin.approval.requested', 'plugin.approval.resolved', 'openclaw.approval.requested', 'openclaw.approval.resolved', 'session.approval'].includes(event.event)) return;
    const payload = isRecord(event.payload) ? event.payload : {};
    const approval = isRecord(payload.approval) ? payload.approval : payload;
    if (typeof approval.id === 'string' && approval.id.length <= 1024) this.lookup(approval.id);
  }
  private recover(): void {
    const epoch = this.epoch;
    void this.pending().catch(() => { if (epoch === this.epoch) { this.state.error = 'APPROVAL_UNAVAILABLE'; this.emit(); } });
  }
  private async pending(): Promise<void> {
    const epoch = this.epoch; const methods = this.gateway.operatorMethods();
    if (!methods.includes('approval.get')) return;
    for (const method of ['exec.approval.list', 'plugin.approval.list']) {
      if (!methods.includes(method)) continue;
      const values = await this.gateway.operatorRequest(method, {});
      if (epoch !== this.epoch) throw new Error('CONNECTION_CHANGED');
      if (!Array.isArray(values)) throw new Error('INVALID_APPROVAL_RESPONSE');
      // Legacy lists can contain runtime request details. Keep only IDs; never forward those payloads.
      for (const value of values.slice(0, 100)) if (isRecord(value) && typeof value.id === 'string' && value.id.length <= 1024) this.lookup(value.id);
    }
  }
  async refresh(): Promise<void> {
    const epoch = this.epoch; this.state.error = null;
    await this.pending();
    // approval.history contains terminal records only, never a list of all pending requests.
    const known = this.state.items.filter((item) => item.approval.status === 'pending').map((item) => item.approval.id);
    for (const id of known) { const approval = await this.get(id); if (epoch !== this.epoch) throw new Error('CONNECTION_CHANGED'); this.remember(approval); }
    const history = await this.gateway.operatorRequest('approval.history', { limit: 30 });
    if (epoch !== this.epoch) throw new Error('CONNECTION_CHANGED');
    if (!validateApprovalHistoryResult(history)) throw new Error('INVALID_APPROVAL_RESPONSE');
    for (const approval of history.items) this.remember(approval);
    this.emit();
  }
  async resolve(id: unknown, reviewToken: unknown, decision: unknown): Promise<void> {
    if (typeof id !== 'string' || typeof reviewToken !== 'string') throw new Error('INVALID_APPROVAL');
    const displayed = this.state.items.find((item) => item.approval.id === id);
    if (!displayed || displayed.reviewToken !== reviewToken || this.token(displayed.approval) !== reviewToken) throw new Error('APPROVAL_CHANGED');
    if (!this.state.connected) throw new Error('NOT_CONNECTED');
    if (this.resolving.has(id)) throw new Error('APPROVAL_BUSY');
    const epoch = this.epoch;
    this.resolving.add(id);
    try {
      const approval = await this.get(id);
      if (epoch !== this.epoch) throw new Error('CONNECTION_CHANGED');
      this.remember(approval);
      if (approval.status !== 'pending' || approval.expiresAtMs <= Date.now()) throw new Error('APPROVAL_FINISHED');
      if (this.token(approval) !== reviewToken) throw new Error('APPROVAL_CHANGED');
      const params = { id, kind: approval.presentation.kind, decision };
      if (!validateApprovalResolveParams(params) || !approval.presentation.allowedDecisions.some((option) => option === decision)) throw new Error('INVALID_DECISION');
      if (approval.presentation.kind === 'plugin' && approval.presentation.externalResolution?.decisions.some((option) => option === decision)) throw new Error('EXTERNAL_APPROVAL_REQUIRED');
      const result = await this.gateway.operatorRequest('approval.resolve', params);
      if (epoch !== this.epoch) throw new Error('CONNECTION_CHANGED');
      if (!validateApprovalResolveResult(result) || result.approval.id !== id) throw new Error('INVALID_APPROVAL_RESPONSE');
      this.remember(result.approval);
      if (!result.applied) throw new Error('APPROVAL_FINISHED');
    } finally { this.resolving.delete(id); }
  }
}
