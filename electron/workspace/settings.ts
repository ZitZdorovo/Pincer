import { randomUUID } from 'node:crypto';
import type { GatewayService } from '../gateway/service';
import { isRecord } from '../gateway/validation';
import { bounded } from './service';
import { isProtectedSetting, resolveSchema, settingHint, type JsonSchema, type JsonValue, type SettingHint, type SettingsCatalog, type SettingsDocument } from '../../shared/settings';

const rec = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const secretName = /(?:api[-_]?key|password|secret|token|authorization|credential|private[-_]?key)/i;
const unsafeKey = (key: string) => ['__proto__', 'prototype', 'constructor'].includes(key);
type Lease = { scope: string; root: string; hash: string; protected: Map<string, { path: string; value: JsonValue }>; original: JsonValue };
/** Complete schema-backed configuration surface. No arbitrary RPC exposed to Renderer. */
export class GatewaySettingsService {
  private leases = new Map<string, Lease>();
  private schemaCache: { scope: string; value: Promise<{ schema: JsonSchema; hints: Record<string, SettingHint>; version: string }> } | null = null;
  constructor(private gateway: Pick<GatewayService, 'operatorRequest' | 'snapshot'>) {}
  private scope() { const s = this.gateway.snapshot(); if (s.operator.phase !== 'connected') throw new Error('NOT_CONNECTED'); return JSON.stringify([s.profile, s.operator.connectedAt]); }
  private check(scope: string) { if (scope !== this.scope()) throw new Error('CONNECTION_CHANGED'); }
  private schema() {
    const scope = this.scope();
    if (this.schemaCache?.scope === scope) return this.schemaCache.value;
    const value = (async () => {
      const result = rec(await this.gateway.operatorRequest('config.schema', {}));
      this.check(scope);
      if (!isRecord(result.schema) || !isRecord(result.schema.properties)) throw new Error('SETTINGS_SCHEMA_UNAVAILABLE');
      return { schema: result.schema as JsonSchema, hints: rec(result.uiHints) as Record<string, SettingHint>, version: typeof result.version === 'string' ? result.version : '' };
    })();
    this.schemaCache = { scope, value };
    void value.catch(() => { if (this.schemaCache?.value === value) this.schemaCache = null; });
    return value;
  }
  async catalog(): Promise<SettingsCatalog> {
    const scope = this.scope(); const { schema, version } = await this.schema(); this.check(scope);
    return { version, roots: Object.entries(schema.properties!).filter(([key]) => !unsafeKey(key)).map(([key, node]) => ({ key, title: node.title || key, description: node.description || '' })) };
  }
  async section(input: unknown): Promise<SettingsDocument> {
    const root = bounded(input, 128); if (unsafeKey(root) || root.includes('.')) throw new Error('INVALID_SETTING_ROOT');
    const scope = this.scope(); const full = await this.schema(); this.check(scope);
    const schema = full.schema.properties![root]; if (!schema) throw new Error('UNKNOWN_SETTING_ROOT');
    const snapshot = rec(await this.gateway.operatorRequest('config.get', {})); this.check(scope);
    if (typeof snapshot.hash !== 'string' || !isRecord(snapshot.config)) throw new Error('CONFIG_UNAVAILABLE');
    const hints = Object.fromEntries(Object.entries(full.hints).filter(([path]) => path === root || path.startsWith(root + '.')));
    const original = snapshot.config[root] as JsonValue ?? {};
    const lease: Lease = { scope, root, hash: snapshot.hash, protected: new Map(), original };
    const mask = (value: JsonValue, rawSchema: JsonSchema, path: string[], inheritedSensitive = false): JsonValue => {
      const node = resolveSchema(rawSchema, value);
      const sensitive = inheritedSensitive || settingHint(hints, path).sensitive === true || node.format === 'password' || (typeof value === 'string' && (secretName.test(path.at(-1)!) || path.some(k => ['env', 'headers'].includes(k)))) || (typeof value === 'string' && /__OPENCLAW_REDACTED__|^\$\{/.test(value));
      if (sensitive && value !== null && value !== '' && typeof value !== 'boolean' && typeof value !== 'number') {
        const marker = `__PINCER_PROTECTED_${randomUUID()}__`;
        lease.protected.set(marker, { path: JSON.stringify(path), value }); return marker;
      }
      if (Array.isArray(value)) return value.map((v, i) => mask(v, node.items || {}, [...path, String(i)]));
      if (isRecord(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => !unsafeKey(key)).map(([key, v]) => [key, mask(v as JsonValue, node.properties?.[key] || (isRecord(node.additionalProperties) ? node.additionalProperties as JsonSchema : {}), [...path, key])]));
      return value;
    };
    const value = mask(original, schema, [root]); const id = randomUUID();
    this.leases.set(id, lease); while (this.leases.size > 24) this.leases.delete(this.leases.keys().next().value!);
    return { lease: id, root, hash: snapshot.hash, schema, hints, value, protectedValues: [...lease.protected.keys()] };
  }
  async save(id: unknown, incoming: unknown): Promise<void> {
    const lease = this.leases.get(bounded(id, 128)); if (!lease) throw new Error('SETTINGS_RELOAD_REQUIRED');
    this.check(lease.scope);
    if (JSON.stringify(incoming)?.length > 4_000_000) throw new Error('SETTINGS_TOO_LARGE');
    let nodes = 0;
    const restore = (value: unknown, path: string[]): JsonValue => {
      if (++nodes > 100000 || path.length > 64) throw new Error('SETTINGS_TOO_LARGE');
      if (isProtectedSetting(value)) {
        const stored = lease.protected.get(value);
        if (!stored || stored.path !== JSON.stringify(path)) throw new Error('SECRET_REFERENCE_MOVED');
        return stored.value;
      }
      if (typeof value === 'string' && value.includes('__PINCER_PROTECTED_')) throw new Error('INVALID_SECRET_REFERENCE');
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
      if (Array.isArray(value)) return value.map((v, i) => restore(v, [...path, String(i)]));
      if (!isRecord(value) || Object.keys(value).some(unsafeKey)) throw new Error('INVALID_SETTINGS');
      return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, restore(v, [...path, key])]));
    };
    const value = restore(incoming, [lease.root]);
    // Never retain credentials while redirecting their containing provider/connection.
    const guardDestination = (before: unknown, after: unknown, raw: unknown): void => {
      if (!isRecord(before) || !isRecord(after) || !isRecord(raw)) return;
      const moved = Object.keys(after).some(k => /(?:url|endpoint|host)$/i.test(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      if (moved && JSON.stringify(raw).includes('__PINCER_PROTECTED_')) throw new Error('NEW_DESTINATION_REQUIRES_NEW_KEY');
      for (const key of Object.keys(after)) {
        if (Array.isArray(after[key])) (after[key] as unknown[]).forEach((v, i) => guardDestination((before[key] as unknown[])?.[i], v, (raw[key] as unknown[])?.[i]));
        else guardDestination(before[key], after[key], raw[key]);
      }
    };
    guardDestination(lease.original, value, incoming);
    const current = rec(await this.gateway.operatorRequest('config.get', {})); this.check(lease.scope);
    if (current.hash !== lease.hash) throw new Error('CONFIG_CONFLICT');
    try {
      const result = rec(await this.gateway.operatorRequest('config.patch', { baseHash: lease.hash, raw: JSON.stringify({ [lease.root]: value }), replacePaths: [lease.root], note: 'Pincer settings' }));
      if (result.ok === false) throw new Error('SETTINGS_SAVE_FAILED');
    } catch { throw new Error('SETTINGS_SAVE_FAILED'); } // Remote validation can echo newly entered secrets.
    this.leases.delete(id as string);
  }
}
