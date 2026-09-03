import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Cipher } from '../gateway/vault';
import type { QuotaSnapshot, QuotaWindow, ProviderQuota, QuotaSourceInput } from '../../shared/quotas';
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === 'string' ? v.slice(0, 300) : '';
const num = (v: unknown) => { const n = typeof v === 'string' && v.trim() ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined; };
const percent = (v: unknown) => num(v) === undefined ? undefined : Math.min(100, num(v)!);
const at = (v: unknown): number | undefined => {
  const numeric = num(v); const ms = numeric !== undefined ? numeric < 1e12 ? numeric * 1000 : numeric : typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(ms) && ms >= 0 && ms <= 8.64e15 ? ms : undefined;
};

export function gatewayQuotas(value: unknown): QuotaSnapshot {
  const v = rec(value);
  if (!Array.isArray(v.providers)) throw new Error('INVALID_QUOTA_RESPONSE');
  return { refreshing: v.refreshing === true, updatedAt: at(v.updatedAt), errors: [], providers: v.providers.slice(0, 200).map(entry => {
    const p = rec(entry);
    return { provider: str(p.provider), displayName: str(p.displayName) || str(p.provider), source: 'gateway' as const, plan: str(p.plan) || undefined, error: p.error ? 'PROVIDER_QUOTAS_UNAVAILABLE' : undefined, updatedAt: at(p.updatedAt ?? v.updatedAt), windows: (Array.isArray(p.windows) ? p.windows : []).slice(0, 500).map(entry => { const w = rec(entry); return { label: str(w.label), usedPercent: percent(w.usedPercent), resetAt: at(w.resetAt ?? w.resetsAt), unlimited: w.unlimited === true, accountName: str(w.accountName) || undefined, accountId: str(w.accountId) || undefined, model: str(w.model) || undefined }; }) };
  }).filter(p => p.provider) };
}
/** Exact OmniRoute cache/catalog schema, projected without account credentials. */
export function omniQuotas(limits: unknown, catalog: unknown): ProviderQuota[] {
  const connections = new Map((Array.isArray(rec(catalog).connections) ? rec(catalog).connections as unknown[] : []).map(v => { const r = rec(v); return [str(r.id), r]; }));
  const providers: ProviderQuota[] = [];
  for (const [id, value] of Object.entries(rec(rec(limits).caches)).slice(0, 500)) {
    const account = connections.get(id); if (!account) continue;
    const cache = rec(value); const windows: QuotaWindow[] = [];
    for (const [label, raw] of Object.entries(rec(cache.quotas)).slice(0, 500)) {
      const w = rec(raw); const total = num(w.total); const remaining = num(w.remaining); const used = num(w.used);
      const remainingPercent = percent(w.remainingPercentage);
      const usedPercent = remainingPercent !== undefined ? 100 - remainingPercent : total && used !== undefined ? percent(100 * used / total) : total && remaining !== undefined ? percent(Math.max(0, 100 - 100 * remaining / total)) : undefined;
      windows.push({ label: str(w.displayName) || label, usedPercent, resetAt: at(w.resetAt), unlimited: w.unlimited === true, accountId: id, accountName: str(account.name) || str(account.email) || undefined, model: str(w.model) || undefined });
    }
    providers.push({ provider: str(account.provider) || 'omniroute', displayName: str(account.provider) || 'OmniRoute', source: 'omniroute', windows, plan: str(cache.plan) || undefined, error: cache.error ? 'PROVIDER_QUOTAS_UNAVAILABLE' : undefined, updatedAt: at(cache.fetchedAt) });
  }
  return providers;
}
export function quotaUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('INVALID_QUOTA_URL');
  const url = new URL(value);
  if (url.username || url.password || url.hash || url.search || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('QUOTA_URL_REQUIRES_HTTPS_OR_LOOPBACK');
  url.pathname = url.pathname.replace(/\/(?:v1|api\/usage\/provider-limits)\/?$/, '').replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}
