import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Trash2, AlertCircle, Plus, Copy, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useGatewayStore } from './adapter';


import { ChannelConfigModal } from './ChannelConfigModal';
const isGatewayStopped = (status: { state: string }) => status.state !== 'running';
import { cn } from '@/lib/utils';
import { CHANNEL_ICONS, CHANNEL_NAMES, CHANNEL_META, getPrimaryChannels, type ChannelType } from './channel-types';
const usesPluginManagedQrAccounts = (type: string) => ['whatsapp', 'wechat'].includes(type);
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import telegramIcon from '@/assets/channels/telegram.svg';
import discordIcon from '@/assets/channels/discord.svg';
import whatsappIcon from '@/assets/channels/whatsapp.svg';
import wechatIcon from '@/assets/channels/wechat.svg';
import dingtalkIcon from '@/assets/channels/dingtalk.svg';
import feishuIcon from '@/assets/channels/feishu.svg';
import wecomIcon from '@/assets/channels/wecom.svg';
import qqIcon from '@/assets/channels/qq.svg';


import type { WorkspaceState } from '../../shared/contract';
type Group = { channelType: string; status: string; accounts: { accountId: string; name: string; agentId?: string; lastError?: string; statusReason?: string; status: string; running: boolean }[] };
const rec = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
export function Channels({ workspace, connected }: { workspace: WorkspaceState | null; connected: boolean }) {
 const { t } = useTranslation('channels'); const gatewayStatus = useGatewayStore((state) => state.status);
 const [configuredGroups, setGroups] = useState<Group[]>([]); const [error, setError] = useState('');
 const [isUsingStableValue, setLoading] = useState(false);
 const [showDiagnostics, setDiagnostics] = useState(false); const [diagnosticsText, setDiagnosticsText] = useState('');
 const [showConfigModal, setShowConfigModal] = useState(false); const [selectedChannelType, setSelectedChannelType] = useState<ChannelType | null>(null);
 const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
 const [allowExistingConfigInModal, setAllowExistingConfigInModal] = useState(true); const [allowEditAccountIdInModal, setAllowEditAccountIdInModal] = useState(false);
 const [existingAccountIdsForModal, setExistingAccountIdsForModal] = useState<string[]>([]);
 const [initialConfigValuesForModal, setInitialConfigValuesForModal] = useState<Record<string, string> | undefined>();
 const [deleteTarget, setDeleteTarget] = useState<{ channelType: string; accountId?: string } | null>(null);
 const visibleAgents = workspace?.agents || [];
 const configuredTypes = configuredGroups.map((group) => group.channelType);
 const unsupportedGroups = getPrimaryChannels().filter((type) => !configuredTypes.includes(type));
 const displayedGatewayHealth = { state: error ? 'unresponsive' : 'healthy' };
 const healthReasonLabel = error; const diagnosticsLoading = isUsingStableValue;
 const fetchPageData = useCallback(async (_options?: { probe: boolean }) => {
   if (!connected) return; setLoading(true); setError('');
   try { const result = await window.pincer.management.list('channels'); if (!result.ok) { setError(result.error.message); return; }
     setDiagnosticsText(JSON.stringify(result.value, null, 2));
     setGroups(Object.entries(rec(result.value.channelAccounts)).map(([channelType, accounts]) => {
       const rows = (Array.isArray(accounts) ? accounts : []).map((entry) => { const row = rec(entry); return { accountId: String(row.accountId || 'default'), name: String(row.name || row.accountId || 'default'), status: row.connected === true ? 'connected' : row.lastError ? 'error' : row.running === true ? 'connecting' : 'disconnected', running: row.running === true, agentId: typeof row.agentId === 'string' ? row.agentId : undefined, lastError: typeof row.lastError === 'string' ? row.lastError : undefined }; });
       return { channelType, accounts: rows, status: rows.some((row) => row.status === 'connected') ? 'connected' : rows.some((row) => row.status === 'error') ? 'error' : 'disconnected' };
     }));
   } catch (failure) { setError(String(failure)); } finally { setLoading(false); }
 }, [connected]);
 useEffect(() => { void fetchPageData(); }, [fetchPageData]);
 const handleRefresh = () => void fetchPageData();
 const scheduleConvergenceRefresh = handleRefresh;
 const statusLabel = (status: string) => t('status.' + status);
 const handleRestartGateway = () => { toast.info(t('pincer.channelConfigUnavailable')); };
 const handleCopyDiagnostics = () => navigator.clipboard.writeText(diagnosticsText).then(() => toast.success(t('pincer.linkCopied')));
 const handleToggleDiagnostics = () => setDiagnostics((value) => !value);
 const handleBindAgent = (_channel: string, _account: string, _agent: string) => { toast.info(t('pincer.channelConfigUnavailable')); };
 const handleDelete = async () => { throw new Error(t('pincer.channelConfigUnavailable')); };
 const createNewAccountId = (_channel: string, ids: string[]) => { let index = 1; while (ids.includes('account-' + index)) index++; return 'account-' + index; };
  return (
    <div
      data-testid="channels-page"
      className="openx-page-root"
    >
      <div className="openx-page-frame">
        <div className="openx-page-header">
          <div>
            <h1 className="openx-page-title">
              {t('title')}
            </h1>
            <p className="text-subtitle text-foreground/70 font-medium">{t('subtitle')}</p>
          </div>

          <div className="flex items-center gap-3 md:mt-2">
            <Button
              data-testid="channels-refresh-button"
              variant="outline"
              onClick={handleRefresh}
              disabled={gatewayStatus.state !== 'running'}
              title={t('refresh')}
              aria-label={t('refresh')}
              className="h-9 w-9 rounded-full border-black/10 bg-transparent p-0 text-foreground/80 shadow-none transition-colors hover:bg-black/5 hover:text-foreground dark:border-white/10 dark:hover:bg-white/5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isUsingStableValue && 'animate-spin')} />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 pb-10 min-h-0 -mr-2">
          {isGatewayStopped(gatewayStatus) && (
            <div className="mb-8 p-4 rounded-xl border border-yellow-500/50 bg-yellow-500/10 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              <span className="text-yellow-700 dark:text-yellow-400 text-sm font-medium">{t('gatewayWarning')}</span>
            </div>
          )}

          {gatewayStatus.state === 'running' && displayedGatewayHealth.state !== 'healthy' && (
            <div
              data-testid="channels-health-banner"
              className={cn(
                'mb-8 rounded-xl border p-4',
                displayedGatewayHealth.state === 'unresponsive'
                  ? 'border-destructive/50 bg-destructive/10'
                  : 'border-yellow-500/50 bg-yellow-500/10',
              )}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                  <AlertCircle
                    className={cn(
                      'mt-0.5 h-5 w-5 shrink-0',
                      displayedGatewayHealth.state === 'unresponsive'
                        ? 'text-destructive'
                        : 'text-yellow-600 dark:text-yellow-400',
                    )}
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {t(`health.state.${displayedGatewayHealth.state}`)}
                    </p>
                    {healthReasonLabel && <p className="mt-1 text-sm text-foreground/75">{healthReasonLabel}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled title={t('pincer.channelConfigUnavailable')}
                    data-testid="channels-restart-gateway"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full text-xs"
                    onClick={() => {
                      void handleRestartGateway();
                    }}
                  >
                    <RotateCcw className="mr-2 h-3.5 w-3.5" />
                    {t('health.restartGateway')}
                  </Button>
                  <Button
                    data-testid="channels-copy-diagnostics"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full text-xs"
                    disabled={diagnosticsLoading}
                    onClick={() => {
                      void handleCopyDiagnostics();
                    }}
                  >
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    {t('health.copyDiagnostics')}
                  </Button>
                  <Button
                    data-testid="channels-toggle-diagnostics"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full text-xs"
                    disabled={diagnosticsLoading}
                    onClick={() => {
                      void handleToggleDiagnostics();
                    }}
                  >
                    {showDiagnostics ? (
                      <ChevronUp className="mr-2 h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="mr-2 h-3.5 w-3.5" />
                    )}
                    {showDiagnostics ? t('health.hideDiagnostics') : t('health.viewDiagnostics')}
                  </Button>
                </div>
              </div>

              {showDiagnostics && diagnosticsText && (
                <div className="mt-4 rounded-xl border border-black/10 dark:border-white/10 bg-background/80 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{t('health.diagnosticsTitle')}</p>
                  <pre
                    data-testid="channels-diagnostics"
                    className="max-h-[320px] overflow-auto whitespace-pre-wrap break-all text-tiny text-foreground/85"
                  >
                    {diagnosticsText}
                  </pre>
                </div>
              )}
            </div>
          )}

          {error && gatewayStatus.state === 'running' && (
            <div className="mb-8 p-4 rounded-xl border border-destructive/50 bg-destructive/10 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="text-destructive text-sm font-medium">{t('loadError')}</span>
            </div>
          )}

          {configuredGroups.length > 0 && (
            <div className="mb-12">
              <h2 className="openx-section-title">{t('configured')}</h2>
              <div className="space-y-4">
                {configuredGroups.map((group) => (
                  <div
                    key={group.channelType}
                    className="rounded-2xl border border-black/10 dark:border-white/10 p-4 bg-transparent"
                  >
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-[40px] w-[40px] shrink-0 flex items-center justify-center text-foreground bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-full shadow-sm">
                          <ChannelLogo type={group.channelType as ChannelType} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-foreground truncate">
                            {CHANNEL_NAMES[group.channelType as ChannelType] || group.channelType}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{group.channelType}</span>
                            <span className="w-1 h-1 rounded-full bg-black/20 dark:bg-white/20" />
                            <span className="flex items-center gap-1">
                              <span
                                className={cn(
                                  'inline-block h-1.5 w-1.5 rounded-full shrink-0',
                                  group.status === 'connected' && 'bg-green-500',
                                  group.status === 'connecting' && 'bg-sky-500 animate-pulse',
                                  group.status === 'degraded' && 'bg-yellow-500',
                                  group.status === 'error' && 'bg-red-500',
                                  group.status === 'disconnected' && 'bg-muted-foreground',
                                )}
                              />
                              {statusLabel(group.status)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs rounded-full"
                          onClick={() => {
                            const shouldUseGeneratedAccountId = !usesPluginManagedQrAccounts(group.channelType);
                            const nextAccountId = shouldUseGeneratedAccountId
                              ? createNewAccountId(
                                  group.channelType,
                                  group.accounts.map((item) => item.accountId),
                                )
                              : undefined;
                            setSelectedChannelType(group.channelType as ChannelType);
                            setSelectedAccountId(nextAccountId);
                            setAllowExistingConfigInModal(false);
                            setAllowEditAccountIdInModal(shouldUseGeneratedAccountId);
                            setExistingAccountIdsForModal(group.accounts.map((item) => item.accountId));
                            setInitialConfigValuesForModal(undefined);
                            setShowConfigModal(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          {t('account.add')}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget({ channelType: group.channelType })}
                          title={t('account.deleteChannel')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {group.accounts.map((account) => {
                        const displayName =
                          account.accountId === 'default' && account.name === account.accountId
                            ? t('account.mainAccount')
                            : account.name;
                        return (
                          <div
                            key={`${group.channelType}-${account.accountId}`}
                            className="rounded-xl bg-black/5 dark:bg-white/5 px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-meta font-medium text-foreground truncate">{displayName}</p>
                                </div>
                                {account.lastError && (
                                  <div className="text-xs text-destructive mt-1">{account.lastError}</div>
                                )}
                                {!account.lastError && account.statusReason && account.status === 'degraded' && (
                                  <div className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                                    {t(`health.reasons.${account.statusReason}`)}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">{t('account.bindAgentLabel')}</span>
                                <select
                                  className="h-8 rounded-lg border border-black/10 dark:border-white/10 bg-background px-2 text-xs"
                                  disabled title={t('pincer.channelConfigUnavailable')}
                                  value={account.agentId || ''}
                                  onChange={(event) => {
                                    void handleBindAgent(group.channelType, account.accountId, event.target.value);
                                  }}
                                >
                                  <option value="">{t('account.unassigned')}</option>
                                  {visibleAgents.map((agent) => (
                                    <option key={agent.id} value={agent.id}>
                                      {agent.name}
                                    </option>
                                  ))}
                                </select>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs rounded-full"
                                  onClick={() => {
                                    void (async () => {
                                      setInitialConfigValuesForModal(undefined);
                                      setSelectedChannelType(group.channelType as ChannelType);
                                      setSelectedAccountId(account.accountId);
                                      setAllowExistingConfigInModal(true);
                                      setAllowEditAccountIdInModal(false);
                                      setExistingAccountIdsForModal([]);
                                      setShowConfigModal(true);
                                    })();
                                  }}
                                >
                                  {t('account.edit')}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={() =>
                                    setDeleteTarget({ channelType: group.channelType, accountId: account.accountId })
                                  }
                                  title={t('account.delete')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-8">
            <h2 className="openx-section-title">
              {t('supportedChannels')}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {unsupportedGroups.map((type) => {
                const meta = CHANNEL_META[type];
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedChannelType(type);
                      setSelectedAccountId(undefined);
                      setAllowExistingConfigInModal(true);
                      setAllowEditAccountIdInModal(false);
                      setExistingAccountIdsForModal([]);
                      setInitialConfigValuesForModal(undefined);
                      setShowConfigModal(true);
                    }}
                    className={cn(
                      'group flex items-start gap-4 p-4 rounded-2xl transition-all text-left border relative overflow-hidden bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5',
                    )}
                  >
                    <div className="h-[46px] w-[46px] shrink-0 flex items-center justify-center text-foreground bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-full shadow-sm mb-3">
                      <ChannelLogo type={type} />
                    </div>
                    <div className="flex flex-col flex-1 min-w-0 py-0.5 mt-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-foreground truncate">{meta.name}</h3>
                        {meta.isPlugin && (
                          <Badge
                            variant="secondary"
                            className="font-mono text-2xs font-medium px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.08] border-0 shadow-none text-foreground/70"
                          >
                            {t('pluginBadge')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-[1.5]">
                        {t(meta.description.replace('channels:', ''))}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showConfigModal && (
        <ChannelConfigModal
          initialSelectedType={selectedChannelType}
          accountId={selectedAccountId}
          configuredTypes={configuredTypes}
          allowExistingConfig={allowExistingConfigInModal}
          allowEditAccountId={allowEditAccountIdInModal}
          existingAccountIds={existingAccountIdsForModal}
          initialConfigValues={initialConfigValuesForModal}
          showChannelName={false}
          onClose={() => {
            setShowConfigModal(false);
            setSelectedChannelType(null);
            setSelectedAccountId(undefined);
            setAllowExistingConfigInModal(true);
            setAllowEditAccountIdInModal(false);
            setExistingAccountIdsForModal([]);
            setInitialConfigValuesForModal(undefined);
          }}
          onChannelSaved={async () => {
            await fetchPageData({ probe: true });
            scheduleConvergenceRefresh();
            setShowConfigModal(false);
            setSelectedChannelType(null);
            setSelectedAccountId(undefined);
            setAllowExistingConfigInModal(true);
            setAllowEditAccountIdInModal(false);
            setExistingAccountIdsForModal([]);
            setInitialConfigValuesForModal(undefined);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('common.confirm', 'Confirm')}
        message={deleteTarget?.accountId ? t('account.deleteConfirm') : t('deleteConfirm')}
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="destructive"
        onConfirm={() => {
          return handleDelete();
        }}
        onCancel={() => setDeleteTarget(null)}
        onError={(error) => toast.error(String(error))}
      />
    </div>
  );
}

function ChannelLogo({ type }: { type: ChannelType }) {
  switch (type) {
    case 'telegram':
      return <img src={telegramIcon} alt="Telegram" className="w-[22px] h-[22px] dark:invert" />;
    case 'discord':
      return <img src={discordIcon} alt="Discord" className="w-[22px] h-[22px] dark:invert" />;
    case 'whatsapp':
      return <img src={whatsappIcon} alt="WhatsApp" className="w-[22px] h-[22px] dark:invert" />;
    case 'wechat':
      return <img src={wechatIcon} alt="WeChat" className="w-[22px] h-[22px] dark:invert" />;
    case 'dingtalk':
      return <img src={dingtalkIcon} alt="DingTalk" className="w-[22px] h-[22px] dark:invert" />;
    case 'feishu':
      return <img src={feishuIcon} alt="Feishu" className="w-[22px] h-[22px] dark:invert" />;
    case 'wecom':
      return <img src={wecomIcon} alt="WeCom" className="w-[22px] h-[22px] dark:invert" />;
    case 'qqbot':
      return <img src={qqIcon} alt="QQ" className="w-[22px] h-[22px] dark:invert" />;
    default:
      return <span className="text-xl">{CHANNEL_ICONS[type] || '💬'}</span>;
  }
}

export default Channels;
