export type QuotaWindow = { label: string; usedPercent?: number; resetAt?: number; unlimited?: boolean; accountName?: string; accountId?: string; model?: string };
export type ProviderQuota = { provider: string; displayName: string; source: 'gateway' | 'omniroute'; windows: QuotaWindow[]; plan?: string; error?: string; updatedAt?: number };
export type QuotaSnapshot = { providers: ProviderQuota[]; updatedAt?: number; refreshing: boolean; errors: string[] };
export type QuotaSource = { baseUrl: string; configured: boolean };
export type QuotaSourceInput = { baseUrl: string; managementToken?: string; clear?: boolean };
