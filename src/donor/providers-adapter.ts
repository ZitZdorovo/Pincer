import { useCallback, useMemo, useRef, useState } from 'react';
import type { ProviderConfig as RemoteProvider } from '../../shared/configuration';
import { PROVIDER_TYPE_INFO, type ProviderAccount, type ProviderVendorInfo, type ProviderWithKeyInfo, type ProviderType } from './provider-metadata';
export type { ProviderAccount, ProviderConfig, ProviderVendorInfo } from './provider-metadata';
export type ProviderListItem = { account: ProviderAccount; vendor?: ProviderVendorInfo; status?: ProviderWithKeyInfo };
export const hasConfiguredCredentials = (_account: ProviderAccount, status?: ProviderWithKeyInfo) => status?.hasKey === true;
export const buildProviderAccountId = (type: ProviderType, _label: null, _vendors: ProviderVendorInfo[]) => type === 'custom' ? `custom-${crypto.randomUUID()}` : type;
export const buildProviderListItems = (accounts: ProviderAccount[], statuses: ProviderWithKeyInfo[], vendors: ProviderVendorInfo[], _defaultId: string | null): ProviderListItem[] => accounts.map((account) => ({ account, status: statuses.find((status) => status.id === account.id), vendor: vendors.find((vendor) => vendor.id === account.vendorId) }));
const vendors: ProviderVendorInfo[] = PROVIDER_TYPE_INFO.map((type) => ({ ...type, category: type.id === 'ollama' ? 'local' : 'official', supportedAuthModes: type.id === 'ollama' ? ['local'] : ['api_key'], defaultAuthMode: type.id === 'ollama' ? 'local' : 'api_key', supportsMultipleAccounts: type.id === 'custom' }));
const readProviderLabels = (): Record<string, string> => {
  try { const value: unknown = JSON.parse(localStorage.getItem('pincer.provider-labels') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([, label]) => typeof label === 'string')) : {}; }
  catch { return {}; }
};
export function useProviderData(connected: boolean) {
  const [snapshot, setSnapshot] = useState<{ hash: string; providers: RemoteProvider[] } | null>(null);
  const [providerLabels, setProviderLabels] = useState(readProviderLabels);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const epoch = useRef(0);
  const refreshProviderSnapshot = useCallback(async () => { if (!connected) return; const generation = ++epoch.current; setLoading(true); setError(''); try { const result = await window.pincer.configuration.providers(); if (generation !== epoch.current) return; if (result.ok) setSnapshot(result.value); else setError(result.error.message); } catch (failure) { setError(String(failure)); } finally { if (generation === epoch.current) setLoading(false); } }, [connected]);
  const accounts = useMemo<ProviderAccount[]>(() => (snapshot?.providers || []).map((provider) => ({ id: provider.id, vendorId: PROVIDER_TYPE_INFO.some((type) => type.id === provider.id) ? provider.id as ProviderType : 'custom', label: providerLabels[provider.id] || provider.id, authMode: provider.api === 'ollama' ? 'local' : 'api_key', baseUrl: provider.baseUrl, apiProtocol: provider.api as ProviderAccount['apiProtocol'], model: provider.models[0], metadata: { customModels: provider.models }, enabled: true, isDefault: false, createdAt: '', updatedAt: '' })), [providerLabels, snapshot]);
  const statuses = useMemo<ProviderWithKeyInfo[]>(() => accounts.map((account) => ({ id: account.id, type: account.vendorId, name: account.label, baseUrl: account.baseUrl, apiProtocol: account.apiProtocol, model: account.model, enabled: true, createdAt: '', updatedAt: '', hasKey: snapshot?.providers.find((provider) => provider.id === account.id)?.hasKey === true, keyMasked: null })), [accounts, snapshot]);
  const save = async (account: ProviderAccount, apiKey?: string) => {
    if (!snapshot || !connected) throw new Error('Gateway configuration is unavailable.');
    if (account.headers || account.fallbackAccountIds?.length || account.fallbackModels?.length || account.authMode.startsWith('oauth')) throw new Error('OAuth, custom headers and fallback editing are not supported by the current Gateway adapter.');
    const meta = PROVIDER_TYPE_INFO.find((type) => type.id === account.vendorId);
    const models = account.metadata?.customModels?.length ? account.metadata.customModels : account.model ? [account.model] : [];
    const baseUrl = account.baseUrl || meta?.defaultBaseUrl || '';
    if (!models.length || !baseUrl) throw new Error('Specify the model ID and provider Base URL before saving.');
    const result = await window.pincer.configuration.saveProvider(snapshot.hash, { id: account.id, baseUrl, api: account.apiProtocol || (account.vendorId === 'anthropic' ? 'anthropic-messages' : 'openai-completions'), models, ...(apiKey ? { apiKey } : {}) });
    if (!result.ok) throw new Error(result.error.message);
    if (account.label.trim()) setProviderLabels((current) => { const next = { ...current, [account.id]: account.label.trim() }; localStorage.setItem('pincer.provider-labels', JSON.stringify(next)); return next; });
    await refreshProviderSnapshot(); await window.pincer.chat.refresh();
  };
  return { accounts, statuses, vendors, defaultAccountId: null as string | null, loading, error, refreshProviderSnapshot,
    createAccount: save,
    updateAccount: async (id: string, updates: Partial<ProviderAccount>, apiKey?: string) => { const account = accounts.find((item) => item.id === id); if (!account) throw new Error('Provider unavailable'); await save({ ...account, ...updates }, apiKey); },
    removeAccount: async (id: string) => {
      if (!snapshot || !connected) throw new Error('Gateway configuration is unavailable.');
      const result = await window.pincer.configuration.deleteProvider(snapshot.hash, id);
      if (!result.ok) throw new Error(result.error.message);
      setProviderLabels((current) => { const next = { ...current }; delete next[id]; localStorage.setItem('pincer.provider-labels', JSON.stringify(next)); return next; });
      await refreshProviderSnapshot(); await window.pincer.chat.refresh();
    },
    setDefaultAccount: async (_id: string) => { throw new Error('Use the model selector in chat to choose the model.'); },
    validateAccountApiKey: async (_id: string, _key: string, _options?: { baseUrl?: string; apiProtocol?: ProviderAccount['apiProtocol']; modelId?: string }): Promise<{ valid: boolean; error?: string }> => ({ valid: false, error: 'Checking an unsaved API key is not supported. Save explicitly, then check the connection.' }),
  };
}
