/**
 * Providers Settings Component
 * Manage AI provider configurations and API keys
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  Key,
  ExternalLink,
  Copy,
  XCircle,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RemoteReadout } from './Readout';
import { useAgentsStore } from './adapter';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  useProviderData,
  type ProviderAccount,
  type ProviderConfig,
  type ProviderVendorInfo,
} from './providers-adapter';
import {
  PROVIDER_TYPE_INFO,
  getDefaultProviderProtocol,
  PROVIDER_PROTOCOLS,
  getProviderDocsUrl,
  type ProviderType,
  getProviderIconUrl,
  normalizeProviderApiKeyInput,
  resolveProviderApiKeyForSave,
  shouldInvertInDark,
} from './provider-metadata';
import {
  buildProviderAccountId,
  buildProviderListItems,
  hasConfiguredCredentials,
  type ProviderListItem,
} from './providers-adapter';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../preferences';



const inputClasses = 'h-[44px] rounded-xl font-mono text-meta bg-transparent border-black/10 dark:border-white/10 focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 shadow-sm transition-all text-foreground placeholder:text-foreground/40';
const labelClasses = 'text-sm text-foreground/80 font-bold';
type CodePlanMode = 'apikey' | 'codeplan';

function isZaiProviderType(type: string | undefined): boolean {
  return type === 'zai' || type === 'zai-global';
}

function normalizeFallbackProviderIds(ids?: string[]): string[] {
  return Array.from(new Set((ids ?? []).filter(Boolean)));
}

function getProtocolBaseUrlPlaceholder(
  apiProtocol: ProviderAccount['apiProtocol'],
): string {
  if (apiProtocol === 'anthropic-messages') {
    return 'https://api.example.com/anthropic';
  }
  return 'https://api.example.com/v1';
}

function fallbackProviderIdsEqual(a?: string[], b?: string[]): boolean {
  const left = normalizeFallbackProviderIds(a).sort();
  const right = normalizeFallbackProviderIds(b).sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function normalizeFallbackModels(models?: string[]): string[] {
  return Array.from(new Set((models ?? []).map((model) => model.trim()).filter(Boolean)));
}

function fallbackModelsEqual(a?: string[], b?: string[]): boolean {
  const left = normalizeFallbackModels(a);
  const right = normalizeFallbackModels(b);
  return left.length === right.length && left.every((model, index) => model === right[index]);
}

function getUserAgentHeader(headers?: Record<string, string>): string {
  if (!headers) return '';
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'user-agent') {
      return value;
    }
  }
  return '';
}

function mergeHeadersWithUserAgent(
  headers: Record<string, string> | undefined,
  userAgent: string,
): Record<string, string> {
  const next = Object.fromEntries(
    Object.entries(headers ?? {}).filter(([key]) => key.toLowerCase() !== 'user-agent'),
  );
  const normalizedUserAgent = userAgent.trim();
  if (normalizedUserAgent) {
    next['User-Agent'] = normalizedUserAgent;
  }
  return next;
}

function isCodePlanMode(
  baseUrl: string | undefined,
  modelId: string | undefined,
  codePlanPresetBaseUrl?: string,
  codePlanPresetModelId?: string,
): boolean {
  if (!codePlanPresetBaseUrl || !codePlanPresetModelId) return false;
  return (baseUrl || '').trim() === codePlanPresetBaseUrl && (modelId || '').trim() === codePlanPresetModelId;
}

function shouldShowUserAgentField(account: ProviderAccount): boolean {
  return account.vendorId === 'custom';
}

function shouldShowUserAgentFieldForNewProvider(providerType: ProviderType | null): boolean {
  return providerType === 'custom';
}

function getAuthModeLabel(
  authMode: ProviderAccount['authMode'],
  t: (key: string) => string
): string {
  switch (authMode) {
    case 'api_key':
      return t('aiProviders.authModes.apiKey');
    case 'oauth_device':
      return t('aiProviders.authModes.oauthDevice');
    case 'oauth_browser':
      return t('aiProviders.authModes.oauthBrowser');
    case 'local':
      return t('aiProviders.authModes.local');
    default:
      return authMode;
  }
}

export type ProvidersSettingsHandle = {
  openAddProvider(): void;
};

export const ProvidersSettings = forwardRef<ProvidersSettingsHandle, { connected: boolean; embedded?: boolean }>(function ProvidersSettings({ connected, embedded = false }, ref) {
  const { t } = useTranslation('settings');
  const devModeUnlocked = usePreferences().devMode;
  const ru = usePreferences().language === 'ru';
  const [refreshKeyProvider, setRefreshKeyProvider] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState('');
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const currentAgentId = useAgentsStore((state) => state.agents[0]?.id || '');
  const {
    statuses,
    accounts,
    vendors,
    defaultAccountId,
    loading,
    refreshProviderSnapshot,
    refreshProviderModels,
    deleteProviderModel,
    createAccount,
    removeAccount,
    updateAccount,
    validateAccountApiKey,
  } = useProviderData(connected);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const vendorMap = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const existingVendorIds = new Set(accounts.map((account) => account.vendorId));
  const displayProviders = useMemo(
    () => buildProviderListItems(accounts, statuses, vendors, defaultAccountId),
    [accounts, statuses, vendors, defaultAccountId],
  );

  useImperativeHandle(ref, () => ({
    openAddProvider: () => setShowAddDialog(true),
  }), []);

  // Fetch providers on mount
  useEffect(() => {
    refreshProviderSnapshot();
  }, [refreshProviderSnapshot]);

  const handleAddProvider = async (
    type: ProviderType,
    name: string,
    apiKey: string,
    options?: {
      baseUrl?: string;
      model?: string;
      authMode?: ProviderAccount['authMode'];
      apiProtocol?: ProviderAccount['apiProtocol'];
      headers?: Record<string, string>;
      customModels?: string[];
    }
  ) => {
    const vendor = vendorMap.get(type);
    const id = buildProviderAccountId(type, null, vendors);
    const effectiveApiKey = resolveProviderApiKeyForSave(type, apiKey);
    try {
      await createAccount({
        id,
        vendorId: type,
        label: name,
        authMode: options?.authMode || vendor?.defaultAuthMode || (type === 'ollama' ? 'local' : 'api_key'),
        baseUrl: options?.baseUrl,
        apiProtocol: options?.apiProtocol || getDefaultProviderProtocol(type),
        headers: options?.headers,
        model: options?.model,
        metadata: options?.customModels?.length
          ? { customModels: options.customModels }
          : undefined,
        enabled: true,
        isDefault: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, effectiveApiKey);


      setShowAddDialog(false);
      toast.success(t('aiProviders.toast.added'));
    } catch (error) {
      toast.error(`${t('aiProviders.toast.failedAdd')}: ${error}`);
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    try {
      await removeAccount(providerId, currentAgentId);
      toast.success(t('aiProviders.toast.deleted'));
    } catch (error) {
      toast.error(`${t('aiProviders.toast.failedDelete')}: ${error}`);
    }
  };

  const handleRefreshProviderModels = async (providerId: string) => {
    try {
      await refreshProviderModels(providerId);
      toast.success(t('aiProviders.refresh', 'Модели обновлены'));
    } catch (error) {
      if (String(error).includes('MODEL_DISCOVERY_KEY_REQUIRED')) { setRefreshKeyProvider(providerId); setRefreshKey(''); setRefreshError(''); return; }
      toast.error(`${t('aiProviders.refresh', 'Не удалось обновить модели')}: ${error}`);
    }
  };
  const handleDeleteProviderModel = async (providerId: string, modelId: string) => {
    try {
      await deleteProviderModel(providerId, modelId);
      toast.success(t('aiProviders.modelDeleted', 'Модель удалена'));
    } catch (error) {
      toast.error(`${t('aiProviders.modelDeleteFailed', 'Не удалось удалить модель')}: ${error}`);
    }
  };

  return (
    <div data-testid="providers-settings" className="space-y-6">
      <Dialog open={refreshKeyProvider !== null} onOpenChange={open => { if (!open && !refreshBusy) { setRefreshKeyProvider(null); setRefreshKey(''); } }}>
        <DialogContent>
          <DialogTitle>{ru ? 'Обновить модели провайдера' : 'Refresh provider models'}</DialogTitle>
          <DialogDescription>{ru ? 'Gateway скрывает сохранённый ключ этого провайдера. Введите API-ключ один раз: Pincer сохранит его с шифрованием ОС для следующих обновлений.' : 'Gateway hides this provider’s saved key. Enter the API key once; Pincer will store it with OS encryption for future refreshes.'}</DialogDescription>
          <form className="space-y-4" onSubmit={async event => { event.preventDefault(); if (!refreshKeyProvider || refreshBusy) return; setRefreshBusy(true); setRefreshError(''); try { await refreshProviderModels(refreshKeyProvider, refreshKey.trim()); setRefreshKeyProvider(null); setRefreshKey(''); toast.success(ru ? 'Модели обновлены' : 'Models refreshed'); } catch (error) { setRefreshError(String(error)); } finally { setRefreshBusy(false); } }}>
            <Input type="password" autoComplete="off" aria-label="API key" value={refreshKey} onChange={event => setRefreshKey(event.target.value)} disabled={refreshBusy} />
            {refreshError && <p role="alert" className="text-sm text-destructive">{refreshError}</p>}
            <Button type="submit" disabled={!refreshKey.trim() || refreshBusy}>{refreshBusy ? (ru ? 'Загрузка…' : 'Loading…') : (ru ? 'Обновить модели' : 'Refresh models')}</Button>
          </form>
        </DialogContent>
      </Dialog>
      {!embedded && <div className="flex items-center justify-between">
        <h2 data-testid="providers-settings-title" className="openx-section-title !mb-0">
          {t('aiProviders.title', 'AI Providers')}
        </h2>
        <div className="flex items-center gap-2"><Button variant="outline" size="icon" aria-label={t('aiProviders.refresh', 'Обновить API')} title={t('aiProviders.refresh', 'Обновить API')} onClick={() => void refreshProviderSnapshot()} disabled={loading} className="h-9 w-9"><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /></Button><Button data-testid="providers-add-button" onClick={() => setShowAddDialog(true)} className="h-9 rounded-lg px-4 text-meta font-medium shadow-none">
          <Plus className="h-4 w-4 mr-2" />
          {t('aiProviders.add')}
        </Button></div>
      </div>}

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-border bg-surface-modal py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : displayProviders.length === 0 ? (
        <div data-testid="providers-empty-state" className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-modal py-14 text-muted-foreground">
          <Key className="h-12 w-12 mb-4 opacity-50" />
          <h3 className="text-sm font-medium mb-1 text-foreground">{t('aiProviders.empty.title')}</h3>
          <p className="text-meta text-center mb-6 max-w-sm">
            {t('aiProviders.empty.desc')}
          </p>
          {!embedded && <Button onClick={() => setShowAddDialog(true)} className="h-10 rounded-lg bg-brand px-6 text-white hover:bg-brand-hover">
            <Plus className="h-4 w-4 mr-2" />
            {t('aiProviders.empty.cta')}
          </Button>}
        </div>
      ) : (
        <div className="space-y-3">
          {displayProviders.map((item) => (
            <ProviderCard
              key={item.account.id}
              item={item}
              allProviders={displayProviders}
              isDefault={item.account.id === defaultAccountId}
              isEditing={editingProvider === item.account.id}
              onEdit={() => setEditingProvider(item.account.id)}
              onCancelEdit={() => setEditingProvider(null)}
              onDelete={() => handleDeleteProvider(item.account.id)}
              onRefreshModels={() => handleRefreshProviderModels(item.account.id)}
              onDeleteModel={(modelId) => handleDeleteProviderModel(item.account.id, modelId)}
              onSaveEdits={async (payload) => {
                const updates: Partial<ProviderAccount> = {};
                if (payload.updates) {
                  if (payload.updates.name !== undefined) updates.label = payload.updates.name;
                  if (payload.updates.baseUrl !== undefined) updates.baseUrl = payload.updates.baseUrl;
                  if (payload.updates.apiProtocol !== undefined) updates.apiProtocol = payload.updates.apiProtocol;
                  if (payload.updates.headers !== undefined) updates.headers = payload.updates.headers;
                  if (payload.updates.model !== undefined) updates.model = payload.updates.model;
                  if (payload.updates.fallbackModels !== undefined) updates.fallbackModels = payload.updates.fallbackModels;
                  if (payload.updates.fallbackProviderIds !== undefined) {
                    updates.fallbackAccountIds = payload.updates.fallbackProviderIds;
                  }
                }
                if (payload.models !== undefined) {
                  updates.metadata = { ...(item.account.metadata || {}), customModels: payload.models };
                }
                if (payload.newApiKey && item.account.vendorId !== 'ollama') {
                  const baseUrl = payload.updates?.baseUrl || item.account.baseUrl || vendorMap.get(item.account.vendorId)?.defaultBaseUrl || '';
                  const api = payload.updates?.apiProtocol || item.account.apiProtocol || getDefaultProviderProtocol(item.account.vendorId);
                  const discovered = await window.pincer.configuration.discoverModels({ baseUrl, api, apiKey: payload.newApiKey });
                  if (!discovered.ok) throw new Error(discovered.error.message);
                  updates.metadata = { ...(item.account.metadata || {}), customModels: discovered.value };
                }
                await updateAccount(
                  item.account.id,
                  updates,
                  payload.newApiKey
                );
                setEditingProvider(null);
              }}
              onValidateKey={(key, options) => validateAccountApiKey(item.account.id, key, options)}
              devModeUnlocked={devModeUnlocked}
            />
          ))}
        </div>
      )}

      {/* Add Provider Dialog */}
      <AddProviderDialog
        open={showAddDialog}
        existingVendorIds={existingVendorIds}
        vendors={vendors}
        onClose={() => setShowAddDialog(false)}
        onAdd={handleAddProvider}
        onOAuthComplete={async () => {
          await window.pincer.configuration.authStatus(true);
          await refreshProviderSnapshot();
          await window.pincer.chat.refreshModels();
          setShowAddDialog(false);
        }}
        onValidateKey={(type, key, options) => validateAccountApiKey(type, key, options)}
      />
    </div>
  );
});

