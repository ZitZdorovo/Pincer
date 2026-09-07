import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderConfig as RemoteProvider } from '../../shared/configuration';
import { getDefaultProviderProtocol, PROVIDER_TYPE_INFO, type ProviderAccount, type ProviderVendorInfo, type ProviderWithKeyInfo, type ProviderType } from './provider-metadata';
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
const readDefaultProvider = (): string | null => {
  try { return localStorage.getItem('pincer.default-provider') || null; } catch { return null; }
};
export function useProviderData(connected: boolean) {
  const [snapshot, setSnapshot] = useState<{ hash: string; providers: RemoteProvider[] } | null>(null);
  const [providerLabels, setProviderLabels] = useState(readProviderLabels);
  const [defaultAccountId, setDefaultAccountId] = useState<string | null>(readDefaultProvider);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const epoch = useRef(0);
  const refreshProviderSnapshot = useCallback(async () => { if (!connected) return; const generation = ++epoch.current; setLoading(true); setError(''); try { const result = await window.pincer.configuration.providers(); if (generation !== epoch.current) return; if (result.ok) setSnapshot(result.value); else setError(result.error.message); } catch (failure) { setError(String(failure)); } finally { if (generation === epoch.current) setLoading(false); } }, [connected]);
  const accounts = useMemo<ProviderAccount[]>(() => (snapshot?.providers || []).map((provider) => {
    const oauthProfile = provider.authProfiles?.find((profile) => profile.type === 'oauth' || profile.type === 'token');
    const authMode: ProviderAccount['authMode'] = provider.api === 'ollama'
      ? 'local'
      : oauthProfile
        ? 'oauth_browser'
        : 'api_key';
    return {
      id: provider.id,
      vendorId: PROVIDER_TYPE_INFO.some((type) => type.id === provider.id) ? provider.id as ProviderType : 'custom',
      label: oauthProfile?.displayName || oauthProfile?.email || providerLabels[provider.id] || provider.id,
      authMode,
      baseUrl: provider.baseUrl || undefined,
      apiProtocol: (provider.api || undefined) as ProviderAccount['apiProtocol'],
      model: provider.models[0],
      metadata: {
        customModels: provider.models,
        ...(oauthProfile?.email ? { email: oauthProfile.email } : {}),
        ...(oauthProfile?.profileId ? { resourceUrl: oauthProfile.profileId } : {}),
      },
      enabled: true,
      isDefault: false,
      createdAt: '',
      updatedAt: '',
    };
  }), [providerLabels, snapshot]);
  const statuses = useMemo<ProviderWithKeyInfo[]>(() => accounts.map((account) => ({ id: account.id, type: account.vendorId, name: account.label, baseUrl: account.baseUrl, apiProtocol: account.apiProtocol, model: account.model, enabled: true, createdAt: '', updatedAt: '', hasKey: snapshot?.providers.find((provider) => provider.id === account.id)?.hasKey === true, keyMasked: null })), [accounts, snapshot]);
  const save = async (account: ProviderAccount, apiKey?: string) => {
    if (!snapshot || !connected) throw new Error('Gateway configuration is unavailable.');
    if (account.fallbackAccountIds?.length || account.fallbackModels?.length) throw new Error('Fallback provider editing is not supported by the current Gateway adapter.');
    const meta = PROVIDER_TYPE_INFO.find((type) => type.id === account.vendorId);
    const models = account.metadata?.customModels?.length ? account.metadata.customModels : account.model ? [account.model] : [];
    const baseUrl = account.baseUrl || meta?.defaultBaseUrl || '';
    if (!models.length || !baseUrl) throw new Error('Specify the model ID and provider Base URL before saving.');
    const result = await window.pincer.configuration.saveProvider(snapshot.hash, { id: account.id, baseUrl, api: account.apiProtocol || getDefaultProviderProtocol(account.vendorId), models, ...(account.headers ? { headers: account.headers } : {}), ...(apiKey ? { apiKey } : {}) });
    if (!result.ok) throw new Error(result.error.message);
    if (account.label.trim()) setProviderLabels((current) => { const next = { ...current, [account.id]: account.label.trim() }; localStorage.setItem('pincer.provider-labels', JSON.stringify(next)); return next; });
    await refreshProviderSnapshot();
  };
  const refreshProviderModels = async (id: string, apiKey?: string) => {
    if (!snapshot || !connected) throw new Error('Gateway configuration is unavailable.');
    const current = await window.pincer.configuration.providers();
    if (!current.ok) throw new Error(current.error.message);
    const result = await window.pincer.configuration.refreshProviderModels(current.value.hash, id, apiKey);
    if (!result.ok) throw new Error(result.error.message);
    await refreshProviderSnapshot();
  };
  const deleteProviderModel = async (id: string, modelId: string) => {
    if (!connected) throw new Error('Gateway configuration is unavailable.');
    // A batch delete performs several writes. Read the latest revision for
    // every item so the second deletion cannot reuse a stale hash.
    const current = await window.pincer.configuration.providers();
    if (!current.ok) throw new Error(current.error.message);
    const result = await window.pincer.configuration.deleteProviderModel(current.value.hash, id, modelId);
    if (!result.ok) throw new Error(result.error.message);
    await refreshProviderSnapshot();
  };
  useEffect(() => {
    if (defaultAccountId && accounts.length && !accounts.some((account) => account.id === defaultAccountId)) {
      setDefaultAccountId(null);
      try { localStorage.removeItem('pincer.default-provider'); } catch { /* storage unavailable */ }
    }
  }, [accounts, defaultAccountId]);
  return { accounts, statuses, vendors, defaultAccountId, loading, error, refreshProviderSnapshot, refreshProviderModels, deleteProviderModel,
    createAccount: save,
    updateAccount: async (id: string, updates: Partial<ProviderAccount>, apiKey?: string) => {
      const account = accounts.find((item) => item.id === id); if (!account) throw new Error('Provider unavailable');
      if (!apiKey && Object.keys(updates).every(key => key === 'label')) {
        if (updates.label?.trim()) setProviderLabels(current => { const next = { ...current, [id]: updates.label!.trim() }; localStorage.setItem('pincer.provider-labels', JSON.stringify(next)); return next; });
        return;
      }
      await save({ ...account, ...updates }, apiKey);
    },
    removeAccount: async (id: string, agentId?: string) => {
      if (!snapshot || !connected) throw new Error('Gateway configuration is unavailable.');
      const remote = snapshot.providers.find((provider) => provider.id === id);
      const authProfiles = remote?.authProfiles || [];
      if (authProfiles.length) {
        // Omitting profileIds asks Gateway to remove every saved profile for
        // this provider. This is required for API-key profiles: the Gateway
        // intentionally rejects those ids when they are passed explicitly,
        // even though an unscoped provider logout can remove them.
        const removableProfiles = authProfiles.filter((profile) => profile.logoutSupported === true && (profile.type === 'oauth' || profile.type === 'token'));
        const profileIds = removableProfiles.length === authProfiles.length
          ? removableProfiles.map((profile) => profile.profileId)
          : undefined;
        // Logout is best-effort: some Gateways require an agent owner and
        // reject a global request. Provider removal must still continue.
        let result = await window.pincer.configuration.authLogout(id, profileIds, agentId || 'main');
        if (!result.ok && profileIds) {
          // A stale profile list or an ownership change can make the scoped
          // request fail. Retry as an unscoped provider logout before falling
          // back to the configuration deletion below.
          result = await window.pincer.configuration.authLogout(id, undefined, agentId || 'main');
        }
      }
      // Logout may mutate the Gateway revision. Read a fresh snapshot before
      // deleting the provider so the second write is not rejected as stale.
      let deleteSnapshot = snapshot;
      const latest = await window.pincer.configuration.providers();
      if (latest.ok) { deleteSnapshot = latest.value; setSnapshot(latest.value); }
      const result = await window.pincer.configuration.deleteProvider(deleteSnapshot.hash, id);
      if (!result.ok) throw new Error(result.error.message);
      // Auth status is cached by Gateway. Force it to re-read the auth store,
      // then verify both config and auth state before showing success.
      try { await window.pincer.configuration.authStatus(true, agentId || 'main'); } catch { /* config deletion can still be verified */ }
      let removed = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const check = await window.pincer.configuration.providers();
        if (check.ok) {
          setSnapshot(check.value);
          removed = !check.value.providers.some((provider) => provider.id === id);
          if (removed) break;
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (!removed) throw new Error('PROVIDER_DELETE_INCOMPLETE');
      if (id === defaultAccountId) { setDefaultAccountId(null); try { localStorage.removeItem('pincer.default-provider'); } catch { /* storage unavailable */ } }
      setProviderLabels((current) => { const next = { ...current }; delete next[id]; localStorage.setItem('pincer.provider-labels', JSON.stringify(next)); return next; });
      await refreshProviderSnapshot();
    },
    setDefaultAccount: async (id: string) => {
      if (!accounts.some((account) => account.id === id)) throw new Error('Provider unavailable');
      setDefaultAccountId(id);
      try { localStorage.setItem('pincer.default-provider', id); } catch { /* storage unavailable */ }
    },
    validateAccountApiKey: async (_id: string, _key: string, _options?: { baseUrl?: string; apiProtocol?: ProviderAccount['apiProtocol']; modelId?: string }): Promise<{ valid: boolean; error?: string }> => ({ valid: false, error: 'Checking an unsaved API key is not supported. Save explicitly, then check the connection.' }),
  };
}
