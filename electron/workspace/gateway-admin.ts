import type { GatewayService } from '../gateway/service';
import { isRecord } from '../gateway/validation';
import { bounded } from './service';
import type { DevicePair, DevicesSnapshot, GatewayLogTail, UserProfile } from '../../shared/gateway-admin';
const rec = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const str = (value: unknown) => typeof value === 'string' ? value : '';
const list = (value: unknown) => Array.isArray(value) ? value : [];
const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
function profile(value: unknown): UserProfile {
  const raw = rec(rec(value).profile || value); const github = rec(raw.githubIdentity);
  if (!str(raw.id)) throw new Error('PROFILE_UNAVAILABLE');
  return { id: str(raw.id), displayName: typeof raw.displayName === 'string' ? raw.displayName : null, emails: list(raw.emails).filter((v): v is string => typeof v === 'string' && v.length <= 320), ...(str(github.login) ? { github: { login: str(github.login), profileUrl: str(github.profileUrl) } } : {}), ...(str(raw.role) ? { role: str(raw.role) } : {}), hasAvatar: raw.hasAvatar === true };
}
function pair(value: unknown): DevicePair | null {
  const raw = rec(value); const deviceId = str(raw.deviceId); if (!deviceId) return null;
  return { ...(str(raw.requestId) ? { requestId: str(raw.requestId) } : {}), deviceId, displayName: str(raw.displayName) || str(raw.operatorLabel) || str(raw.clientId) || deviceId, ...(str(raw.platform) ? { platform: str(raw.platform) } : {}), ...(str(raw.clientId) ? { clientId: str(raw.clientId) } : {}), roles: list(raw.roles).filter((v): v is string => typeof v === 'string').slice(0, 32), scopes: list(raw.scopes).filter((v): v is string => typeof v === 'string').slice(0, 64), ...(typeof raw.connected === 'boolean' ? { connected: raw.connected } : {}), ...(num(raw.approvedAtMs) !== undefined ? { approvedAtMs: num(raw.approvedAtMs) } : {}), ...(num(raw.lastSeenAtMs) !== undefined ? { lastSeenAtMs: num(raw.lastSeenAtMs) } : {}) };
}
export class GatewayAdminService {
  constructor(private gateway: Pick<GatewayService, 'operatorRequest'>, private redact: (value: string) => string) {}
  async profile(): Promise<UserProfile> { return profile(await this.gateway.operatorRequest('users.self', {})); }
  async setDisplayName(id: unknown, displayName: unknown): Promise<UserProfile> {
    const profileId = bounded(id, 256); const name = displayName === null ? null : bounded(displayName, 120, true).trim() || null;
    return profile(await this.gateway.operatorRequest('users.set-display-name', { profileId, displayName: name }));
  }
  async devices(): Promise<DevicesSnapshot> {
    const raw = rec(await this.gateway.operatorRequest('device.pair.list', {}));
    return { pending: list(raw.pending).map(pair).filter((v): v is DevicePair => !!v), paired: list(raw.paired).map(pair).filter((v): v is DevicePair => !!v) };
  }
  async deviceAction(action: unknown, id: unknown, label?: unknown): Promise<void> {
    if (!['approve', 'reject', 'remove', 'rename'].includes(String(action))) throw new Error('INVALID_ACTION');
    const value = bounded(id, 256);
    const method = action === 'approve' ? 'device.pair.approve' : action === 'reject' ? 'device.pair.reject' : action === 'remove' ? 'device.pair.remove' : 'device.pair.rename';
    const params = action === 'approve' || action === 'reject' ? { requestId: value } : action === 'rename' ? { deviceId: value, label: bounded(label, 120) } : { deviceId: value };
    await this.gateway.operatorRequest(method, params);
  }
  async logs(cursor: unknown = 0): Promise<GatewayLogTail> {
    const position = cursor === undefined ? 0 : typeof cursor === 'number' && Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : (() => { throw new Error('INVALID_CURSOR'); })();
    const raw = rec(await this.gateway.operatorRequest('logs.tail', { cursor: position, limit: 500, maxBytes: 262144 }));
    if (!Array.isArray(raw.lines) || num(raw.cursor) === undefined || num(raw.size) === undefined) throw new Error('LOGS_UNAVAILABLE');
    return { cursor: num(raw.cursor)!, size: num(raw.size)!, lines: raw.lines.filter((v): v is string => typeof v === 'string').slice(-500).map(line => this.redact(line).slice(0, 16000)), truncated: raw.truncated === true };
  }
}