interface ProviderCardProps {
  item: ProviderListItem;
  allProviders: ProviderListItem[];
  isDefault: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRefreshModels: () => void;
  onDeleteModel: (modelId: string) => Promise<void>;
  onSaveEdits: (payload: { newApiKey?: string; updates?: Partial<ProviderConfig>; models?: string[] }) => Promise<void>;
  onValidateKey: (
    key: string,
    options?: { baseUrl?: string; apiProtocol?: ProviderAccount['apiProtocol']; modelId?: string }
  ) => Promise<{ valid: boolean; error?: string }>;
  devModeUnlocked: boolean;
}



function ProviderCard({
  item,
  allProviders,
  isDefault,
  isEditing,
  onEdit,
  onCancelEdit,
  onDelete,
  onRefreshModels,
  onDeleteModel,
  onSaveEdits,
  onValidateKey: _onValidateKey,
  devModeUnlocked: _devModeUnlocked,
}: ProviderCardProps) {
  const { t, i18n } = useTranslation('settings');
  const { account, vendor, status } = item;
  const defaultAgent = useAgentsStore((state) => state.agents[0]?.id || '');
  const [newKey, setNewKey] = useState('');
  const [providerName, setProviderName] = useState(account.label);
  const [baseUrl, setBaseUrl] = useState(account.baseUrl || '');
  const [apiProtocol, setApiProtocol] = useState<ProviderAccount['apiProtocol']>(account.apiProtocol || 'openai-completions');
  const [userAgent, setUserAgent] = useState(getUserAgentHeader(account.headers));
  const [modelId, setModelId] = useState(account.model || '');
  const [fallbackModelsText, setFallbackModelsText] = useState(
    normalizeFallbackModels(account.fallbackModels).join('\n')
  );
  const [fallbackProviderIds, setFallbackProviderIds] = useState<string[]>(
    normalizeFallbackProviderIds(account.fallbackAccountIds)
  );
  const [showKey, setShowKey] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codePlanMode, setCodePlanMode] = useState<CodePlanMode>('apikey');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const [modelList, setModelList] = useState<string[]>(Array.from(new Set([...(account.metadata?.customModels || []), ...(account.model ? [account.model] : [])].filter(Boolean))));
  const [modelToAdd, setModelToAdd] = useState('');

  const typeInfo = PROVIDER_TYPE_INFO.find((t) => t.id === account.vendorId);
  const providerDocsUrl = getProviderDocsUrl(typeInfo, i18n.language);
  const showModelIdField = true;
  const codePlanPreset = typeInfo?.codePlanPresetBaseUrl && typeInfo?.codePlanPresetModelId
    ? {
      baseUrl: typeInfo.codePlanPresetBaseUrl,
      modelId: typeInfo.codePlanPresetModelId,
    }
    : null;
  const effectiveDocsUrl = codePlanMode === 'codeplan'
    ? (typeInfo?.codePlanDocsUrl || providerDocsUrl)
    : providerDocsUrl;
  const canEditModelConfig = Boolean(typeInfo?.showBaseUrl || showModelIdField);
  const showUserAgentField = shouldShowUserAgentField(account);
  const usesOAuthAuth = account.authMode === 'oauth_browser' || account.authMode === 'oauth_device';

  useEffect(() => {
    if (isEditing) {
      setProviderName(account.label);
      setNewKey('');
      setShowKey(false);
      setBaseUrl(account.baseUrl || '');
      setApiProtocol(account.apiProtocol || 'openai-completions');
      setUserAgent(getUserAgentHeader(account.headers));
      setModelId(account.model || '');
      setFallbackModelsText(normalizeFallbackModels(account.fallbackModels).join('\n'));
      setFallbackProviderIds(normalizeFallbackProviderIds(account.fallbackAccountIds));
      setValidationError(null);
      setSelectedModels([]);
      setModelsExpanded(false);
      setModelList(Array.from(new Set([...(account.metadata?.customModels || []), ...(account.model ? [account.model] : [])].filter(Boolean))));
      setModelToAdd('');
      setCodePlanMode(
        isCodePlanMode(
          account.baseUrl,
          account.model,
          typeInfo?.codePlanPresetBaseUrl,
          typeInfo?.codePlanPresetModelId,
        ) ? 'codeplan' : 'apikey'
      );
    }
  }, [isEditing, account.baseUrl, account.headers, account.fallbackModels, account.fallbackAccountIds, account.model, account.apiProtocol, account.vendorId, typeInfo?.codePlanPresetBaseUrl, typeInfo?.codePlanPresetModelId]);

  const fallbackOptions = allProviders.filter((candidate) => candidate.account.id !== account.id);
  const availableModelIds = modelList;
  const visibleModelIds = modelsExpanded ? availableModelIds : availableModelIds.slice(0, 8);
  const allModelsSelected = availableModelIds.length > 0 && availableModelIds.every((id) => selectedModels.includes(id));
  const originalModelIds = Array.from(new Set([...(account.metadata?.customModels || []), ...(account.model ? [account.model] : [])].filter(Boolean)));
  const modelsChanged = modelList.length !== originalModelIds.length || modelList.some((id, index) => id !== originalModelIds[index]);
  const appendProviderModels = () => {
    const additions = modelToAdd.split(/[\n,]/).map((id) => id.trim()).filter(Boolean);
    if (!additions.length) return;
    setModelList((current) => Array.from(new Set([...current, ...additions])));
    setModelToAdd('');
  };

  const deleteSelectedModels = async () => {
    const ids = selectedModels.filter((id) => availableModelIds.includes(id));
    if (!ids.length) return;
    setDeletingModel('__bulk__');
    try {
      for (const id of ids) await onDeleteModel(id);
      setSelectedModels([]);
      setModelList((current) => current.filter((id) => !ids.includes(id)));
    } finally {
      setDeletingModel(null);
    }
  };

  const toggleFallbackProvider = (providerId: string) => {
    setFallbackProviderIds((current) => (
      current.includes(providerId)
        ? current.filter((id) => id !== providerId)
        : [...current, providerId]
    ));
  };

  const handleSaveEdits = async () => {
    setSaving(true);
    setValidationError(null);
    try {
      const payload: { newApiKey?: string; updates?: Partial<ProviderConfig>; models?: string[] } = {};
      const normalizedFallbackModels = normalizeFallbackModels(fallbackModelsText.split('\n'));
      const normalizedNewKey = normalizeProviderApiKeyInput(newKey);

      if (normalizedNewKey) {
        payload.newApiKey = normalizedNewKey;
      }

      {
        const updates: Partial<ProviderConfig> = { name: providerName.trim() || account.label };
        if (typeInfo?.showBaseUrl && (baseUrl.trim() || undefined) !== (account.baseUrl || undefined)) {
          updates.baseUrl = baseUrl.trim() || undefined;
        }
        if ((account.vendorId === 'custom' || account.vendorId === 'ollama') && apiProtocol !== account.apiProtocol) {
          updates.apiProtocol = apiProtocol;
        }
        const existingUserAgent = getUserAgentHeader(account.headers).trim();
        const nextUserAgent = userAgent.trim();
        if (nextUserAgent !== existingUserAgent) {
          updates.headers = mergeHeadersWithUserAgent(account.headers, nextUserAgent);
        }
        if (!fallbackModelsEqual(normalizedFallbackModels, account.fallbackModels)) {
          updates.fallbackModels = normalizedFallbackModels;
        }
        if (!fallbackProviderIdsEqual(fallbackProviderIds, account.fallbackAccountIds)) {
          updates.fallbackProviderIds = normalizeFallbackProviderIds(fallbackProviderIds);
        }
        if (Object.keys(updates).length > 0) {
          payload.updates = updates;
        }
      }
      if (modelsChanged) payload.models = modelList;

      // Keep Ollama key optional in UI, but persist a placeholder when
      // editing legacy configs that have no stored key.
      if (account.vendorId === 'ollama' && !status?.hasKey && !payload.newApiKey) {
        payload.newApiKey = resolveProviderApiKeyForSave(account.vendorId, '') as string;
      }

      if (!payload.newApiKey && !payload.updates && payload.models === undefined) {
        onCancelEdit();
        setSaving(false);
        return;
      }

      await onSaveEdits(payload);
      setNewKey('');
      toast.success(t('aiProviders.toast.updated'));
    } catch (error) {
      toast.error(`${t('aiProviders.toast.failedUpdate')}: ${error}`);
    } finally {
      setSaving(false);
      setValidating(false);
    }
  };

  const currentInputClasses = isDefault
    ? "h-[40px] rounded-xl font-mono text-meta bg-surface-modal border-black/10 dark:border-white/10 focus-visible:ring-1 focus-visible:ring-blue-500/50 shadow-sm"
    : inputClasses;

  const currentLabelClasses = isDefault ? "text-meta text-muted-foreground" : labelClasses;
  const currentSectionLabelClasses = isDefault ? "text-sm font-bold text-foreground/80" : labelClasses;

  return (
    <div
      data-testid={`provider-card-${account.id}`}
      className={cn(
        "group flex flex-col p-4 rounded-2xl transition-all relative overflow-hidden hover:bg-black/5 dark:hover:bg-white/5",
        isDefault
          ? "bg-black/[0.04] dark:bg-white/[0.06] border border-transparent"
          : "bg-transparent border border-transparent"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-[42px] w-[42px] shrink-0 flex items-center justify-center text-foreground border border-black/5 dark:border-white/10 rounded-xl bg-black/5 dark:bg-white/5 shadow-sm group-hover:scale-105 transition-transform">
            {getProviderIconUrl(account.vendorId) ? (
              <img src={getProviderIconUrl(account.vendorId)} alt={typeInfo?.name || account.vendorId} className={cn('h-5 w-5', shouldInvertInDark(account.vendorId) && 'dark:invert')} />
            ) : (
              <span className="text-xl">{vendor?.icon || typeInfo?.icon || '⚙️'}</span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{account.label}</span>
              {isDefault && (
                <span className="flex items-center gap-1 rounded-md bg-black/[0.04] px-2 py-0.5 font-mono text-2xs font-medium text-foreground/70 shadow-none dark:bg-white/[0.08]">
                  <Check className="h-3 w-3" />
                  {t('aiProviders.card.default')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-meta text-muted-foreground">
              <span className="capitalize">{vendor?.name || account.vendorId}</span>
              <span className="w-1 h-1 rounded-full bg-black/20 dark:bg-white/20" />
              <span>{getAuthModeLabel(account.authMode, t)}</span>
              {(account.metadata?.customModels?.length || account.model) && (
                <>
                  <span className="w-1 h-1 rounded-full bg-black/20 dark:bg-white/20" />
                  <span className="truncate max-w-[200px]">{(account.metadata?.customModels?.length || 0) > 0 ? `${i18n.language.startsWith('ru') ? 'Моделей' : 'Models'}: ${account.metadata!.customModels!.length}` : account.model}</span>
                </>
              )}
              <span className="w-1 h-1 rounded-full bg-black/20 dark:bg-white/20" />
              <span className="flex items-center gap-1">
                {hasConfiguredCredentials(account, status) ? (
                  <><div className="w-1.5 h-1.5 rounded-full bg-green-500" /> {t('aiProviders.card.configured')}</>
                ) : (
                  <><div className="w-1.5 h-1.5 rounded-full bg-red-500" /> {t('aiProviders.dialog.apiKeyMissing')}</>
                )}
              </span>
              {((account.fallbackModels?.length ?? 0) > 0 || (account.fallbackAccountIds?.length ?? 0) > 0) && (
                <>
                  <span className="w-1 h-1 rounded-full bg-black/20 dark:bg-white/20" />
                  <span className="truncate max-w-[150px]" title={t('aiProviders.sections.fallback')}>
                    {t('aiProviders.sections.fallback')}: {[
                      ...normalizeFallbackModels(account.fallbackModels),
                      ...normalizeFallbackProviderIds(account.fallbackAccountIds)
                        .map((fallbackId) => allProviders.find((candidate) => candidate.account.id === fallbackId)?.account.label)
                        .filter(Boolean),
                    ].join(', ')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {!isEditing && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Button
              data-testid={`provider-refresh-models-${account.id}`}
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-blue-600 hover:bg-surface-modal shadow-sm"
              onClick={onRefreshModels}
              title={t('aiProviders.refresh', 'Обновить API и модели')}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            <Button
              data-testid={`provider-edit-${account.id}`}
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-modal shadow-sm"
              onClick={onEdit}
              title={t('aiProviders.card.editKey')}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              data-testid={`provider-delete-${account.id}`}
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-surface-modal shadow-sm"
              onClick={onDelete}
              title={t('aiProviders.card.delete')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {isEditing && (
        <div className="space-y-6 mt-4 pt-4 border-t border-black/5 dark:border-white/5">
          {effectiveDocsUrl && (
            <div className="flex justify-end -mt-2 mb-2">
              <a
                href={effectiveDocsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:text-blue-600 font-medium inline-flex items-center gap-1"
              >
                {t('aiProviders.dialog.customDoc')}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
          {canEditModelConfig && (
            <div className="space-y-3">
              <p className={currentSectionLabelClasses}>{t('aiProviders.sections.model')}</p>
              {typeInfo?.showBaseUrl && (
                <div className="space-y-1.5">
                  <Label className={currentLabelClasses}>{t('aiProviders.dialog.baseUrl')}</Label>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={getProtocolBaseUrlPlaceholder(apiProtocol)}
                    className={currentInputClasses}
                  />
                </div>
              )}
              {showModelIdField && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className={currentLabelClasses}>{i18n.language.startsWith('ru') ? 'Доступные модели' : 'Available models'}</Label>
                    <span className="text-xs text-muted-foreground">{availableModelIds.length}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button type="button" onClick={() => setSelectedModels(allModelsSelected ? [] : availableModelIds)} className="text-blue-500 hover:text-blue-600">
                      {allModelsSelected ? (i18n.language.startsWith('ru') ? 'Снять выбор' : 'Clear selection') : (i18n.language.startsWith('ru') ? 'Выбрать все' : 'Select all')}
                    </button>
                    {selectedModels.length > 0 && <button type="button" disabled={deletingModel !== null} onClick={() => void deleteSelectedModels()} className="text-destructive hover:text-destructive/80 disabled:opacity-50">
                      {i18n.language.startsWith('ru') ? `Удалить выбранные (${selectedModels.length})` : `Delete selected (${selectedModels.length})`}
                    </button>}
                    {availableModelIds.length > 8 && <button type="button" onClick={() => setModelsExpanded((value) => !value)} className="ml-auto text-muted-foreground hover:text-foreground">
                      {modelsExpanded ? (i18n.language.startsWith('ru') ? 'Свернуть' : 'Show less') : (i18n.language.startsWith('ru') ? `Показать все (+${availableModelIds.length - 8})` : `Show all (+${availableModelIds.length - 8})`)}
                    </button>}
                  </div>
                  <div className="flex gap-2">
                    <Input value={modelToAdd} onChange={(event) => setModelToAdd(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); appendProviderModels(); } }} placeholder={i18n.language.startsWith('ru') ? 'Добавить модель' : 'Add model'} className={cn(currentInputClasses, 'flex-1')} />
                    <Button type="button" variant="outline" onClick={appendProviderModels} disabled={!modelToAdd.trim()} className="shrink-0"><Plus className="mr-1.5 h-4 w-4" />{i18n.language.startsWith('ru') ? 'Добавить' : 'Add'}</Button>
                  </div>
                  <div className="flex max-h-56 flex-wrap gap-2 overflow-auto rounded-xl border border-border/70 p-2">{visibleModelIds.map(id => <span key={id} className={cn("inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-1 text-xs", selectedModels.includes(id) ? 'border-blue-500/60 bg-blue-500/10' : 'border-border')}><input type="checkbox" aria-label={`${i18n.language.startsWith('ru') ? 'Выбрать модель' : 'Select model'} ${id}`} checked={selectedModels.includes(id)} onChange={() => setSelectedModels((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} className="h-3 w-3 rounded border-border text-blue-500 focus:ring-blue-500/50" /><span className="max-w-[24rem] break-words">{id}</span><button type="button" aria-label={`${t('aiProviders.modelDelete', 'Удалить модель')} ${id}`} title={t('aiProviders.modelDelete', 'Удалить модель')} disabled={deletingModel !== null} onClick={() => { setDeletingModel(id); void onDeleteModel(id).then(() => setModelList((current) => current.filter((value) => value !== id))).finally(() => setDeletingModel(null)); }} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><X className="h-3 w-3" /></button></span>)}</div>
                </div>
              )}
              <div className="space-y-2"><Label htmlFor={`provider-name-${account.id}`}>{t('aiProviders.dialog.displayName')}</Label><Input id={`provider-name-${account.id}`} value={providerName} onChange={(event) => setProviderName(event.target.value)} /></div>
              <RemoteReadout label={t('pincer.probeModel')} request={() => window.pincer.management.probeModel(account.id, defaultAgent)} />
              {codePlanPreset && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className={currentLabelClasses}>{t('aiProviders.dialog.codePlanPreset')}</Label>
                    {typeInfo?.codePlanDocsUrl && (
                      <a
                        href={typeInfo.codePlanDocsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:text-blue-600 font-medium inline-flex items-center gap-1"
                      >
                        {t('aiProviders.dialog.codePlanDoc')}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2 text-meta">
                    <button
                      type="button"
                      data-testid={`provider-edit-codeplan-apikey-${account.id}`}
                      disabled
                      onClick={() => {
                        setCodePlanMode('apikey');
                        setBaseUrl(typeInfo?.defaultBaseUrl || '');
                        if (modelId.trim() === codePlanPreset.modelId) {
                          setModelId('');
                        }
                      }}
                      className={cn("flex-1 py-1.5 px-3 rounded-lg border transition-colors", codePlanMode === 'apikey' ? "bg-surface-modal border-black/20 dark:border-white/20 shadow-sm font-medium" : "border-transparent bg-black/5 dark:bg-white/5 text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10")}
                    >
                      {t('aiProviders.authModes.apiKey')}
                    </button>
                    <button
                      type="button"
                      data-testid={`provider-edit-codeplan-mode-${account.id}`}
                      disabled
                      onClick={() => {
                        setCodePlanMode('codeplan');
                        setBaseUrl(codePlanPreset.baseUrl);
                        setModelId(codePlanPreset.modelId);
                      }}
                      className={cn("flex-1 py-1.5 px-3 rounded-lg border transition-colors", codePlanMode === 'codeplan' ? "bg-surface-modal border-black/20 dark:border-white/20 shadow-sm font-medium" : "border-transparent bg-black/5 dark:bg-white/5 text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10")}
                    >
                      {t('aiProviders.dialog.codePlanMode')}
                    </button>
                  </div>
                  {codePlanMode === 'codeplan' && (
                    <p className="text-xs text-muted-foreground">
                      {t('aiProviders.dialog.codePlanPresetDesc', {
                        baseUrl: codePlanPreset.baseUrl,
                        modelId: codePlanPreset.modelId,
                      })}
                    </p>
                  )}
                </div>
              )}
              {account.vendorId === 'custom' && (
                <div className="space-y-1.5 pt-2">
                  <Label className={currentLabelClasses}>{t('aiProviders.dialog.protocol', 'Protocol')}</Label>
                  <select value={apiProtocol} onChange={(event) => setApiProtocol(event.target.value as ProviderAccount['apiProtocol'])} className={cn(currentInputClasses, 'w-full px-3')}>
                    {PROVIDER_PROTOCOLS.map((protocol) => <option key={protocol} value={protocol}>{protocol}</option>)}
                  </select>
                </div>
              )}
              {showUserAgentField && (
                <div className="space-y-1.5 pt-2">
                  <Label className={currentLabelClasses}>{t('aiProviders.dialog.userAgent')}</Label>
                  <Input
                    value={userAgent}
                    onChange={(e) => setUserAgent(e.target.value)}
                    placeholder={t('aiProviders.dialog.userAgentPlaceholder')}
                    className={currentInputClasses}
                  />
                </div>
              )}
            </div>
          )}
          <div className="space-y-3">
            <button
              onClick={() => setShowFallback(!showFallback)}
              className="flex items-center justify-between w-full text-sm font-bold text-foreground/80 hover:text-foreground transition-colors"
            >
              <span>{t('aiProviders.sections.fallback')}</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", showFallback && "rotate-180")} />
            </button>
            {showFallback && (
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label className={currentLabelClasses}>{t('aiProviders.dialog.fallbackModelIds')}</Label>
                  <textarea
                    value={fallbackModelsText}
                    onChange={(e) => setFallbackModelsText(e.target.value)}
                    placeholder={t('aiProviders.dialog.fallbackModelIdsPlaceholder')}
                    className={isDefault
                      ? "min-h-24 w-full rounded-xl border border-black/10 dark:border-white/10 bg-surface-modal px-3 py-2 text-meta font-mono outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50 shadow-sm"
                      : "min-h-24 w-full rounded-xl border border-black/10 dark:border-white/10 bg-transparent px-3 py-2 text-meta font-mono outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 shadow-sm transition-all text-foreground placeholder:text-foreground/40"}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('aiProviders.dialog.fallbackModelIdsHelp')}
                  </p>
                </div>
                <div className="space-y-2 pt-1">
                  <Label className={currentLabelClasses}>{t('aiProviders.dialog.fallbackProviders')}</Label>
                  {fallbackOptions.length === 0 ? (
                    <p className="text-meta text-muted-foreground">{t('aiProviders.dialog.noFallbackOptions')}</p>
                  ) : (
                    <div className={cn("space-y-2 rounded-xl border border-black/10 dark:border-white/10 p-3 shadow-sm", isDefault ? "bg-surface-modal" : "bg-transparent")}>
                      {fallbackOptions.map((candidate) => (
                        <label key={candidate.account.id} className="flex items-center gap-3 text-meta cursor-pointer group/label">
                          <input
                            type="checkbox"
                            checked={fallbackProviderIds.includes(candidate.account.id)}
                            onChange={() => toggleFallbackProvider(candidate.account.id)}
                            className="rounded border-black/20 dark:border-white/20 text-blue-500 focus:ring-blue-500/50"
                          />
                          <span className="font-medium group-hover/label:text-blue-500 transition-colors">{candidate.account.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {candidate.account.model || candidate.vendor?.name || candidate.account.vendorId}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {!usesOAuthAuth && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label className={currentSectionLabelClasses}>{t('aiProviders.dialog.apiKey')}</Label>
                <p className="text-xs text-muted-foreground">
                  {hasConfiguredCredentials(account, status)
                    ? t('aiProviders.dialog.apiKeyConfigured')
                    : t('aiProviders.dialog.apiKeyMissing')}
                </p>
              </div>
              {hasConfiguredCredentials(account, status) ? (
                <div className="flex items-center gap-1.5 text-tiny font-medium text-green-600 dark:text-green-500 bg-green-500/10 px-2 py-1 rounded-md">
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  {t('aiProviders.card.configured')}
                </div>
              ) : null}
            </div>
            {typeInfo?.apiKeyUrl && (
              <div className="flex justify-start">
                <a
                  href={typeInfo.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-meta text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1"
                  tabIndex={-1}
                >
                  {t('aiProviders.oauth.getApiKey')} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            <div className="space-y-1.5 pt-1">
              <Label className={currentLabelClasses}>{t('aiProviders.dialog.replaceApiKey')}</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    data-testid={`provider-edit-key-input-${account.id}`}
                    type={showKey ? 'text' : 'password'}
                    placeholder={typeInfo?.requiresApiKey ? typeInfo?.placeholder : (typeInfo?.id === 'ollama' ? t('aiProviders.notRequired') : t('aiProviders.card.editKey'))}
                    value={newKey}
                    onChange={(e) => {
                      setNewKey(e.target.value);
                      setValidationError(null);
                    }}
                    className={cn(currentInputClasses, 'pr-10')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  data-testid={`provider-edit-save-${account.id}`}
                  variant="outline"
                  onClick={handleSaveEdits}
                  className={cn(
                    "rounded-xl px-4 border-black/10 dark:border-white/10",
                    isDefault
                      ? "h-[40px] bg-surface-modal hover:bg-black/5 dark:hover:bg-white/10"
                      : "h-[44px] bg-transparent hover:bg-black/5 dark:hover:bg-white/10 shadow-sm"
                  )}
                  disabled={
                    validating
                    || saving
                    || (
                      !newKey.trim()
                      && providerName.trim() === account.label
                      && apiProtocol === (account.apiProtocol || 'openai-completions')
                      && (baseUrl.trim() || undefined) === (account.baseUrl || undefined)
                      && userAgent.trim() === getUserAgentHeader(account.headers).trim()
                      && fallbackModelsEqual(normalizeFallbackModels(fallbackModelsText.split('\n')), account.fallbackModels)
                      && fallbackProviderIdsEqual(fallbackProviderIds, account.fallbackAccountIds)
                      && !modelsChanged
                    )
                  }
                >
                  {validating || saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 text-green-500" />
                  )}
                </Button>
                <Button
                  data-testid={`provider-edit-cancel-${account.id}`}
                  variant="ghost"
                  onClick={onCancelEdit}
                  className={cn(
                    "p-0 rounded-xl",
                    isDefault
                      ? "h-[40px] w-[40px] hover:bg-black/5 dark:hover:bg-white/10"
                      : "h-[44px] w-[44px] bg-transparent border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 shadow-sm text-muted-foreground hover:text-foreground"
                  )}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {validationError && (
                <p
                  data-testid={`provider-edit-validation-error-${account.id}`}
                  className="text-xs text-red-500 flex items-center gap-1 mt-1"
                >
                  <XCircle className="h-3 w-3 shrink-0" />
                  <span className="font-medium">{t('aiProviders.dialog.failed')}:</span>
                  <span>{validationError}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t('aiProviders.dialog.replaceApiKeyHelp')}
              </p>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AddProviderDialogProps {
  open: boolean;
  existingVendorIds: Set<string>;
  vendors: ProviderVendorInfo[];
  onClose: () => void;
  onAdd: (
    type: ProviderType,
    name: string,
    apiKey: string,
    options?: {
      baseUrl?: string;
      model?: string;
      authMode?: ProviderAccount['authMode'];
      apiProtocol?: ProviderAccount['apiProtocol'];
      headers?: Record<string, string>;
      customModels?: string[];
    }
  ) => Promise<void>;
  onOAuthComplete: () => Promise<void>;
  onValidateKey: (
    type: string,
    apiKey: string,
    options?: { baseUrl?: string; apiProtocol?: ProviderAccount['apiProtocol']; modelId?: string }
  ) => Promise<{ valid: boolean; error?: string }>;
}

function AddProviderDialog({
  open,
  existingVendorIds,
  vendors,
  onClose,
  onAdd,
  onOAuthComplete,
  onValidateKey: _onValidateKey,
}: AddProviderDialogProps) {
  const { t, i18n } = useTranslation('settings');
  const [selectedType, setSelectedType] = useState<ProviderType | null>(null);
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelId, setModelId] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [apiProtocol, setApiProtocol] = useState<ProviderAccount['apiProtocol']>('openai-completions');
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [userAgent, setUserAgent] = useState('');
  const [codePlanMode, setCodePlanMode] = useState<CodePlanMode>('apikey');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [modelToAdd, setModelToAdd] = useState('');
  const [selectedAddModels, setSelectedAddModels] = useState<string[]>([]);
  const [modelsExpanded, setModelsExpanded] = useState(false);

  // OAuth Flow State
  const [oauthFlowing, setOauthFlowing] = useState(false);
  const [oauthData, setOauthData] = useState<{
    mode: 'device' | 'manual';
    stepType: string;
    sessionId: string;
    stepId: string;
    verificationUri: string;
    userCode: string;
    expiresIn: number;
    authorizationUrl: string;
    message?: string;
    options?: Array<{ value: unknown; label: string; hint?: string }>;
    sensitive?: boolean;
    placeholder?: string;
  } | null>(null);
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [oauthError, setOauthError] = useState<string | null>(null);
  // For providers that support both OAuth and API key, let the user choose.
  // Default to the vendor's declared auth mode instead of hard-coding OAuth.
  const [authMode, setAuthMode] = useState<'oauth' | 'apikey'>('apikey');
  const oauthSessionRef = React.useRef<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);
  const pendingOAuthRef = React.useRef<{ accountId: string; label: string } | null>(null);

  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setSelectedType(null);
      setName('');
      setApiKey('');
      setBaseUrl('');
      setModelId('');
      setModelToAdd('');
      setSelectedAddModels([]);
      setModelsExpanded(false);
      setApiProtocol('openai-completions');
      setShowAdvancedConfig(false);
      setUserAgent('');
      setCodePlanMode('apikey');
      setShowKey(false);
      setSaving(false);
      setValidationError(null);
      setOauthFlowing(false);
      setOauthData(null);
      setManualCodeInput('');
      setOauthError(null);
      setAuthMode('apikey');
      oauthSessionRef.current = null;
      pendingOAuthRef.current = null;
    }
  }

  const typeInfo = PROVIDER_TYPE_INFO.find((t) => t.id === selectedType);
  const providerDocsUrl = getProviderDocsUrl(typeInfo, i18n.language);
  const codePlanPreset = typeInfo?.codePlanPresetBaseUrl && typeInfo?.codePlanPresetModelId
    ? {
      baseUrl: typeInfo.codePlanPresetBaseUrl,
      modelId: typeInfo.codePlanPresetModelId,
    }
    : null;
  const effectiveDocsUrl = codePlanMode === 'codeplan'
    ? (typeInfo?.codePlanDocsUrl || providerDocsUrl)
    : providerDocsUrl;
  const isOAuth = typeInfo?.isOAuth ?? false;
  const supportsApiKey = typeInfo?.supportsApiKey ?? false;
  const oauthUiHidden = typeInfo?.hideOAuthUi ?? false;
  const vendorMap = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const selectedVendor = selectedType ? vendorMap.get(selectedType) : undefined;
  const showUserAgentInAddDialog = shouldShowUserAgentFieldForNewProvider(selectedType);
  const preferredOAuthMode = selectedVendor?.supportedAuthModes.includes('oauth_browser')
    ? 'oauth_browser'
    : (selectedVendor?.supportedAuthModes.includes('oauth_device')
      ? 'oauth_device'
      : null);
  // Effective OAuth mode: pure OAuth providers, or dual-mode with oauth selected
  const useOAuthFlow = isOAuth && !oauthUiHidden && (!supportsApiKey || authMode === 'oauth');
  const addModelIds = Array.from(new Set(modelId.split(/[\n,]/).map((id) => id.trim()).filter(Boolean)));
  const visibleAddModelIds = modelsExpanded ? addModelIds : addModelIds.slice(0, 8);
  const allAddModelsSelected = addModelIds.length > 0 && addModelIds.every((id) => selectedAddModels.includes(id));
  const appendModels = () => {
    const additions = modelToAdd.split(/[\n,]/).map((id) => id.trim()).filter(Boolean);
    if (!additions.length) return;
    setModelId(Array.from(new Set([...addModelIds, ...additions])).join('\n'));
    setModelToAdd('');
  };
  const removeSelectedAddModels = () => {
    setModelId(addModelIds.filter((id) => !selectedAddModels.includes(id)).join('\n'));
    setSelectedAddModels([]);
  };

  useEffect(() => {
    setSelectedAddModels((current) => current.filter((id) => addModelIds.includes(id)));
  }, [modelId]);

  useEffect(() => {
    if (!open || !selectedType || useOAuthFlow) return;
    setModelId('');
    const url = baseUrl.trim() || typeInfo?.defaultBaseUrl || '';
    if (!url || (typeInfo?.requiresApiKey && !apiKey.trim())) return;
    let active = true;
    const timer = setTimeout(() => {
      setDiscovering(true); setValidationError(null);
      void window.pincer.configuration.discoverModels({ baseUrl: url, api: apiProtocol || getDefaultProviderProtocol(selectedType), apiKey: normalizeProviderApiKeyInput(apiKey) }).then((result) => {
        if (!active) return;
        if (result.ok) setModelId(result.value.join('\n'));
        else setValidationError(i18n.language.startsWith('ru') ? 'Не удалось загрузить каталог моделей. Проверьте адрес и ключ или добавьте модели вручную.' : 'Could not load the model catalog. Check the URL and key or add models manually.');
      }).catch(() => { if (active) setValidationError(i18n.language.startsWith('ru') ? 'Каталог моделей недоступен.' : 'Model catalog unavailable.'); }).finally(() => { if (active) setDiscovering(false); });
    }, 700);
    return () => { active = false; clearTimeout(timer); setDiscovering(false); };
  }, [open, selectedType, baseUrl, apiKey, apiProtocol, useOAuthFlow]);

  useEffect(() => {
    if (!selectedVendor || !isOAuth || !supportsApiKey) {
      return;
    }
    if (oauthUiHidden) {
      setAuthMode('apikey');
      return;
    }
    setAuthMode(selectedVendor.defaultAuthMode === 'api_key' ? 'apikey' : 'oauth');
  }, [selectedVendor, isOAuth, supportsApiKey, oauthUiHidden]);

  useEffect(() => {
    if (!typeInfo?.codePlanPresetBaseUrl || !typeInfo?.codePlanPresetModelId) {
      setCodePlanMode('apikey');
      return;
    }
    setCodePlanMode(
      isCodePlanMode(
        baseUrl,
        modelId,
        typeInfo.codePlanPresetBaseUrl,
        typeInfo.codePlanPresetModelId,
      ) ? 'codeplan' : 'apikey'
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType]);

  const readGatewayResult = (value: unknown): { done: boolean; status?: string; step?: { id: string; type: string; executor?: string; title?: string; message?: string; externalUrl?: string; deviceCode?: { code: string; expiresInMinutes?: number; message?: string }; options?: Array<{ value: unknown; label: string; hint?: string }>; sensitive?: boolean; placeholder?: string } ; error?: string; modelActivation?: { modelRef?: string } } => {
    if (!value || typeof value !== 'object') throw new Error('OAuth returned an invalid response.');
    const row = value as Record<string, unknown>;
    const step = row.step && typeof row.step === 'object' ? row.step as Record<string, unknown> : undefined;
    const device = step?.deviceCode && typeof step.deviceCode === 'object' ? step.deviceCode as Record<string, unknown> : undefined;
    return {
      done: row.done === true,
      status: typeof row.status === 'string' ? row.status : undefined,
      error: typeof row.error === 'string' ? row.error : undefined,
      modelActivation: row.modelActivation && typeof row.modelActivation === 'object' ? row.modelActivation as { modelRef?: string } : undefined,
      step: step && typeof step.id === 'string' && typeof step.type === 'string' ? {
        id: step.id,
        type: step.type,
        ...(typeof step.executor === 'string' ? { executor: step.executor } : {}),
        ...(typeof step.title === 'string' ? { title: step.title } : {}),
        ...(typeof step.message === 'string' ? { message: step.message } : {}),
        ...(typeof step.externalUrl === 'string' ? { externalUrl: step.externalUrl } : {}),
        ...(device && typeof device.code === 'string' ? { deviceCode: { code: device.code, ...(typeof device.expiresInMinutes === 'number' ? { expiresInMinutes: device.expiresInMinutes } : {}), ...(typeof device.message === 'string' ? { message: device.message } : {}) } } : {}),
        ...(Array.isArray(step.options) ? { options: step.options.filter((option): option is Record<string, unknown> => Boolean(option && typeof option === 'object' && typeof (option as Record<string, unknown>).label === 'string')).map((option) => ({ value: option.value, label: String(option.label), ...(option.hint ? { hint: String(option.hint) } : {}) })) } : {}),
        ...(step.sensitive === true ? { sensitive: true } : {}),
        ...(typeof step.placeholder === 'string' ? { placeholder: step.placeholder } : {}),
      } : undefined,
    };
  };
  const processOAuthResult = async (raw: unknown, sessionId: string): Promise<void> => {
    let result = readGatewayResult(raw);
    while (!result.done && (!result.step || result.step.executor === 'gateway')) {
      if (oauthSessionRef.current !== sessionId) return;
      const next = await window.pincer.configuration.authNext({ sessionId });
      if (!next.ok) throw new Error(next.error.message);
      result = readGatewayResult(next.value);
    }
    if (oauthSessionRef.current !== sessionId) return;
    if (result.done) {
      if (result.status === 'error' || result.error) throw new Error(result.error || 'OAuth login failed.');
      setOauthFlowing(false);
      setOauthData(null);
      setManualCodeInput('');
      if (result.modelActivation?.modelRef) setModelId(result.modelActivation.modelRef.split('/').slice(1).join('/') || result.modelActivation.modelRef);
      await onOAuthComplete();
      toast.success(i18n.language.startsWith('ru') ? 'OAuth-профиль сохранён' : 'OAuth profile saved');
      return;
    }
    const step = result.step;
    if (!step) throw new Error('OAuth login did not return a next step.');
    setOauthData({
      mode: step.deviceCode ? 'device' : 'manual',
      stepType: step.type,
      sessionId,
      stepId: step.id,
      verificationUri: step.externalUrl || '',
      authorizationUrl: step.externalUrl || '',
      userCode: step.deviceCode?.code || '',
      expiresIn: (step.deviceCode?.expiresInMinutes || 10) * 60,
      message: step.deviceCode?.message || step.message || step.title,
      options: step.options,
      sensitive: step.sensitive,
      placeholder: step.placeholder,
    });
    if (step.externalUrl) {
      const opened = await window.pincer.desktop.openExternal(step.externalUrl);
      if (!opened.ok) throw new Error(opened.error.message);
    }
    if (step.type === 'action') {
      const next = await window.pincer.configuration.authNext({ sessionId, answer: { stepId: step.id } });
      if (!next.ok) throw new Error(next.error.message);
      await processOAuthResult(next.value, sessionId);
      return;
    }
    if (step.deviceCode || step.type === 'progress') {
      window.setTimeout(async () => {
        if (oauthSessionRef.current !== sessionId) return;
        try {
          const next = await window.pincer.configuration.authNext({ sessionId });
          if (next.ok) await processOAuthResult(next.value, sessionId);
          else throw new Error(next.error.message);
        } catch (error) {
          if (oauthSessionRef.current === sessionId) setOauthError(error instanceof Error ? error.message : String(error));
        }
      }, 2000);
    }
  };
  const handleStartOAuth = async () => {
    if (!selectedType) return;
    setOauthFlowing(true); setOauthData(null); setOauthError(null); setManualCodeInput('');
    const sessionId = crypto.randomUUID(); oauthSessionRef.current = sessionId;
    try {
      // setup.detect also probes local runtimes in an isolated worker. On
      // Windows that worker can exit before settling and temporarily occupy
      // OpenClaw's setup admission lock. OAuth needs only the manifest choice.
      const authChoice = typeInfo?.oauthChoiceId || selectedType;
      const started = await window.pincer.configuration.authStart({ sessionId, authChoice });
      if (!started.ok) throw new Error(started.error.message);
      await processOAuthResult(started.value, sessionId);
    } catch (error) {
      if (oauthSessionRef.current === sessionId) setOauthError(error instanceof Error ? error.message : String(error));
    }
  };
  const handleCancelOAuth = async () => {
    const sessionId = oauthSessionRef.current; oauthSessionRef.current = null;
    setOauthFlowing(false); setOauthData(null); setManualCodeInput('');
    if (sessionId) await window.pincer.configuration.authCancel(sessionId).catch(() => undefined);
  };
  const handleSubmitManualOAuthCode = async () => {
    if (!oauthData || !manualCodeInput.trim()) return;
    try {
      const next = await window.pincer.configuration.authNext({ sessionId: oauthData.sessionId, answer: { stepId: oauthData.stepId, value: manualCodeInput.trim() } });
      if (!next.ok) throw new Error(next.error.message);
      setOauthData(null);
      await processOAuthResult(next.value, oauthData.sessionId);
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : String(error));
    }
  };
  const handleOAuthAnswer = async (value?: unknown, includeValue = true) => {
    if (!oauthData) return;
    try {
      const next = await window.pincer.configuration.authNext({ sessionId: oauthData.sessionId, answer: { stepId: oauthData.stepId, ...(includeValue ? { value } : {}) } });
      if (!next.ok) throw new Error(next.error.message);
      setOauthData(null);
      await processOAuthResult(next.value, oauthData.sessionId);
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : String(error));
    }
  };
  const availableTypes = PROVIDER_TYPE_INFO.filter((type) => {
    // Skip providers that are temporarily hidden from the UI.
    if (type.hidden) return false;

    // MiniMax portal variants are mutually exclusive — hide BOTH variants
    // when either one already exists (account may have vendorId of either variant).
    const hasMinimax = existingVendorIds.has('minimax-portal') || existingVendorIds.has('minimax-portal-cn');
    if ((type.id === 'minimax-portal' || type.id === 'minimax-portal-cn') && hasMinimax) return false;

    // Z.AI CN/Global both map to OpenClaw key `zai` — mutually exclusive in the UI.
    const hasZai = existingVendorIds.has('zai') || existingVendorIds.has('zai-global');
    if (isZaiProviderType(type.id) && hasZai) return false;

    const vendor = vendorMap.get(type.id);
    if (!vendor) {
      return !existingVendorIds.has(type.id) || type.id === 'custom';
    }
    return vendor.supportsMultipleAccounts || !existingVendorIds.has(type.id);
  });

  const handleAdd = async () => {
    if (!selectedType) return;

    const hasMinimax = existingVendorIds.has('minimax-portal') || existingVendorIds.has('minimax-portal-cn');
    if ((selectedType === 'minimax-portal' || selectedType === 'minimax-portal-cn') && hasMinimax) {
      toast.error(t('aiProviders.toast.minimaxConflict'));
      return;
    }
    const hasZai = existingVendorIds.has('zai') || existingVendorIds.has('zai-global');
    if (isZaiProviderType(selectedType) && hasZai) {
      toast.error(t('aiProviders.toast.zaiConflict'));
      return;
    }

    setSaving(true);
    setValidationError(null);

    try {
      const requiresKey = !useOAuthFlow && (typeInfo?.requiresApiKey ?? false);
      const normalizedApiKey = normalizeProviderApiKeyInput(apiKey);
      if (requiresKey && !normalizedApiKey) {
        setValidationError(t('aiProviders.toast.invalidKey')); // reusing invalid key msg or should add 'required' msg? null checks
        setSaving(false);
        return;
      }

      let ids = modelId.trim().split(/[\n,]/).map((id) => id.trim()).filter(Boolean);
      if (!ids.length && useOAuthFlow) {
        const result = await window.pincer.configuration.modelsList();
        if (result.ok && result.value && typeof result.value === 'object') {
          const rows: unknown[] = Array.isArray((result.value as Record<string, unknown>).models) ? (result.value as Record<string, unknown>).models as unknown[] : Array.isArray(result.value) ? result.value as unknown[] : [];
          ids = rows.map((row) => {
            if (typeof row === 'string') return row;
            if (!row || typeof row !== 'object') return '';
            const value = row as Record<string, unknown>;
            const provider = typeof value.provider === 'string' ? value.provider : '';
            const id = typeof value.id === 'string' ? value.id : typeof value.key === 'string' ? value.key.split('/').slice(1).join('/') : '';
            return !provider || provider === selectedType || provider === 'openai' || provider === 'anthropic' ? id : '';
          }).filter(Boolean);
        }
      }
      if (!ids.length) {
        const result = await window.pincer.configuration.discoverModels({ baseUrl: baseUrl.trim() || typeInfo?.defaultBaseUrl || '', api: apiProtocol || getDefaultProviderProtocol(selectedType), apiKey: normalizedApiKey });
        if (!result.ok) throw new Error(i18n.language.startsWith('ru') ? 'Не удалось загрузить модели. Проверьте адрес и API-ключ.' : 'Could not load models. Check the URL and API key.');
        ids = result.value;
      }
      if (!ids.length) { setValidationError(t('pincer.modelIdRequired')); return; }
      const discovery = { models: ids };
      await onAdd(
        selectedType,
        name || (typeInfo?.id === 'custom' ? t('aiProviders.custom') : typeInfo?.name) || selectedType,
        normalizedApiKey,
        {
          baseUrl: baseUrl.trim() || undefined,
          apiProtocol: apiProtocol || getDefaultProviderProtocol(selectedType),
          headers: userAgent.trim() ? { 'User-Agent': userAgent.trim() } : undefined,
          // Keep the account model unset: the chat chooses from the complete
          // discovered catalog instead of silently pinning the first entry.
          model: '',
          customModels: discovery.models,
          authMode: useOAuthFlow ? (preferredOAuthMode || 'oauth_device') : selectedType === 'ollama'
            ? 'local'
            : (isOAuth && supportsApiKey && authMode === 'apikey')
              ? 'api_key'
              : vendorMap.get(selectedType)?.defaultAuthMode || 'api_key',
        }
      );
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent asChild className="w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border-0 shadow-2xl bg-surface-modal overflow-hidden">
        <Card data-testid="add-provider-dialog">
        <CardHeader className="relative pb-2 shrink-0">
          <DialogTitle asChild>
            <CardTitle className="text-2xl font-sans font-semibold">{t('aiProviders.dialog.title')}</CardTitle>
          </DialogTitle>
          <DialogDescription asChild>
            <CardDescription className="text-sm mt-1 text-foreground/70">
              {t('aiProviders.dialog.desc')}
            </CardDescription>
          </DialogDescription>
          <Button
            data-testid="add-provider-close-button"
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 h-8 w-8 -mr-2 -mt-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto flex-1 p-6">
          {!selectedType ? (
            <div className="pincer-grid-3 gap-3">
              {availableTypes.map((type) => (
                <button
                  data-testid={`add-provider-type-${type.id}`}
                  key={type.id}
                  onClick={() => {
                    setSelectedType(type.id);
                    setName(type.id === 'custom' ? t('aiProviders.custom') : type.name);
                    setBaseUrl(type.defaultBaseUrl || '');
                    setApiProtocol(getDefaultProviderProtocol(type.id));
                    setModelId('');
                    setModelToAdd('');
                    setSelectedAddModels([]);
                    setModelsExpanded(false);
                    setUserAgent('');
                    setShowAdvancedConfig(false);
                    setCodePlanMode('apikey');
                  }}
                  className="p-4 rounded-2xl border border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-center group"
                >
                  <div className="h-12 w-12 mx-auto mb-3 flex items-center justify-center bg-black/5 dark:bg-white/5 rounded-xl shadow-sm border border-black/5 dark:border-white/5 group-hover:scale-105 transition-transform">
                    {getProviderIconUrl(type.id) ? (
                      <img src={getProviderIconUrl(type.id)} alt={type.name} className={cn('h-6 w-6', shouldInvertInDark(type.id) && 'dark:invert')} />
                    ) : (
                      <span className="text-2xl">{type.icon}</span>
                    )}
                  </div>
                  <p className="font-medium text-meta">{type.id === 'custom' ? t('aiProviders.custom') : type.name}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-transparent border border-black/5 dark:border-white/5 shadow-sm">
                <div className="h-10 w-10 shrink-0 flex items-center justify-center bg-black/5 dark:bg-white/5 rounded-xl">
                  {getProviderIconUrl(selectedType!) ? (
                    <img src={getProviderIconUrl(selectedType!)} alt={typeInfo?.name} className={cn('h-6 w-6', shouldInvertInDark(selectedType!) && 'dark:invert')} />
                  ) : (
                    <span className="text-xl">{typeInfo?.icon}</span>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-sm">{typeInfo?.id === 'custom' ? t('aiProviders.custom') : typeInfo?.name}</p>
                  <button
                  data-testid="add-provider-change-type"
                  onClick={() => {
                    setSelectedType(null);
                    setValidationError(null);
                    setBaseUrl('');
                    setApiProtocol('openai-completions');
                    setModelId('');
                    setModelToAdd('');
                    setSelectedAddModels([]);
                    setModelsExpanded(false);
                    setUserAgent('');
                    setShowAdvancedConfig(false);
                    setCodePlanMode('apikey');
                  }}
                  className="text-meta text-blue-500 hover:text-blue-600 font-medium"
                >
                    {t('aiProviders.dialog.change')}
                  </button>
                  {effectiveDocsUrl && (
                    <>
                      <span className="mx-2 text-foreground/20">|</span>
                      <a
                        href={effectiveDocsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-meta text-blue-500 hover:text-blue-600 font-medium inline-flex items-center gap-1"
                      >
                        {t('aiProviders.dialog.customDoc')}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-6 bg-transparent p-0">
                <div className="space-y-2.5">
                  <Label htmlFor="name" className={labelClasses}>{t('aiProviders.dialog.displayName')}</Label>
                  <Input
                    data-testid="add-provider-name-input"
                    id="name"
                    placeholder={typeInfo?.id === 'custom' ? t('aiProviders.custom') : typeInfo?.name}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClasses}
                  />
                </div>

                {/* Auth mode toggle for providers supporting both */}
                {isOAuth && supportsApiKey && !oauthUiHidden && (
                  <div className="flex rounded-xl border border-black/10 dark:border-white/10 overflow-hidden text-meta font-medium shadow-sm bg-transparent p-1 gap-1">
                    <button
                      data-testid="add-provider-auth-oauth-tab"
                      onClick={() => setAuthMode('oauth')}
                      className={cn(
                        'flex-1 py-2 px-3 rounded-lg transition-colors',
                        authMode === 'oauth' ? 'bg-black/5 dark:bg-white/10 text-foreground' : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5'
                      )}
                    >
                      {t('aiProviders.oauth.loginMode')}
                    </button>
                    <button
                      data-testid="add-provider-auth-apikey-tab"
                      onClick={() => setAuthMode('apikey')}
                      className={cn(
                        'flex-1 py-2 px-3 rounded-lg transition-colors',
                        authMode === 'apikey' ? 'bg-black/5 dark:bg-white/10 text-foreground' : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5'
                      )}
                    >
                      {t('aiProviders.oauth.apikeyMode')}
                    </button>
                  </div>
                )}

                {/* API Key input — shown for non-OAuth providers or when apikey mode is selected */}
                {(!isOAuth || (supportsApiKey && authMode === 'apikey')) && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="apiKey" className={labelClasses}>{t('aiProviders.dialog.apiKey')}</Label>
                      {typeInfo?.apiKeyUrl && (
                        <a
                          href={typeInfo.apiKeyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-meta text-blue-500 hover:text-blue-600 font-medium flex items-center gap-1"
                          tabIndex={-1}
                        >
                          {t('aiProviders.oauth.getApiKey')} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        data-testid="add-provider-api-key-input"
                        id="apiKey"
                        type={showKey ? 'text' : 'password'}
                        placeholder={typeInfo?.id === 'ollama' ? t('aiProviders.notRequired') : typeInfo?.placeholder}
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          setValidationError(null);
                        }}
                        className={inputClasses}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {validationError && (
                      <p className="text-meta text-red-500 font-medium">{validationError}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t('aiProviders.dialog.apiKeyStored')}
                    </p>
                  </div>
                )}

                {typeInfo?.showBaseUrl && (
                  <div className="space-y-2.5">
                    <Label htmlFor="baseUrl" className={labelClasses}>{t('aiProviders.dialog.baseUrl')}</Label>
                    <Input
                      data-testid="add-provider-base-url-input"
                      id="baseUrl"
                      placeholder={getProtocolBaseUrlPlaceholder(apiProtocol)}
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      className={inputClasses}
                    />
                  </div>
                )}

                <div className="space-y-2.5">
                  <Label htmlFor="provider-models" className={labelClasses}>{i18n.language.startsWith('ru') ? 'Модели' : 'Models'}</Label>
                  <p data-testid="add-provider-models-auto-hint" className="text-xs text-muted-foreground">
                    {discovering ? (i18n.language.startsWith('ru') ? 'Загружаем все доступные модели…' : 'Loading all available models…') : (i18n.language.startsWith('ru') ? 'Каталог загружается автоматически по адресу и API-ключу. При необходимости можно добавить модели вручную.' : 'The catalog loads automatically using the URL and API key. You can also add models manually.')}
                  </p>
                  <Textarea id="provider-models" data-testid="add-provider-models-input" rows={3} value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="model-id" className={cn(inputClasses, 'h-auto min-h-[92px] resize-y py-3')} />
                  <div className="flex gap-2">
                    <Input value={modelToAdd} onChange={(event) => setModelToAdd(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); appendModels(); } }} placeholder={i18n.language.startsWith('ru') ? 'Добавить модель' : 'Add model'} className={cn(inputClasses, 'flex-1')} />
                    <Button type="button" variant="outline" onClick={appendModels} disabled={!modelToAdd.trim()} className="shrink-0"><Plus className="mr-1.5 h-4 w-4" />{i18n.language.startsWith('ru') ? 'Добавить' : 'Add'}</Button>
                  </div>
                  {!!addModelIds.length && <>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <button type="button" onClick={() => setSelectedAddModels(allAddModelsSelected ? [] : addModelIds)} className="text-blue-500 hover:text-blue-600">
                        {allAddModelsSelected ? (i18n.language.startsWith('ru') ? 'Снять выбор' : 'Clear selection') : (i18n.language.startsWith('ru') ? 'Выбрать все' : 'Select all')}
                      </button>
                      {selectedAddModels.length > 0 && <button type="button" onClick={removeSelectedAddModels} className="text-destructive hover:text-destructive/80">{i18n.language.startsWith('ru') ? `Удалить выбранные (${selectedAddModels.length})` : `Delete selected (${selectedAddModels.length})`}</button>}
                      {addModelIds.length > 8 && <button type="button" onClick={() => setModelsExpanded((value) => !value)} className="ml-auto text-muted-foreground hover:text-foreground">{modelsExpanded ? (i18n.language.startsWith('ru') ? 'Свернуть' : 'Show less') : (i18n.language.startsWith('ru') ? `Показать все (+${addModelIds.length - 8})` : `Show all (+${addModelIds.length - 8})`)}</button>}
                    </div>
                    <div data-testid="add-provider-model-list" className="flex max-h-56 flex-wrap gap-1.5 overflow-auto rounded-xl border border-border/70 p-2">{visibleAddModelIds.map((id) => <span key={id} className={cn("inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-1 font-mono text-xs", selectedAddModels.includes(id) ? 'border-blue-500/60 bg-blue-500/10' : 'border-border bg-black/[.025] dark:bg-white/[.035]')}><input type="checkbox" aria-label={`${i18n.language.startsWith('ru') ? 'Выбрать модель' : 'Select model'} ${id}`} checked={selectedAddModels.includes(id)} onChange={() => setSelectedAddModels((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} className="h-3 w-3 rounded border-border text-blue-500 focus:ring-blue-500/50" /><span className="max-w-[24rem] break-words">{id}</span><button type="button" aria-label={`${i18n.language.startsWith('ru') ? 'Удалить модель' : 'Delete model'} ${id}`} onClick={() => { setModelId(addModelIds.filter((value) => value !== id).join('\n')); setSelectedAddModels((current) => current.filter((value) => value !== id)); }} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-3 w-3" /></button></span>)}</div>
                  </>}
                </div>
                {codePlanPreset && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label className={labelClasses}>{t('aiProviders.dialog.codePlanPreset')}</Label>
                      {typeInfo?.codePlanDocsUrl && (
                        <a
                          href={typeInfo.codePlanDocsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-meta text-blue-500 hover:text-blue-600 font-medium inline-flex items-center gap-1"
                          tabIndex={-1}
                        >
                          {t('aiProviders.dialog.codePlanDoc')}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex gap-2 text-meta">
                      <button
                        type="button"
                        data-testid="add-provider-codeplan-apikey-tab"
                        onClick={() => {
                          setCodePlanMode('apikey');
                          setBaseUrl(typeInfo?.defaultBaseUrl || '');
                          if (modelId.trim() === codePlanPreset.modelId) {
                            setModelId('');
                          }
                          setValidationError(null);
                        }}
                        className={cn("flex-1 py-1.5 px-3 rounded-lg border transition-colors", codePlanMode === 'apikey' ? "bg-surface-modal border-black/20 dark:border-white/20 shadow-sm font-medium" : "border-transparent bg-black/5 dark:bg-white/5 text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10")}
                      >
                        {t('aiProviders.authModes.apiKey')}
                      </button>
                      <button
                        type="button"
                        data-testid="add-provider-codeplan-mode-tab"
                        onClick={() => {
                          setCodePlanMode('codeplan');
                          setBaseUrl(codePlanPreset.baseUrl);
                          setModelId(codePlanPreset.modelId);
                          setValidationError(null);
                        }}
                        className={cn("flex-1 py-1.5 px-3 rounded-lg border transition-colors", codePlanMode === 'codeplan' ? "bg-surface-modal border-black/20 dark:border-white/20 shadow-sm font-medium" : "border-transparent bg-black/5 dark:bg-white/5 text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10")}
                      >
                        {t('aiProviders.dialog.codePlanMode')}
                      </button>
                    </div>
                    {codePlanMode === 'codeplan' && (
                      <p className="text-xs text-muted-foreground">
                        {t('aiProviders.dialog.codePlanPresetDesc', {
                          baseUrl: codePlanPreset.baseUrl,
                          modelId: codePlanPreset.modelId,
                        })}
                      </p>
                    )}
                  </div>
                )}
                {selectedType === 'custom' && (
                <div className="space-y-2.5">
                  <Label className={labelClasses}>{t('aiProviders.dialog.protocol', 'Protocol')}</Label>
                  <select value={apiProtocol} onChange={(event) => setApiProtocol(event.target.value as ProviderAccount['apiProtocol'])} className={cn(inputClasses, 'w-full px-3')}>
                    {PROVIDER_PROTOCOLS.map((protocol) => <option key={protocol} value={protocol}>{protocol}</option>)}
                  </select>
                  </div>
                )}
                {showUserAgentInAddDialog && (
                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedConfig((value) => !value)}
                      className="flex items-center justify-between w-full text-sm font-bold text-foreground/80 hover:text-foreground transition-colors"
                    >
                      <span>{t('aiProviders.dialog.advancedConfig')}</span>
                      <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvancedConfig && "rotate-180")} />
                    </button>
                    {showAdvancedConfig && (
                      <div className="space-y-2.5 pt-1">
                        <Label htmlFor="userAgent" className={labelClasses}>{t('aiProviders.dialog.userAgent')}</Label>
                        <Input
                          id="userAgent"
                          placeholder={t('aiProviders.dialog.userAgentPlaceholder')}
                          value={userAgent}
                          onChange={(e) => setUserAgent(e.target.value)}
                          className={inputClasses}
                        />
                      </div>
                    )}
                  </div>
                )}
                {/* Device OAuth Trigger — only shown when in OAuth mode */}
                {useOAuthFlow && (
                  <div className="space-y-4 pt-2">
                    <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-5 text-center">
                      <p className="text-meta font-medium text-blue-600 dark:text-blue-400 mb-4 block">
                        {t('aiProviders.oauth.loginPrompt')}
                      </p>
                      <Button
                        data-testid="add-provider-oauth-login-button"
                        onClick={handleStartOAuth}
                        disabled={oauthFlowing}
                        className="h-[42px] w-full rounded-lg bg-brand font-semibold text-white shadow-sm hover:bg-brand-hover"
                      >
                        {oauthFlowing ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('aiProviders.oauth.waiting')}</>
                        ) : (
                          t('aiProviders.oauth.loginButton')
                        )}
                      </Button>
                    </div>

                    {/* OAuth Active State Modal / Inline View */}
                    {oauthFlowing && (
                      <div className="mt-4 p-5 border border-black/10 dark:border-white/10 rounded-2xl bg-surface-modal shadow-sm relative overflow-hidden">
                        {/* Background pulse effect */}
                        <div className="absolute inset-0 bg-blue-500/5 animate-pulse" />

                        <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-5">
                          {oauthError ? (
                            <div className="text-red-500 space-y-3">
                              <XCircle className="h-10 w-10 mx-auto" />
                              <p className="font-semibold text-sm">{t('aiProviders.oauth.authFailed')}</p>
                              <p className="text-meta opacity-80">{oauthError}</p>
                              <Button variant="outline" size="sm" onClick={handleCancelOAuth} className="mt-2 h-9 rounded-lg px-6">
                                {t('aiProviders.oauth.tryAgain')}
                              </Button>
                            </div>
                          ) : !oauthData ? (
                            <div className="space-y-4 py-6">
                              <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto" />
                              <p className="text-meta font-medium text-muted-foreground animate-pulse">{t('aiProviders.oauth.requestingCode')}</p>
                            </div>
                          ) : oauthData.mode === 'manual' ? (
                            <div className="space-y-4 w-full">
                              <div className="space-y-2">
                                <h3 className="font-semibold text-base text-foreground">{t('aiProviders.oauth.completeLogin')}</h3>
                                <p className="text-meta text-muted-foreground text-left bg-black/5 dark:bg-white/5 p-4 rounded-xl">
                                  {oauthData.message || t('aiProviders.oauth.manualInstructions')}
                                </p>
                              </div>

                              <Button
                                variant="secondary"
                                className="h-[42px] w-full rounded-lg font-semibold"
                                onClick={() => oauthData.authorizationUrl && void window.pincer.desktop.openExternal(oauthData.authorizationUrl)}
                                disabled={!oauthData.authorizationUrl}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                {t('aiProviders.oauth.openLoginPage')}
                              </Button>

                              {oauthData.options?.length ? (
                                <div className="grid gap-2">
                                  {oauthData.options.map((option, index) => (
                                    <Button key={`${option.label}-${index}`} variant="outline" className="min-h-[42px] h-auto rounded-lg py-2" onClick={() => void handleOAuthAnswer(option.value)}>
                                      <span>{option.label}{option.hint ? <span className="block text-xs font-normal text-muted-foreground">{option.hint}</span> : null}</span>
                                    </Button>
                                  ))}
                                </div>
                              ) : oauthData.stepType === 'confirm' ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <Button variant="outline" onClick={() => void handleOAuthAnswer(false)}>Нет</Button>
                                  <Button onClick={() => void handleOAuthAnswer(true)}>Да</Button>
                                </div>
                              ) : oauthData.stepType === 'text' ? (
                                <>
                                  <Input
                                    type={oauthData.sensitive ? 'password' : 'text'}
                                    placeholder={oauthData.placeholder || 'Вставьте код или URL возврата'}
                                    value={manualCodeInput}
                                    onChange={(e) => setManualCodeInput(e.target.value)}
                                    className={inputClasses}
                                  />
                                  <Button
                                    className="h-[42px] w-full rounded-lg bg-brand font-semibold text-white hover:bg-brand-hover"
                                    onClick={handleSubmitManualOAuthCode}
                                    disabled={!manualCodeInput.trim()}
                                  >
                                    Продолжить
                                  </Button>
                                </>
                              ) : (
                                <Button className="h-[42px] w-full rounded-lg" onClick={() => void handleOAuthAnswer(undefined, false)}>Продолжить</Button>
                              )}

                              <Button variant="ghost" className="h-[42px] w-full rounded-lg font-semibold text-muted-foreground" onClick={handleCancelOAuth}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-5 w-full">
                              <div className="space-y-2">
                                <h3 className="font-semibold text-base text-foreground">{t('aiProviders.oauth.approveLogin')}</h3>
                                <div className="text-meta text-muted-foreground text-left mt-2 space-y-1.5 bg-black/5 dark:bg-white/5 p-4 rounded-xl">
                                  <p>1. {t('aiProviders.oauth.step1')}</p>
                                  <p>2. {t('aiProviders.oauth.step2')}</p>
                                  <p>3. {t('aiProviders.oauth.step3')}</p>
                                </div>
                              </div>

                              <div className="flex items-center justify-center gap-3 p-4 bg-transparent border border-black/5 dark:border-white/5 rounded-xl shadow-inner">
                                <code className="text-3xl font-mono tracking-[0.2em] font-bold text-foreground">
                                  {oauthData.userCode}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-10 w-10 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                                  onClick={() => {
                                    navigator.clipboard.writeText(oauthData.userCode);
                                    toast.success(t('aiProviders.oauth.codeCopied'));
                                  }}
                                >
                                  <Copy className="h-5 w-5" />
                                </Button>
                              </div>

                              <Button
                                variant="secondary"
                                className="h-[42px] w-full rounded-lg font-semibold"
                                onClick={() => oauthData.verificationUri && void window.pincer.desktop.openExternal(oauthData.verificationUri)}
                                disabled={!oauthData.verificationUri}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                {t('aiProviders.oauth.openLoginPage')}
                              </Button>

                              <div className="flex items-center justify-center gap-2 text-meta font-medium text-muted-foreground pt-2">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                <span>{t('aiProviders.oauth.waitingApproval')}</span>
                              </div>

                              <Button variant="ghost" className="h-[42px] w-full rounded-lg font-semibold text-muted-foreground" onClick={handleCancelOAuth}>
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Separator className="bg-black/10 dark:bg-white/10" />

              <div className="flex justify-end gap-3">
                <Button
                  data-testid="add-provider-submit-button"
                  onClick={handleAdd}
                  className={cn("h-[42px] rounded-lg px-8 text-meta font-semibold shadow-sm", useOAuthFlow && oauthFlowing && "hidden")}
                  disabled={!selectedType || saving || discovering}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {t('aiProviders.dialog.add')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </DialogContent>
    </Dialog>
  );
}
