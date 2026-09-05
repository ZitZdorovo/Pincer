export type QuotaWindow = { label: string; usedPercent?: number; resetAt?: number; unlimited?: boolean; accountName?: string; accountId?: string; model?: string };
export type ProviderQuota = { provider: string; displayName: string; source: 'gateway' | 'omniroute'; windows: QuotaWindow[]; plan?: string; error?: string; updatedAt?: number };
export type QuotaSnapshot = { providers: ProviderQuota[]; updatedAt?: number; refreshing: boolean; errors: string[] };
export type QuotaSource = { baseUrl: string; configured: boolean };
export type QuotaSourceInput = { baseUrl: string; managementToken?: string; clear?: boolean };

export function quotasForModel(providers: ProviderQuota[], model: string, provider?: string): ProviderQuota[] {
  if (!model) return [];
  const normalize = (value: string) => value.toLowerCase().trim();
  const selected = normalize(model);
  const local = provider && selected.startsWith(`${normalize(provider)}/`) ? selected.slice(provider.length + 1) : selected;
  return providers.flatMap((entry) => {
    const sameProvider = normalize(entry.provider) === normalize(provider || model.split('/')[0]);
    const windows = entry.windows.filter((window) => window.model
      ? [selected, local].includes(normalize(window.model)) || (sameProvider && selected === `${normalize(entry.provider)}/${normalize(window.model)}`)
      : [selected, local].includes(normalize(window.label)) || (sameProvider && !window.accountId && !window.accountName));
    return windows.length ? [{ ...entry, windows }] : [];
  });
}
