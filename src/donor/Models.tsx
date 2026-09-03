// Original OpenX Models presentation and charts; no old usage/ACP backend.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { ProvidersSettings } from './Providers';
import { FeedbackState } from '../components/common/FeedbackState';
import { usePreferences } from '../preferences';
import { usageEntries, usageDayEntries } from './usage-adapter';
import { groupUsageHistory, type UsageGroupBy, type UsageHistoryEntry, type UsageWindow } from './usage-history';
export function Models({ connected }: { connected: boolean }) {
 const { t, i18n } = useTranslation(['dashboard', 'settings']); const ru = i18n.language.startsWith('ru');
 const devModeUnlocked = usePreferences().devMode;
 const [usageGroupBy, setUsageGroupBy] = useState<UsageGroupBy>('model');
 const [usageWindow, setUsageWindow] = useState<UsageWindow>('7d');
 const [usagePage, setUsagePage] = useState(1);
 const [selectedUsageEntry, setSelectedUsageEntry] = useState<UsageHistoryEntry | null>(null);
 const [visibleUsageHistory, setUsageHistory] = useState<UsageHistoryEntry[]>([]);
 const [dayHistory, setDayHistory] = useState<UsageHistoryEntry[]>([]);
 const [usageLoading, setUsageLoading] = useState(false); const [usageError, setUsageError] = useState('');
 useEffect(() => {
   let current = true; if (!connected) { setUsageHistory([]); return; }
   const load = async () => { setUsageLoading(true); try { const result = await window.pincer.management.usage(usageWindow); if (!current) return; if (!result.ok) { setUsageError(result.error.message); return; } setUsageError(''); setUsageHistory(usageEntries(result.value)); setDayHistory(usageDayEntries(result.value)); } catch (error) { if (current) setUsageError(String(error)); } finally { if (current) setUsageLoading(false); } };
   void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 60000); return () => { current = false; clearInterval(timer); };
 }, [connected, usageWindow]);
 const filteredUsageHistory = visibleUsageHistory;
 const usageGroups = groupUsageHistory(usageGroupBy === 'day' ? dayHistory : filteredUsageHistory, usageGroupBy);
 const usageTotalPages = Math.max(1, Math.ceil(filteredUsageHistory.length / 5));
 const safeUsagePage = Math.min(usagePage, usageTotalPages);
 const pagedUsageHistory = filteredUsageHistory.slice((safeUsagePage - 1) * 5, safeUsagePage * 5);
 const usageRefreshing = usageLoading;
 const formatUsageSource = (source?: string) => source;
  return (
    <div
      data-testid="models-page"
      className="openx-page-root"
    >
      <div className="openx-page-frame">
        {/* Header */}
        <div className="openx-page-header">
          <div>
            <h1
              data-testid="models-page-title"
              className="openx-page-title"
            >
              {t('dashboard:models.title')}
            </h1>
            <p className="text-subtitle text-foreground/70 font-medium">{t('dashboard:models.subtitle')}</p>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto pr-2 pb-10 min-h-0 -mr-2 space-y-12">
          {/* AI Providers Section */}
          <ProvidersSettings connected={connected} />

          {/* Token Usage History Section */}
          <div>
            <h2 className="openx-section-title">
              {t('dashboard:recentTokenHistory.title', 'Token Usage History')}
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">{ru ? 'Расход по моделям в каждой сессии за выбранный период.' : 'Per-model usage in each session for the selected period.'}</p>
            {!!usageError && <p role="alert" className="mb-3 text-xs text-destructive">{usageError}</p>}
            {visibleUsageHistory.length === 0 && <div className="mb-3 flex gap-2">{(['7d', '30d', 'all'] as const).map((range) => <Button key={range} size="sm" variant={usageWindow === range ? 'secondary' : 'ghost'} onClick={() => setUsageWindow(range)}>{range === '7d' ? t('dashboard:recentTokenHistory.last7Days') : range === '30d' ? t('dashboard:recentTokenHistory.last30Days') : t('dashboard:recentTokenHistory.allTime')}</Button>)}</div>}
            <div>
              {usageLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground bg-black/5 dark:bg-white/5 rounded-3xl border border-transparent border-dashed">
                  <FeedbackState state="loading" title={t('dashboard:recentTokenHistory.loading')} />
                </div>
              ) : visibleUsageHistory.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground bg-black/5 dark:bg-white/5 rounded-3xl border border-transparent border-dashed">
                  <FeedbackState state="empty" title={usageError || t('dashboard:recentTokenHistory.empty')} />
                </div>
              ) : filteredUsageHistory.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground bg-black/5 dark:bg-white/5 rounded-3xl border border-transparent border-dashed">
                  <FeedbackState state="empty" title={t('dashboard:recentTokenHistory.emptyForWindow')} />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex rounded-xl bg-transparent p-1 border border-black/10 dark:border-white/10">
                        <Button
                          variant={usageGroupBy === 'model' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => {
                            setUsageGroupBy('model');
                            setUsagePage(1);
                          }}
                          className={
                            usageGroupBy === 'model'
                              ? 'rounded-lg bg-black/5 dark:bg-white/10 text-foreground'
                              : 'rounded-lg text-muted-foreground'
                          }
                        >
                          {t('dashboard:recentTokenHistory.groupByModel')}
                        </Button>
                        <Button
                          variant={usageGroupBy === 'day' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => {
                            setUsageGroupBy('day');
                            setUsagePage(1);
                          }}
                          className={
                            usageGroupBy === 'day'
                              ? 'rounded-lg bg-black/5 dark:bg-white/10 text-foreground'
                              : 'rounded-lg text-muted-foreground'
                          }
                        >
                          {t('dashboard:recentTokenHistory.groupByTime')}
                        </Button>
                      </div>
                      <div className="flex rounded-xl bg-transparent p-1 border border-black/10 dark:border-white/10">
                        <Button
                          variant={usageWindow === '7d' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => {
                            setUsageWindow('7d');
                            setUsagePage(1);
                          }}
                          className={
                            usageWindow === '7d'
                              ? 'rounded-lg bg-black/5 dark:bg-white/10 text-foreground'
                              : 'rounded-lg text-muted-foreground'
                          }
                        >
                          {t('dashboard:recentTokenHistory.last7Days')}
                        </Button>
                        <Button
                          variant={usageWindow === '30d' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => {
                            setUsageWindow('30d');
                            setUsagePage(1);
                          }}
                          className={
                            usageWindow === '30d'
                              ? 'rounded-lg bg-black/5 dark:bg-white/10 text-foreground'
                              : 'rounded-lg text-muted-foreground'
                          }
                        >
                          {t('dashboard:recentTokenHistory.last30Days')}
                        </Button>
                        <Button
                          variant={usageWindow === 'all' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => {
                            setUsageWindow('all');
                            setUsagePage(1);
                          }}
                          className={
                            usageWindow === 'all'
                              ? 'rounded-lg bg-black/5 dark:bg-white/10 text-foreground'
                              : 'rounded-lg text-muted-foreground'
                          }
                        >
                          {t('dashboard:recentTokenHistory.allTime')}
                        </Button>
                      </div>
                    </div>
                    <p className="text-meta font-medium text-muted-foreground">
                      {usageRefreshing
                        ? t('dashboard:recentTokenHistory.loading')
                        : t('dashboard:recentTokenHistory.showingLast', { count: filteredUsageHistory.length })}
                    </p>
                  </div>

                  <UsageBarChart
                    groups={usageGroups}
                    emptyLabel={t('dashboard:recentTokenHistory.empty')}
                    totalLabel={t('dashboard:recentTokenHistory.totalTokens')}
                    inputLabel={t('dashboard:recentTokenHistory.inputShort')}
                    outputLabel={t('dashboard:recentTokenHistory.outputShort')}
                    cacheLabel={t('dashboard:recentTokenHistory.cacheShort')}
                  />

                  <div className="space-y-3 pt-2">
                    {pagedUsageHistory.map((entry) => (
                      <div
                        key={`${entry.sessionId}-${entry.timestamp}`}
                        data-testid="token-usage-entry"
                        className="rounded-2xl bg-transparent border border-black/10 dark:border-white/10 p-5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">
                              {entry.model || t('dashboard:recentTokenHistory.unknownModel')}
                            </p>
                            <p className="text-meta text-muted-foreground truncate mt-0.5">
                              {[formatUsageSource(entry.provider), formatUsageSource(entry.agentId), entry.sessionId]
                                .filter(Boolean)
                                .join(' • ')}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={getUsageTotalClass(entry)}>{formatUsageTotal(entry)}</p>
                            {entry.usageStatus === 'missing' && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {t('dashboard:recentTokenHistory.noUsage')}
                              </p>
                            )}
                            {entry.usageStatus === 'error' && (
                              <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">
                                {t('dashboard:recentTokenHistory.usageParseError')}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatUsageTimestamp(entry.timestamp)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-meta font-medium text-muted-foreground">
                          {entry.usageStatus === 'available' || entry.usageStatus === undefined ? (
                            <>
                              <span className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-usage-input"></div>
                                {t('dashboard:recentTokenHistory.input', {
                                  value: formatTokenCount(entry.inputTokens),
                                })}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-usage-output"></div>
                                {t('dashboard:recentTokenHistory.output', {
                                  value: formatTokenCount(entry.outputTokens),
                                })}
                              </span>
                              {entry.cacheReadTokens > 0 && (
                                <span className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full bg-usage-cache"></div>
                                  {t('dashboard:recentTokenHistory.cacheRead', {
                                    value: formatTokenCount(entry.cacheReadTokens),
                                  })}
                                </span>
                              )}
                              {entry.cacheWriteTokens > 0 && (
                                <span className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full bg-usage-cache"></div>
                                  {t('dashboard:recentTokenHistory.cacheWrite', {
                                    value: formatTokenCount(entry.cacheWriteTokens),
                                  })}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs">
                              {entry.usageStatus === 'missing'
                                ? t('dashboard:recentTokenHistory.noUsage')
                                : t('dashboard:recentTokenHistory.usageParseError')}
                            </span>
                          )}
                          {typeof entry.costUsd === 'number' && Number.isFinite(entry.costUsd) && (
                            <span className="flex items-center gap-1.5 ml-auto text-foreground/80 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-md">
                              {t('dashboard:recentTokenHistory.cost', { amount: entry.costUsd.toFixed(4) })}
                            </span>
                          )}
                          {devModeUnlocked && entry.content && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 rounded-full px-2.5 text-tiny border-black/10 dark:border-white/10"
                              onClick={() => setSelectedUsageEntry(entry)}
                            >
                              {t('dashboard:recentTokenHistory.viewContent')}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <p className="text-meta font-medium text-muted-foreground">
                      {t('dashboard:recentTokenHistory.page', { current: safeUsagePage, total: usageTotalPages })}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setUsagePage((page) => Math.max(1, page - 1))}
                        disabled={safeUsagePage <= 1}
                        className="rounded-full px-4 h-9 border-black/10 dark:border-white/10 bg-transparent hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        {t('dashboard:recentTokenHistory.prev')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setUsagePage((page) => Math.min(usageTotalPages, page + 1))}
                        disabled={safeUsagePage >= usageTotalPages}
                        className="rounded-full px-4 h-9 border-black/10 dark:border-white/10 bg-transparent hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        {t('dashboard:recentTokenHistory.next')}
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {devModeUnlocked && selectedUsageEntry && (
        <UsageContentPopup
          entry={selectedUsageEntry}
          onClose={() => setSelectedUsageEntry(null)}
          title={t('dashboard:recentTokenHistory.contentDialogTitle')}
          closeLabel={t('dashboard:recentTokenHistory.close')}
          unknownModelLabel={t('dashboard:recentTokenHistory.unknownModel')}
        />
      )}
    </div>
  );
}

function formatTokenCount(value: number): string {
  return Intl.NumberFormat().format(value);
}

function getUsageTotalClass(entry: UsageHistoryEntry): string {
  if (entry.usageStatus === 'error') return 'font-bold text-sm text-red-500 dark:text-red-400';
  if (entry.usageStatus === 'missing') return 'font-bold text-sm text-muted-foreground';
  return 'font-bold text-sm';
}

function formatUsageTotal(entry: UsageHistoryEntry): string {
  if (entry.usageStatus === 'error') return '✕';
  if (entry.usageStatus === 'missing') return '—';
  return formatTokenCount(entry.totalTokens);
}

function formatUsageTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function UsageBarChart({
  groups,
  emptyLabel,
  totalLabel,
  inputLabel,
  outputLabel,
  cacheLabel,
}: {
  groups: Array<{
    label: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
  }>;
  emptyLabel: string;
  totalLabel: string;
  inputLabel: string;
  outputLabel: string;
  cacheLabel: string;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm font-medium text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  const maxTokens = Math.max(...groups.map((group) => group.totalTokens), 1);

  return (
    <div className="space-y-4 bg-transparent p-5 rounded-2xl border border-black/10 dark:border-white/10">
      <div className="flex flex-wrap gap-4 text-meta font-medium text-muted-foreground mb-2">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-usage-input" />
          {inputLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-usage-output" />
          {outputLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-usage-cache" />
          {cacheLabel}
        </span>
      </div>
      {groups.map((group) => (
        <div key={group.label} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-semibold text-foreground">{group.label}</span>
            <span className="text-muted-foreground font-medium">
              {totalLabel}: {formatTokenCount(group.totalTokens)}
            </span>
          </div>
          <div className="h-3.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
            <div
              className="flex h-full overflow-hidden rounded-full"
              style={{
                width: group.totalTokens > 0 ? `${Math.max((group.totalTokens / maxTokens) * 100, 6)}%` : '0%',
              }}
            >
              {group.inputTokens > 0 && (
                <div
                  className="h-full bg-usage-input"
                  style={{ width: `${(group.inputTokens / group.totalTokens) * 100}%` }}
                />
              )}
              {group.outputTokens > 0 && (
                <div
                  className="h-full bg-usage-output"
                  style={{ width: `${(group.outputTokens / group.totalTokens) * 100}%` }}
                />
              )}
              {group.cacheTokens > 0 && (
                <div
                  className="h-full bg-usage-cache"
                  style={{ width: `${(group.cacheTokens / group.totalTokens) * 100}%` }}
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default Models;

function UsageContentPopup({
  entry,
  onClose,
  title,
  closeLabel,
  unknownModelLabel,
}: {
  entry: UsageHistoryEntry;
  onClose: () => void;
  title: string;
  closeLabel: string;
  unknownModelLabel: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl rounded-2xl border border-black/10 dark:border-white/10 bg-background shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-black/10 dark:border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {entry.model || unknownModelLabel} • {formatUsageTimestamp(entry.timestamp)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap break-words text-sm text-foreground font-mono">{entry.content}</pre>
        </div>
        <div className="flex justify-end border-t border-black/10 dark:border-white/10 px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
