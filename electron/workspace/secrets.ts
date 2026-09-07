import type { GatewayService } from '../gateway/service';
import { isRecord } from '../gateway/validation';
import type { SecretStoreEntry, SecretStoreInput } from '../../shared/secrets';

const namePattern = /^[A-Z][A-Z0-9_]{0,127}$/;
const hostPattern = /^(?=.{1,253}$)(?:\[[0-9a-f:]+\]|localhost|(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.)*(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))$/i;

function mutation(value: unknown) {
  if (!isRecord(value) || value.ok !== true) throw new Error('OPERATION_FAILED');
  return { reloaded: value.reloaded === true, warningCount: typeof value.warningCount === 'number' ? value.warningCount : 0 };
}

function input(value: unknown): SecretStoreInput {
  if (!isRecord(value) || typeof value.name !== 'string' || !namePattern.test(value.name) || typeof value.value !== 'string' || value.value.length > 65536 || (value.kind !== 'secret' && value.kind !== 'env')) throw new Error('INVALID_SECRET');
  const allowedHosts = value.kind === 'secret' && Array.isArray(value.allowedHosts) ? [...new Set(value.allowedHosts.map(String).map((host) => host.trim().toLowerCase()).filter(Boolean))] : [];
  if (allowedHosts.length > 128 || allowedHosts.some((host) => !hostPattern.test(host))) throw new Error('INVALID_SECRET_HOST');
  return { name: value.name, value: value.value, kind: value.kind, ...(allowedHosts.length ? { allowedHosts } : {}) };
}

/** Dedicated shared secret-store surface. Secret/env values are never returned to Renderer. */
export class GatewaySecretsService {
  constructor(private gateway: Pick<GatewayService, 'operatorRequest'>) {}
  async list(): Promise<{ entries: SecretStoreEntry[] }> {
    const result = await this.gateway.operatorRequest('secrets.store.list', {});
    if (!isRecord(result) || !Array.isArray(result.entries)) throw new Error('SECRETS_UNAVAILABLE');
    const entries = result.entries.flatMap((raw): SecretStoreEntry[] => {
      if (!isRecord(raw) || typeof raw.name !== 'string' || !namePattern.test(raw.name) || (raw.kind !== 'secret' && raw.kind !== 'env')) return [];
      return [{
        name: raw.name,
        kind: raw.kind,
        createdAtMs: typeof raw.createdAtMs === 'number' ? raw.createdAtMs : 0,
        updatedAtMs: typeof raw.updatedAtMs === 'number' ? raw.updatedAtMs : 0,
        ...(typeof raw.updatedBy === 'string' ? { updatedBy: raw.updatedBy } : {}),
        allowedHosts: raw.kind === 'secret' && Array.isArray(raw.allowedHosts) ? raw.allowedHosts.filter((host): host is string => typeof host === 'string' && hostPattern.test(host)) : [],
      }];
    });
    return { entries };
  }
  async set(raw: unknown) {
    return mutation(await this.gateway.operatorRequest('secrets.store.set', input(raw)));
  }
  async setMany(raw: unknown) {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 128) throw new Error('INVALID_SECRET');
    let reloaded = false; let warningCount = 0;
    for (const item of raw) {
      const result = await this.set(item);
      reloaded ||= result.reloaded; warningCount += result.warningCount;
    }
    return { reloaded, warningCount };
  }
  async delete(raw: unknown) {
    if (typeof raw !== 'string' || !namePattern.test(raw)) throw new Error('INVALID_SECRET');
    return mutation(await this.gateway.operatorRequest('secrets.store.delete', { name: raw }));
  }
}
