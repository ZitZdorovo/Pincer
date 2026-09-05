/**
 * Skills Page
 * Browse and manage AI skills
 */
import { useEffect, useState, useCallback } from 'react';
import { Search, Puzzle, Lock, Package, X, AlertCircle, Trash2, FolderOpen, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSkillsData, type Skill } from './skills-adapter';
import type { WorkspaceState } from '../../shared/contract';
import { useGatewayStore } from './adapter';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { SettingsPageLoading } from '@/components/common/SettingsPageLoading';
import { cn } from '@/lib/utils';

const isGatewayStopped = (status: GatewayStatus) => status.state !== 'running';
import { toast } from 'sonner';

type GatewayStatus = { state: string };

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
const INSTALL_ERROR_CODES = new Set(['installTimeoutError', 'installRateLimitError']);
const FETCH_ERROR_CODES = new Set(['fetchTimeoutError', 'fetchRateLimitError', 'timeoutError', 'rateLimitError']);
const SEARCH_ERROR_CODES = new Set(['searchTimeoutError', 'searchRateLimitError', 'timeoutError', 'rateLimitError']);

type SkillsGatewayBannerState = 'none' | 'stopped';

function getSkillsGatewayBannerState(status: GatewayStatus): SkillsGatewayBannerState {
  if (isGatewayStopped(status)) {
    return 'stopped';
  }
  return 'none';
}

// Skill detail dialog component
interface SkillDetailDialogProps {
  skill: Skill | null;
  isOpen: boolean;
  onClose: () => void;
  onToggle: (enabled: boolean) => void;
  onUninstall?: (slug: string) => void;
  onOpenFolder?: (skill: Skill) => Promise<void> | void;
}

function resolveSkillSourceLabel(skill: Skill, t: TFunction<'skills'>): string {
  const source = (skill.source || '').trim().toLowerCase();
  if (!source) {
    if (skill.isBundled) return t('source.badge.bundled', { defaultValue: 'Bundled dir' });
    return t('source.badge.unknown', { defaultValue: 'Unknown source' });
  }
  if (source === 'openclaw-bundled') return t('source.badge.bundled', { defaultValue: 'Bundled dir' });
  if (source === 'openclaw-managed') return t('source.badge.managed', { defaultValue: 'Managed' });
  if (source === 'openclaw-workspace') return t('source.badge.workspace', { defaultValue: 'Workspace' });
  if (source === 'openclaw-extra') return t('source.badge.extra', { defaultValue: 'Extra dirs' });
  if (source === 'openclaw-plugin') return t('source.badge.plugin', { defaultValue: 'Plugin dir' });
  if (source === 'agents-skills-personal')
    return t('source.badge.agentsPersonal', { defaultValue: 'Personal .agents' });
  if (source === 'agents-skills-project') return t('source.badge.agentsProject', { defaultValue: 'Project .agents' });
  return source;
}

function canUninstallSkill(_skill: Skill): boolean { return false; }

