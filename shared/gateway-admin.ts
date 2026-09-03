export type UserProfile = { id: string; displayName: string | null; emails: string[]; github?: { login: string; profileUrl: string }; role?: string; hasAvatar: boolean };
export type DevicePair = { requestId?: string; deviceId: string; displayName: string; platform?: string; clientId?: string; roles: string[]; scopes: string[]; connected?: boolean; approvedAtMs?: number; lastSeenAtMs?: number };
export type DevicesSnapshot = { pending: DevicePair[]; paired: DevicePair[] };
export type GatewayLogTail = { cursor: number; size: number; lines: string[]; truncated: boolean };
export type GatewayAdminApi = {
  profile(): Promise<import('./contract').Result<UserProfile>>;
  setDisplayName(id: string, displayName: string | null): Promise<import('./contract').Result<UserProfile>>;
  devices(): Promise<import('./contract').Result<DevicesSnapshot>>;
  deviceAction(action: 'approve' | 'reject' | 'remove' | 'rename', id: string, label?: string): Promise<import('./contract').Result<void>>;
  logs(cursor?: number): Promise<import('./contract').Result<GatewayLogTail>>;
};