type Credential = { baseUrl: string; managementToken: string };
export class QuotaService {
  private credentials: Record<string, Credential> = {};
  private healthy = true;
  private configuring = false;
  private revision = 0;
  private requests = new Map<string, Promise<QuotaSnapshot>>();
  constructor(private gatewayRead: () => Promise<unknown>, private scope: () => string, private storage?: { path: string; cipher: Cipher }, private request: typeof fetch = fetch) {
    if (!storage || !existsSync(storage.path)) return;
    try {
      const v: unknown = JSON.parse(storage.cipher.decrypt(readFileSync(storage.path)));
      if (Object.keys(rec(v)).length > 200 || Object.entries(rec(v)).some(([key, raw]) => !/^[a-f0-9]{64}$/.test(key) || quotaUrl(rec(raw).baseUrl) !== rec(raw).baseUrl || typeof rec(raw).managementToken !== 'string')) throw new Error('INVALID_QUOTA_STORAGE');
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('INVALID_QUOTA_STORAGE');
      this.credentials = v as Record<string, Credential>;
    } catch { this.healthy = false; }
  }
  private key() { return createHash('sha256').update(this.scope()).digest('hex'); }
  settings() { if (!this.healthy) throw new Error('QUOTA_STORAGE_UNREADABLE'); const v = this.credentials[this.key()]; return { baseUrl: v?.baseUrl || '', configured: Boolean(v) }; }
  async configure(input: QuotaSourceInput) {
    if (this.configuring) throw new Error('QUOTA_CONFIGURATION_BUSY');
    this.configuring = true;
    try {
    if (!input || typeof input !== 'object' || Object.keys(input).some(k => !['baseUrl', 'managementToken', 'clear'].includes(k))) throw new Error('INVALID_INPUT');
    this.settings(); const key = this.key(); const previous = this.credentials[key]; const next = { ...this.credentials };
    if (input.clear === true) delete next[key];
    else {
      const baseUrl = quotaUrl(input.baseUrl);
      // A saved token must never be silently forwarded to a different endpoint.
      const token = input.managementToken || (previous?.baseUrl === baseUrl ? previous.managementToken : '');
      if (typeof token !== 'string' || !token.trim() || token.length > 8192 || /[\r\n]/.test(token)) throw new Error('OMNIROUTE_MANAGEMENT_TOKEN_REQUIRED');
      const credential = { baseUrl, managementToken: token.trim() };
      await this.omni(credential, false); next[key] = credential;
    }
    if (this.storage) { mkdirSync(dirname(this.storage.path), { recursive: true }); const staging = this.storage.path + '.tmp'; writeFileSync(staging, this.storage.cipher.encrypt(JSON.stringify(next)), { mode: 0o600 }); renameSync(staging, this.storage.path); }
    this.credentials = next;
    this.revision++;
    return this.settings();
    } finally { this.configuring = false; }
  }
  load(force: unknown = false): Promise<QuotaSnapshot> {
    if (typeof force !== 'boolean') return Promise.reject(new Error('INVALID_INPUT'));
    const key = this.key(); const requestKey = key + ':' + force + ':' + this.revision;
    const pending = this.requests.get(requestKey); if (pending) return pending;
    const credential = this.credentials[key];
    const promise = (async () => {
      const result: QuotaSnapshot = { providers: [], errors: [], refreshing: false };
      await this.gatewayRead().then(v => Object.assign(result, gatewayQuotas(v))).catch(() => result.errors.push('GATEWAY_QUOTAS_UNAVAILABLE'));
      if (!this.healthy) result.errors.push('QUOTA_STORAGE_UNREADABLE');
      else if (credential) {
        try { result.providers.push(...await this.omni(credential, force)); }
        catch (error) { result.errors.push(error instanceof Error ? error.message : 'OMNIROUTE_UNAVAILABLE'); }
      }
      return result;
    })().finally(() => { this.requests.delete(requestKey); });
    this.requests.set(requestKey, promise); return promise;
  }
  private async endpoint(credential: Credential, path: string, force = false): Promise<unknown> {
    try {
      const response = await this.request(credential.baseUrl + path, { method: force ? 'POST' : 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${credential.managementToken}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`OMNIROUTE_HTTP_${response.status}`);
      if (Number(response.headers.get('content-length')) > 2_000_000) throw new Error('OMNIROUTE_RESPONSE_TOO_LARGE');
      const reader = response.body?.getReader(); if (!reader) throw new Error('OMNIROUTE_INVALID_RESPONSE');
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2_000_000) { await reader.cancel(); throw new Error('OMNIROUTE_RESPONSE_TOO_LARGE'); } chunks.push(value); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) { const code = error instanceof Error && /^OMNIROUTE_[A-Z_0-9]+$/.test(error.message) ? error.message : 'OMNIROUTE_UNAVAILABLE'; throw new Error(code); }
  }
  private async omni(credential: Credential, force: boolean) {
    const [limits, accounts] = await Promise.all([this.endpoint(credential, '/api/usage/provider-limits', force), this.endpoint(credential, '/api/providers?limit=500')]);
    if (!rec(limits).caches || !Array.isArray(rec(accounts).connections)) throw new Error('OMNIROUTE_INVALID_RESPONSE');
    return omniQuotas(limits, accounts);
  }
}