function SkillDetailDialog({ skill, isOpen, onClose, onToggle, onUninstall, onOpenFolder }: SkillDetailDialogProps) {
  const { t } = useTranslation('skills');

  const handleCopyPath = async () => {
    if (!skill?.baseDir) return;
    try {
      await navigator.clipboard.writeText(skill.baseDir);
      toast.success(t('toast.copiedPath'));
    } catch (err) {
      toast.error(t('toast.failedCopyPath') + ': ' + String(err));
    }
  };

  if (!skill) return null;

  const uninstallable = canUninstallSkill(skill);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="w-full sm:max-w-[450px] p-0 flex flex-col border-l border-black/10 dark:border-white/10 bg-surface-modal shadow-[0_0_40px_rgba(0,0,0,0.2)]"
        side="right"
      >
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-8 py-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 flex items-center justify-center rounded-xl bg-surface-modal border border-black/5 dark:border-white/5 shrink-0 mb-4 relative shadow-sm">
              <span className="text-3xl">{skill.icon || '🔧'}</span>
              {skill.isCore && (
                <div className="absolute -bottom-1 -right-1 rounded-md border border-black/5 bg-surface-modal p-1 shadow-sm dark:border-white/5">
                  <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                </div>
              )}
            </div>
            <h2 className="mb-3 text-center font-sans text-3xl font-semibold tracking-tight text-foreground">
              {skill.name}
            </h2>
            <div
              data-skill-detail-meta-row="1"
              className="flex items-center justify-center flex-wrap gap-2.5 mb-6 opacity-80"
            >
              {skill.version && (
                <Badge
                  variant="secondary"
                  className="shrink-0 whitespace-nowrap rounded-md bg-black/[0.04] px-3 py-0.5 font-mono text-tiny font-medium text-foreground/70 shadow-none transition-colors hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
                >
                  v{skill.version}
                </Badge>
              )}
              <Badge
                variant="secondary"
                className="shrink-0 whitespace-nowrap rounded-md bg-black/[0.04] px-3 py-0.5 font-mono text-tiny font-medium text-foreground/70 shadow-none transition-colors hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
              >
                {skill.isCore
                  ? t('detail.coreSystem')
                  : skill.isBundled
                    ? t('detail.bundled')
                    : t('detail.userInstalled')}
              </Badge>

            </div>

            {skill.description && (
              <p className="text-sm text-foreground/70 font-medium leading-[1.6] text-center px-4">
                {skill.description}
              </p>
            )}
          </div>

          <div className="space-y-7 px-1">
            <div className="space-y-2">
              <h3 className="text-meta font-bold text-foreground/80">{t('detail.source')}</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="secondary"
                  className="shrink-0 whitespace-nowrap rounded-md bg-black/[0.04] px-3 py-0.5 font-mono text-tiny font-medium text-foreground/70 shadow-none dark:bg-white/[0.08]"
                >
                  {resolveSkillSourceLabel(skill, t)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={skill.baseDir || t('detail.pathUnavailable')}
                  readOnly
                  className="h-[38px] font-mono text-xs bg-transparent border-black/10 dark:border-white/10 rounded-xl text-foreground/70"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-[38px] w-[38px] border-black/10 dark:border-white/10"
                  disabled={!skill.baseDir}
                  onClick={handleCopyPath}
                  title={t('detail.copyPath')}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-[38px] w-[38px] border-black/10 dark:border-white/10"
                  disabled={!skill.baseDir}
                  onClick={() => onOpenFolder?.(skill)}
                  title={t('detail.openActualFolder')}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* File Sections — read-only preview of skill content */}
            {skill.baseDir && (
              <div className="space-y-3">
                <h3 className="text-meta font-bold text-foreground/80">
                  {t('detail.sections.title', { defaultValue: '内容' })}
                </h3>
                <p className="text-sm text-muted-foreground">{t('pincer.skillFilesUnavailable')}</p>
              </div>
            )}
          </div>

          {/* Centered Footer Button — uninstall / disable / enable */}
          {!skill.isCore && (
            <div className="pt-8 pb-4 flex items-center justify-center w-full px-2 max-w-[340px] mx-auto">
              <Button
                variant="outline"
                className="h-[42px] w-full rounded-lg border-black/20 bg-transparent text-meta font-semibold text-foreground/80 shadow-sm transition-colors hover:bg-black/5 hover:text-foreground dark:border-white/20 dark:hover:bg-white/5"
                onClick={() => {
                  if (uninstallable && onUninstall && skill.slug) {
                    onUninstall(skill.slug);
                    onClose();
                  } else {
                    onToggle(!skill.enabled);
                  }
                }}
              >
                {uninstallable && onUninstall
                  ? t('detail.uninstall')
                  : skill.enabled
                    ? t('detail.disable')
                    : t('detail.enable')}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Skills({ workspace, connected }: { workspace: WorkspaceState | null; connected: boolean }) {
  const {
    skills,
    loading,
    error,
    fetchSkills,
    enableSkill,
    disableSkill,
    searchResults,
    searchSkills,
    installSkill,
    uninstallSkill,
    searching,
    searchError,
    installing,
  } = useSkillsData(workspace, connected);
  const { t } = useTranslation('skills');
  const gatewayStatus = useGatewayStore((state) => state.status);
  const [searchQuery, setSearchQuery] = useState('');
  const [installQuery, setInstallQuery] = useState('');
  const [installSheetOpen, setInstallSheetOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const marketplaceAvailable = connected;

  const gatewayRunning = gatewayStatus.state === 'running';
  const gatewayReportedReady = gatewayStatus.gatewayReady !== false;
  const gatewayRuntimeKey = `${gatewayStatus.connectedAt ?? 'none'}`;
  const gatewayBannerState = getSkillsGatewayBannerState(gatewayStatus);
  const [showGatewayBanner, setShowGatewayBanner] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (gatewayBannerState === 'none') {
      timer = setTimeout(() => {
        setShowGatewayBanner(false);
      }, 0);
    } else {
      timer = setTimeout(() => {
        setShowGatewayBanner(true);
      }, 1500);
    }
    return () => clearTimeout(timer);
  }, [gatewayBannerState]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setInterval> | null = null;

    const attemptFetch = async () => {
      const ok = await fetchSkills();
      if (cancelled || !ok) return;
      if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
    };

    void attemptFetch();

    if (gatewayRunning && !gatewayReportedReady) {
      retryTimer = setInterval(() => {
        void attemptFetch();
      }, 5_000);
    }

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearInterval(retryTimer);
      }
    };
  }, [fetchSkills, gatewayReportedReady, gatewayRunning, gatewayRuntimeKey]);


  const safeSkills = Array.isArray(skills) ? skills : [];
  const enabledSkillsCount = safeSkills.filter((skill) => skill.enabled).length;
  const disabledSkillsCount = safeSkills.filter((skill) => !skill.enabled).length;
  const filteredSkills = safeSkills
    .filter((skill) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q.length === 0 ||
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.id.toLowerCase().includes(q) ||
        (skill.slug || '').toLowerCase().includes(q) ||
        (skill.author || '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'enabled' ? skill.enabled : !skill.enabled);
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (a.enabled && !b.enabled) return -1;
      if (!a.enabled && b.enabled) return 1;
      if (a.isCore && !b.isCore) return -1;
      if (!a.isCore && b.isCore) return 1;
      return a.name.localeCompare(b.name);
    });

  const handleToggle = useCallback(
    async (skillId: string, enable: boolean) => {
      try {
        if (enable) {
          await enableSkill(skillId);
          toast.success(t('toast.enabled'));
        } else {
          await disableSkill(skillId);
          toast.success(t('toast.disabled'));
        }
      } catch (err) {
        toast.error(String(err));
      }
    },
    [enableSkill, disableSkill, t],
  );

  const hasInstalledSkills = safeSkills.some((s) => !s.isBundled);

  const handleStatusFilterClick = useCallback((nextFilter: 'enabled' | 'disabled') => {
    setStatusFilter((current) => (current === nextFilter ? 'all' : nextFilter));
  }, []);

  const handleOpenSkillsFolder = () => toast.info(t('pincer.remoteFolders'));
  const handleOpenSkillFolder = (_skill: Skill) => { toast.info(t('pincer.remoteFolders')); };
  const skillsDirPath = '';
  useEffect(() => {
    if (!installSheetOpen) {
      return;
    }

    const query = installQuery.trim();
    if (query.length === 0) {
      searchSkills('');
      return;
    }

    const timer = setTimeout(() => {
      searchSkills(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [installQuery, installSheetOpen, searchSkills]);

  const handleInstall = useCallback(
    async (slug: string) => {
      try {
        await installSkill(slug);
        toast.success(t('toast.installed'));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (INSTALL_ERROR_CODES.has(errorMessage)) {
          toast.error(t(`toast.${errorMessage}`, { path: skillsDirPath }), { duration: 10000 });
        } else {
          toast.error(t('toast.failedInstall') + ': ' + errorMessage);
        }
      }
    },
    [installSkill, t, skillsDirPath],
  );
  const handleUninstall = useCallback(
    async (slug: string) => {
      try {
        await uninstallSkill(slug);
        toast.success(t('toast.uninstalled'));
      } catch (err) {
        toast.error(t('toast.failedUninstall') + ': ' + String(err));
      }
    },
    [uninstallSkill, t],
  );

  if (loading) {
    return <SettingsPageLoading testId="skills-page" title={t('title')} description={t('subtitle')} />;
  }

  return (
    <div
      data-testid="skills-page"
      className="openx-page-root"
    >
      <div className="openx-page-frame">
        {/* Header */}
        <div className="openx-page-header !mb-6">
          <div>
            <h1 className="openx-page-title">
              {t('title')}
            </h1>
            <p className="text-subtitle text-foreground/70 font-medium">{t('subtitle')}</p>
          </div>

          <div className="flex items-center gap-3 md:mt-2">
            {hasInstalledSkills && (
              <button
                onClick={handleOpenSkillsFolder}
                className="flex h-8 shrink-0 items-center justify-center rounded-lg border border-black/10 px-4 text-meta font-medium text-foreground/80 transition-colors hover:bg-black/5 hover:text-foreground dark:border-white/10 dark:hover:bg-white/5"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                {t('openFolder')}
              </button>
            )}
          </div>
        </div>

        {/* Gateway Status Banner */}
        {showGatewayBanner && gatewayBannerState !== 'none' && (
          <div
            data-testid="skills-gateway-banner"
            data-state={gatewayBannerState}
            className="mb-6 p-4 rounded-xl border border-yellow-500/50 bg-yellow-500/10 flex items-center gap-3"
          >
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">{t('gatewayWarning')}</span>
          </div>
        )}

        {/* Sub Navigation and Actions */}
        <div className="flex shrink-0 flex-col gap-4 border-b border-black/10 pb-4 mb-4 dark:border-white/10 md:flex-row md:items-center [padding-inline:var(--openx-page-inline)]">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
            <div
              data-testid="skills-search"
                className="group relative flex min-w-0 flex-[1_1_28rem] items-center rounded-xl border border-border bg-surface-input px-3 py-2 transition-colors focus-within:ring-1 focus-within:ring-ring"
            >
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                placeholder={t('search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ml-2 min-w-0 flex-1 bg-transparent text-sm font-normal text-foreground outline-none placeholder:text-foreground/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-foreground/50 hover:text-foreground shrink-0 ml-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="skills-filter-enabled"
              onClick={() => handleStatusFilterClick('enabled')}
              className={cn(
                'h-8 rounded-lg px-3 text-meta font-medium border shadow-none',
                statusFilter === 'enabled'
                  ? 'bg-black/5 dark:bg-white/10 border-black/10 dark:border-white/10 text-foreground'
                  : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5',
              )}
            >
              {t('filter.enabledList', { count: enabledSkillsCount })}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="skills-filter-disabled"
              onClick={() => handleStatusFilterClick('disabled')}
              className={cn(
                'h-8 rounded-lg px-3 text-meta font-medium border shadow-none',
                statusFilter === 'disabled'
                  ? 'bg-black/5 dark:bg-white/10 border-black/10 dark:border-white/10 text-foreground'
                  : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5',
              )}
            >
              {t('filter.disabledList', { count: disabledSkillsCount })}
            </Button>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {marketplaceAvailable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setInstallQuery('');
                  setInstallSheetOpen(true);
                }}
                className="h-8 text-meta font-medium rounded-md px-3 border-black/10 dark:border-white/10 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 shadow-none"
              >
                {t('actions.installSkill')}
              </Button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto pr-2 pb-10 min-h-0 -mr-2">
          {error && gatewayRunning && (
            <div className="mb-4 p-4 rounded-xl border border-destructive/50 bg-destructive/10 text-destructive text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{FETCH_ERROR_CODES.has(error) ? t(`toast.${error}`, { path: skillsDirPath }) : t('loadError')}</span>
            </div>
          )}

          <div
            data-testid="skills-grid"
            className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-3"
          >
            {filteredSkills.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Puzzle className="h-10 w-10 mb-4 opacity-50" />
                <p>{searchQuery ? t('noSkillsSearch') : t('noSkillsAvailable')}</p>
              </div>
            ) : (
              filteredSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="group flex min-h-32 cursor-pointer flex-row items-start justify-between rounded-2xl border border-border bg-surface-modal p-4 shadow-sm transition-colors hover:bg-black/[0.035] dark:hover:bg-white/[0.05]"
                  onClick={() => setSelectedSkill(skill)}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-4 pr-3">
                    <div className="h-10 w-10 shrink-0 flex items-center justify-center text-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl overflow-hidden">
                      {skill.icon || '🧩'}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-foreground truncate">{skill.name}</h3>
                        {skill.isCore ? <Lock className="h-3 w-3 text-muted-foreground" /> : null}
                      </div>
                      <p className="line-clamp-2 pr-2 text-sm leading-relaxed text-muted-foreground">
                        {skill.description}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-tiny text-foreground/55 min-w-0">
                        <Badge
                          variant="secondary"
                          className="shrink-0 whitespace-nowrap px-1.5 py-0 h-5 text-2xs font-medium bg-black/5 dark:bg-white/10 border-0 shadow-none"
                        >
                          {resolveSkillSourceLabel(skill, t)}
                        </Badge>
                        <span className="truncate font-mono min-w-0">
                          {skill.baseDir || t('detail.pathUnavailable')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-3" onClick={(e) => e.stopPropagation()}>
                    {skill.version && (
                      <span className="text-meta font-mono text-muted-foreground">v{skill.version}</span>
                    )}
                    <Switch
                      checked={skill.enabled}
                      onCheckedChange={(checked) => handleToggle(skill.id, checked)}
                      disabled={skill.isCore}
                      aria-label={`${skill.enabled ? t('detail.disable') : t('detail.enable')} ${skill.name}`}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Sheet open={installSheetOpen && marketplaceAvailable} onOpenChange={setInstallSheetOpen}>
        <SheetContent
          className="w-full sm:max-w-[560px] p-0 flex flex-col border-l border-black/10 dark:border-white/10 bg-surface-modal shadow-[0_0_40px_rgba(0,0,0,0.2)]"
          side="right"
        >
          <div className="px-7 py-6 border-b border-black/10 dark:border-white/10">
            <h2 className="text-2xl font-sans font-semibold tracking-tight text-foreground">
              {t('marketplace.installDialogTitle')}
            </h2>
            <p className="mt-1 text-meta text-foreground/70">{t('marketplace.installDialogSubtitle')}</p>
            <div className="mt-4 flex flex-col md:flex-row gap-2">
              <div className="relative flex items-center bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2 border border-black/10 dark:border-white/10 flex-1">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  placeholder={t('searchMarketplace')}
                  value={installQuery}
                  onChange={(e) => setInstallQuery(e.target.value)}
                  className="ml-2 h-auto border-0 bg-transparent p-0 shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-meta"
                />
                {installQuery && (
                  <button
                    type="button"
                    onClick={() => setInstallQuery('')}
                    className="text-foreground/50 hover:text-foreground shrink-0 ml-1"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                disabled
                className="h-10 rounded-xl border-black/10 dark:border-white/10 bg-transparent text-muted-foreground"
              >
                {t('marketplace.sourceLabel')}: {t('marketplace.sourceClawHub')}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {searchError && (
              <div className="mb-4 p-4 rounded-xl border border-destructive/50 bg-destructive/10 text-destructive text-sm font-medium flex items-center gap-2">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>
                  {SEARCH_ERROR_CODES.has(searchError.replace('Error: ', ''))
                    ? t(`toast.${searchError.replace('Error: ', '')}`, { path: skillsDirPath })
                    : searchError}
                </span>
              </div>
            )}

            {searching && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-sm">{t('marketplace.searching')}</p>
              </div>
            )}

            {!searching && searchResults.length > 0 && (
              <div className="flex flex-col gap-1">
                {searchResults.map((skill) => {
                  const isInstalled = safeSkills.some((s) => s.id === skill.slug || s.name === skill.name);
                  const isInstallLoading = !!installing[skill.slug];

                  return (
                    <div
                      key={skill.slug}
                      className="group flex flex-row items-center justify-between py-3.5 px-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer border-b border-black/5 dark:border-white/5 last:border-0"
                      onClick={() => void navigator.clipboard.writeText(`https://clawhub.ai/s/${encodeURIComponent(skill.slug)}`).then(() => toast.success(t('pincer.linkCopied')))}
                    >
                      <div className="flex items-start gap-4 flex-1 overflow-hidden pr-4">
                        <div className="h-10 w-10 shrink-0 flex items-center justify-center text-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl overflow-hidden">
                          📦
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-foreground truncate">{skill.name}</h3>
                            {skill.author && <span className="text-xs text-muted-foreground">• {skill.author}</span>}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-1 pr-6 leading-relaxed">
                            {skill.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {skill.version && (
                          <span className="text-meta font-mono text-muted-foreground mr-2">v{skill.version}</span>
                        )}
                        {isInstalled ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleUninstall(skill.slug)}
                            disabled={isInstallLoading}
                            className="h-8 shadow-none"
                          >
                            {isInstallLoading ? <LoadingSpinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleInstall(skill.slug)}
                            disabled={isInstallLoading}
                            className="h-8 rounded-lg px-4 text-xs font-medium shadow-none"
                          >
                            {isInstallLoading ? <LoadingSpinner size="sm" /> : t('marketplace.install', 'Install')}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!searching && searchResults.length === 0 && !searchError && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Package className="h-10 w-10 mb-4 opacity-50" />
                <p>{installQuery.trim() ? t('marketplace.noResults') : t('marketplace.emptyPrompt')}</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Skill Detail Dialog */}
      <SkillDetailDialog
        skill={safeSkills.find((skill) => skill.id === selectedSkill?.id) || selectedSkill}
        isOpen={!!selectedSkill}
        onClose={() => setSelectedSkill(null)}
        onToggle={(enabled) => {
          if (!selectedSkill) return;
          handleToggle(selectedSkill.id, enabled);

        }}
        onUninstall={handleUninstall}
        onOpenFolder={handleOpenSkillFolder}
      />
    </div>
  );
}

export default Skills;
