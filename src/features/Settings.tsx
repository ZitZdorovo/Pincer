// OpenX Settings navigation + personal sections copied as presentation only.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Palette, MessageSquare, Network, Code2, RefreshCw, Info, Boxes, Bot, Radio, CircleHelp, Bell, Brain, Clock, ShieldCheck, Mic, Monitor, Cloud, FlaskConical, Server, KeyRound, Shield, Globe, SlidersHorizontal, ScrollText, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';
import { cn } from '../lib/utils';
import { setPreferences, usePreferences } from '../preferences';
import { ConnectionPage } from '../components/ConnectionPage';
import { UpdatesPage } from './Updates';
import type { GatewayState, UpdateState, WorkspaceState } from '../../shared/contract';
import { AppearanceExtras, ChatExtras, NotificationSettings } from './ClientPreferences';
import { ProviderLimitsSettings } from './ProviderLimits';
import { ProvidersSettings } from '../donor/Providers';
import { DonorProvider } from '../donor/adapter';
import { Agents } from '../donor/Agents';
import { Channels } from '../donor/Channels';
import { Skills } from '../donor/Skills';
import { Cron } from '../donor/Cron';
import { SettingsBrowser } from './SettingsBrowser';
import { gatewayCategories } from './settings-categories';
import { Modal } from '../components/ui/modal';
import { DevicesSettings, LogsSettings, ProfileSettings } from './GatewayAdminSettings';
import { Memory } from './Memory';
import { Approvals } from './Approvals';
type Section = 'profile' | 'appearance' | 'chat' | 'shortcuts' | 'gateway' | 'developer' | 'updates' | 'about' | 'providers' | 'agents' | 'channels' | 'skills' | 'memory' | 'automation' | 'security' | 'notifications' | 'communications' | 'talk' | 'devices' | 'cloud-workers' | 'labs' | 'mcp' | 'secrets' | 'approvals' | 'infrastructure' | 'advanced' | 'logs';
const sections: Section[] = ['profile','appearance','chat','shortcuts','gateway','developer','updates','about','providers','agents','channels','skills','memory','automation','security','notifications','communications','talk','devices','cloud-workers','labs','mcp','secrets','approvals','infrastructure','advanced','logs'];
type SettingsSearchItem = { section: Section; target: string; label: string };
const SUPPORTED_LANGUAGES = [{ code: 'en' as const, label: 'English' }, { code: 'ru' as const, label: 'Русский' }];
const DEFAULT_WORKSPACE_CWD = '';
export function Settings({ gateway, updates, back: leave, dirty, initialSection = 'appearance' }: { gateway: GatewayState; updates: UpdateState | null; back(): void; dirty: boolean; initialSection?: Section }) {
 const preferences = usePreferences(); const { t } = useTranslation('settings');
 const ru = preferences.language === 'ru'; const connected = gateway.operator.phase === 'connected';
 const [settingsDirty, setSettingsDirty] = useState(false);
 const [memoryDirty, setMemoryDirty] = useState(false);
 const setGatewaySettingsDirty = useCallback((value: boolean) => setSettingsDirty(value), []);
 const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
 const guardNavigation = (action: () => void) => { if (settingsDirty || memoryDirty) setPendingNavigation(() => action); else action(); };
 const back = () => guardNavigation(leave);
 const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
 const { theme, language, interfaceFontSize, reducedMotion, agentBadgeMode, agentBadgeAliases, sendShortcut, chatWorkspacePath } = preferences;
 const devModeUnlocked = preferences.devMode;
 const setTheme = (value: typeof theme) => setPreferences({ theme: value });
 const handleLanguageChange = (value: typeof language) => setPreferences({ language: value });
 const setInterfaceFontSize = (value: typeof interfaceFontSize) => setPreferences({ interfaceFontSize: value });
 const setReducedMotion = (value: typeof reducedMotion) => setPreferences({ reducedMotion: value });
 const setAgentBadgeMode = (value: typeof agentBadgeMode) => setPreferences({ agentBadgeMode: value });
 const setAgentBadgeAlias = (id: string, value: string) => setPreferences({ agentBadgeAliases: { ...agentBadgeAliases, [id]: value } });
 const setDevModeUnlocked = (value: boolean) => setPreferences({ devMode: value });
 const setSendShortcut = (value: typeof sendShortcut) => setPreferences({ sendShortcut: value });
 const setChatWorkspacePath = (value: string) => setPreferences({ chatWorkspacePath: value });
 const chooseDefaultWorkspace = () => { document.querySelector<HTMLInputElement>('#settings-default-workspace input')?.focus(); toast.info(t('pincer.remoteWorkspace')); };
 const [startup, setStartup] = useState({ supported: false, enabled: false }); const [startupBusy, setStartupBusy] = useState(false);
 const launchAtStartup = startup.enabled;
 const setLaunchAtStartup = (enabled: boolean) => { setStartupBusy(true); void window.pincer.desktop.setStartup(enabled).then((result) => { if (result.ok) setStartup((previous) => ({ ...previous, enabled: result.value })); else toast.error(result.error.message); }).finally(() => setStartupBusy(false)); };
 const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
 const location = useLocation(); const route = useNavigate();
 const navigate = (path: string) => { if (path === '/') back(); else route(path); };
 const requested = new URLSearchParams(location.search).get('section') as Section | null;
 const [activeSection, setActiveSection] = useState<Section>(requested && sections.includes(requested) ? requested : initialSection);
 const [providerTab, setProviderTab] = useState(new URLSearchParams(location.search).get('tab') === 'limits' ? 'limits' : 'api');
 const [gatewayTab, setGatewayTab] = useState(new URLSearchParams(location.search).get('tab') === 'configuration' ? 'configuration' : 'connection');
 const [settingsSearch, setSettingsSearch] = useState('');
 useEffect(() => { if (requested && sections.includes(requested)) setActiveSection(requested); }, [requested]);
 useEffect(() => {
   let alive = true; let revision = -1;
   const accept = (snapshot: Awaited<ReturnType<typeof window.pincer.chat.snapshot>>) => { if (alive && snapshot.revision >= revision) { revision = snapshot.revision; setAgents(snapshot.agents); setWorkspace(snapshot); } };
   const off = window.pincer.chat.onState(accept); void window.pincer.chat.snapshot().then(accept);
   void window.pincer.desktop.startup().then((value) => { if (alive) setStartup(value); });
   return () => { alive = false; off(); };
 }, []);
 useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('[role="dialog"]')) { event.preventDefault(); back(); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [back]);
  const settingsNavigation = useMemo(() => [
    { id: 'profile' as const, label: ru ? 'Профиль' : 'Profile', icon: UserRound },
    { id: 'appearance' as const, label: ru ? 'Внешний вид' : 'Appearance', icon: Palette },
    { id: 'gateway' as const, label: ru ? 'Подключение' : 'Connection', icon: Network },
    { id: 'notifications' as const, label: ru ? 'Уведомления' : 'Notifications', icon: Bell },
    { id: 'agents' as const, label: t('navigation.agents'), icon: Bot },
    { id: 'labs' as const, label: ru ? 'Лаборатория' : 'Labs', icon: FlaskConical },
    { id: 'providers' as const, label: ru ? 'Поставщики моделей' : 'Model providers', icon: Boxes },
    { id: 'mcp' as const, label: 'MCP', icon: Server },
    { id: 'memory' as const, label: ru ? 'Память' : 'Memory', icon: Brain },
    { id: 'automation' as const, label: ru ? 'Автоматизация' : 'Automation', icon: Clock },
    { id: 'channels' as const, label: t('navigation.channels'), icon: Radio },
    { id: 'security' as const, label: ru ? 'Доступ и безопасность' : 'Access and security', icon: ShieldCheck },
    { id: 'communications' as const, label: ru ? 'Коммуникации' : 'Communications', icon: MessageSquare },
    { id: 'talk' as const, label: ru ? 'Разговор' : 'Talk', icon: Mic },
    { id: 'devices' as const, label: ru ? 'Узлы' : 'Nodes', icon: Monitor },
    { id: 'cloud-workers' as const, label: ru ? 'Облачные воркеры' : 'Cloud workers', icon: Cloud },
    { id: 'secrets' as const, label: ru ? 'Секреты' : 'Secrets', icon: KeyRound },
    { id: 'approvals' as const, label: ru ? 'Одобрения' : 'Approvals', icon: Shield },
    { id: 'infrastructure' as const, label: ru ? 'Инфраструктура' : 'Infrastructure', icon: Globe },
    { id: 'advanced' as const, label: ru ? 'Расширенные' : 'Advanced', icon: SlidersHorizontal },
    { id: 'developer' as const, label: ru ? 'Отладка' : 'Debug', icon: Code2 },
    { id: 'logs' as const, label: ru ? 'Журналы' : 'Logs', icon: ScrollText },
    { id: 'updates' as const, label: t('updates.title'), icon: RefreshCw },
    { id: 'about' as const, label: t('about.title'), icon: Info },
  ], [devModeUnlocked, t, ru]);
  const settingsSearchItems = useMemo<SettingsSearchItem[]>(() => [
    ...settingsNavigation.map(item => ({ section: item.id, target: `settings-section-${item.id}`, label: item.label })),
    { section: 'providers' as const, target: 'settings-provider-limits', label: ru ? 'Лимиты провайдеров · OmniRoute · management token · API' : 'Provider limits · OmniRoute · management token · API' },
    { section: 'appearance' as const, target: 'settings-typography', label: ru ? 'Шрифты · типографика · акцентный цвет' : 'Fonts · typography · accent color' },
    { section: 'chat' as const, target: 'settings-section-chat', label: ru ? 'Ширина сообщений · сворачивать инструменты · активность агента' : 'Message width · collapse tools · agent activity' },
    { section: 'appearance' as const, target: 'settings-theme', label: t('appearance.theme') },
    { section: 'appearance' as const, target: 'settings-language', label: t('appearance.language') },
    { section: 'appearance' as const, target: 'settings-font-size', label: t('appearance.fontSize') },
    { section: 'appearance' as const, target: 'settings-reduced-motion', label: t('appearance.reducedMotion') },
    { section: 'appearance' as const, target: 'settings-launch-at-startup', label: t('appearance.launchAtStartup') },
    { section: 'appearance' as const, target: 'agent-badge-mode', label: t('appearance.agentBadge') },
    { section: 'chat' as const, target: 'settings-default-workspace', label: t('chat.defaultWorkspace') },
    { section: 'chat' as const, target: 'settings-send-shortcut', label: t('chat.sendShortcut') },
    { section: 'chat' as const, target: 'settings-chat-search', label: t('chat.search') },
    { section: 'shortcuts' as const, target: 'settings-shortcut-new-chat', label: t('shortcuts.newChat') },
    { section: 'shortcuts' as const, target: 'settings-shortcut-find-chat', label: t('shortcuts.findInChat') },
    { section: 'shortcuts' as const, target: 'settings-shortcut-search-chats', label: t('shortcuts.searchChats') },
    { section: 'gateway' as const, target: 'settings-gateway-status', label: t('gateway.status') },
    { section: 'gateway' as const, target: 'gateway-url', label: t('remoteGateway.url') },
    { section: 'gateway' as const, target: 'gateway-credential', label: `${t('remoteGateway.token')} / ${t('remoteGateway.password')}` },
    { section: 'appearance' as const, target: 'settings-dev-mode', label: t('advanced.devMode') },
    { section: 'appearance' as const, target: 'settings-telemetry', label: t('advanced.telemetry') },
    { section: 'about' as const, target: 'settings-section-about', label: t('about.title') },
  ], [t, ru, settingsNavigation]);
  const filteredSettingsSearchItems = useMemo(() => {
    const query = settingsSearch.trim().toLocaleLowerCase();
    if (!query) return [];
    return settingsSearchItems.filter((item) => {
      const sectionLabel = settingsNavigation.find((section) => section.id === item.section)?.label ?? '';
      return `${item.label} ${sectionLabel}`.toLocaleLowerCase().includes(query);
    });
  }, [settingsNavigation, settingsSearch, settingsSearchItems, t]);


 const selectSection = (section: Section, target?: string) => guardNavigation(() => { setActiveSection(section); setSettingsSearch(''); if (target === 'settings-provider-limits') setProviderTab('limits'); route('/settings?section=' + section + (target === 'settings-provider-limits' ? '&tab=limits' : ''), { replace: true }); if (target) requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'center' })); });
  return (
   <DonorProvider gateway={gateway} workspace={workspace} updates={updates} newChat={back}>
    <div
      data-testid="settings-page"
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-sidebar"
    >
      <div className="flex h-full min-h-0">
        <aside style={{ width: preferences.sidebarWidth, maxWidth: '45vw' }} className="relative flex min-h-0 shrink-0 flex-col bg-surface-sidebar px-2 pb-3" data-testid="settings-navigation">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mb-3 flex h-12 shrink-0 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t('navigation.back')}</span>
          </button>
          <h1 className="mb-3 px-3 text-base font-semibold">{ru ? 'Настройки' : 'Settings'}</h1>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={settingsSearch}
              onChange={(event) => setSettingsSearch(event.target.value)}
              placeholder={t('navigation.search')}
              aria-label={t('navigation.search')}
              className="h-9 rounded-xl bg-black/[0.025] pl-9 text-sm dark:bg-white/[0.035]"
            />
          </div>
          <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            {!settingsSearch.trim() && ([
              { label: t('navigation.personal'), items: settingsNavigation.filter(({ id }) => ['profile', 'appearance', 'notifications'].includes(id)) },
              { label: t('navigation.connections'), items: settingsNavigation.filter(({ id }) => ['gateway', 'channels', 'communications', 'talk', 'devices', 'cloud-workers'].includes(id)) },
              { label: ru ? 'Агенты и инструменты' : 'Agents and tools', items: settingsNavigation.filter(({ id }) => ['agents', 'labs', 'providers', 'mcp', 'memory', 'automation'].includes(id)) },
              { label: ru ? 'Конфиденциальность и безопасность' : 'Privacy and security', items: settingsNavigation.filter(({ id }) => ['security', 'secrets', 'approvals'].includes(id)) },
              { label: ru ? 'Система' : 'System', items: settingsNavigation.filter(({ id }) => ['infrastructure', 'advanced', 'developer', 'logs', 'updates', 'about'].includes(id)) },
            ]).map((group) => (
              <div key={group.label}>
                <p className="px-2.5 pb-1.5 text-[11px] font-semibold text-muted-foreground">{group.label}</p>
                <div className="space-y-1">
                  {group.items.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      data-testid={`settings-nav-${id}`}
                      onClick={() => selectSection(id)}
                      className={cn(
                        'flex h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors',
                        activeSection === id
                          ? 'bg-black/5 font-medium text-foreground dark:bg-white/10'
                          : 'text-foreground/75 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {settingsSearch.trim() && filteredSettingsSearchItems.map((item) => {
              const section = settingsNavigation.find((entry) => entry.id === item.section);
              const Icon = section?.icon ?? CircleHelp;
              return (
                <button
                  key={`${item.section}:${item.target}`}
                  type="button"
                  data-testid={`settings-search-result-${item.target}`}
                  onClick={() => selectSection(item.section, item.target)}
                  className="flex min-h-10 w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground/90">{item.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{section?.label ?? t('navigation.openClaw')}</span>
                  </span>
                </button>
              );
            })}
            {settingsSearch.trim() && filteredSettingsSearchItems.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                <CircleHelp className="mb-2 h-4 w-4" />
                {t('navigation.noResults')}
              </div>
            )}
          </nav>
          <div className="mt-3 flex h-8 shrink-0 items-center justify-between border-t border-border/50 px-3 pt-2 text-[11px] text-muted-foreground"><span>Pincer</span><span>{gateway.appVersion}</span></div>
          <div role="separator" aria-label={ru ? 'Ширина боковой панели настроек' : 'Settings sidebar width'} aria-orientation="vertical" tabIndex={0} aria-valuenow={preferences.sidebarWidth} aria-valuemin={240} aria-valuemax={520} className="absolute inset-y-0 right-0 w-1 hover:bg-foreground/10" onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setPreferences({ sidebarWidth: Math.min(520, Math.max(240, preferences.sidebarWidth + (e.key === 'ArrowRight' ? 16 : -16))) }); } }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setPreferences({ sidebarWidth: Math.min(520, Math.max(240, e.clientX)) }); }} />
        </aside>
      <div className="settings-content flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-tl-2xl border-t border-border/70 bg-surface-chat" data-testid="settings-content">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-16" data-testid="settings-scroll">
        <div className="mx-auto w-full max-w-[46rem] space-y-8 pb-8" data-testid="settings-content-inner">
          {/* Appearance */}
          <div className={cn(activeSection !== 'appearance' && 'hidden')} data-testid="settings-section-appearance">
            <h2 className="openx-section-title">
              {ru ? 'Внешний вид' : 'Appearance'}
            </h2>
            <div className="space-y-6">
              <p className="text-xs leading-relaxed text-muted-foreground">{ru ? 'Внешний вид, язык и поведение этого клиента. Эти параметры сохраняются в Pincer и не меняют другие клиенты OpenClaw.' : 'Appearance, language and behavior of this client. Saved in Pincer without changing other OpenClaw clients.'}</p>
              <div id="settings-theme" className="space-y-3">
                <Label className="text-sm font-medium text-foreground/80">{t('appearance.theme')}</Label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {([
                    ['system', t('appearance.system')],
                    ['light', t('appearance.light')],
                    ['dark', t('appearance.dark')],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      data-testid={`settings-theme-${value}`}
                      aria-pressed={theme === value}
                      onClick={() => setTheme(value)}
                      className={cn(
                        'overflow-hidden rounded-2xl border bg-surface-modal text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        theme === value ? 'border-primary ring-2 ring-primary/25' : 'border-border',
                      )}
                    >
                      <div className={cn(
                        'relative h-28 overflow-hidden border-b border-border',
                        value === 'dark' ? 'bg-[#202020]' : value === 'light' ? 'bg-[#f4f4f4]' : 'bg-gradient-to-r from-[#f4f4f4] from-50% to-[#202020] to-50%',
                      )}>
                        <div className={cn(
                          'absolute inset-x-5 bottom-0 h-20 rounded-t-xl border p-3 shadow-sm',
                          value === 'dark' ? 'border-white/10 bg-[#2b2b2b]' : value === 'light' ? 'border-black/10 bg-white' : 'border-black/10 bg-white dark:border-white/10 dark:bg-[#2b2b2b]',
                        )}>
                          <span className="block h-2 w-20 rounded-full bg-current opacity-20" />
                          <span className="mt-3 block h-2 w-14 rounded-full bg-current opacity-15" />
                          <span className="mt-2 block h-2 w-24 rounded-full bg-current opacity-10" />
                        </div>
                      </div>
                      <span className="block px-3 py-2 text-center text-sm font-medium text-foreground">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <AppearanceExtras />
              <div id="settings-language" className="space-y-3">
                <Label className="text-sm font-medium text-foreground/80">{t('appearance.language')}</Label>
                <div className="flex flex-wrap gap-2">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <Button
                      key={lang.code}
                      variant={language === lang.code ? 'secondary' : 'outline'}
                      className={cn(
                        'rounded-full px-5 h-10 border-black/10 dark:border-white/10',
                        language === lang.code
                          ? 'bg-black/5 dark:bg-white/10 text-foreground'
                          : 'bg-transparent text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5',
                      )}
                      onClick={() => handleLanguageChange(lang.code)}
                    >
                      {lang.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div id="settings-font-size" className="flex items-center justify-between gap-6 border-t border-black/5 pt-5 dark:border-white/5">
                <div>
                  <Label htmlFor="interface-font-size" className="text-sm font-medium text-foreground/80">{t('appearance.fontSize')}</Label>
                  <p className="mt-1 text-meta text-muted-foreground">{t('appearance.fontSizeDesc')}</p>
                </div>
                <select id="interface-font-size" value={interfaceFontSize} onChange={(event) => setInterfaceFontSize(event.target.value as typeof interfaceFontSize)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                  <option value="small">{t('appearance.fontSizeSmall')}</option>
                  <option value="default">{t('appearance.fontSizeDefault')}</option>
                  <option value="large">{t('appearance.fontSizeLarge')}</option>
                  <option value="xl">XL · 125%</option>
                  <option value="xxl">XXL · 140%</option>
                </select>
              </div>
              <div id="settings-reduced-motion" className="flex items-center justify-between gap-6">
                <div>
                  <Label htmlFor="reduced-motion" className="text-sm font-medium text-foreground/80">{t('appearance.reducedMotion')}</Label>
                  <p className="mt-1 text-meta text-muted-foreground">{t('appearance.reducedMotionDesc')}</p>
                </div>
                <select id="reduced-motion" value={reducedMotion} onChange={(event) => setReducedMotion(event.target.value as typeof reducedMotion)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                  <option value="system">{t('appearance.reducedMotionSystem')}</option>
                  <option value="on">{t('appearance.reducedMotionOn')}</option>
                  <option value="off">{t('appearance.reducedMotionOff')}</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="settings-launch-at-startup" className="text-sm font-medium text-foreground/80">{t('appearance.launchAtStartup')}</Label>
                  <p className="text-meta text-muted-foreground mt-1">{t('appearance.launchAtStartupDesc')}</p>
                </div>
                <Switch id="settings-launch-at-startup" checked={launchAtStartup} onCheckedChange={setLaunchAtStartup} disabled={!startup.supported || startupBusy} />
              </div>
              <div className="space-y-3 border-t border-black/5 pt-5 dark:border-white/5">
                <div>
                  <Label htmlFor="agent-badge-mode" className="text-sm font-medium text-foreground/80">{t('appearance.agentBadge')}</Label>
                  <p className="mt-1 text-meta text-muted-foreground">{t('appearance.agentBadgeDesc')}</p>
                </div>
                <select
                  id="agent-badge-mode"
                  value={agentBadgeMode}
                  onChange={(event) => setAgentBadgeMode(event.target.value as typeof agentBadgeMode)}
                  className="h-9 w-full max-w-sm rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="full">{t('appearance.agentBadgeFull')}</option>
                  <option value="initial">{t('appearance.agentBadgeInitial')}</option>
                  <option value="hidden">{t('appearance.agentBadgeHidden')}</option>
                  <option value="custom">{t('appearance.agentBadgeCustom')}</option>
                </select>
                {agentBadgeMode === 'custom' && (
                  <div className="max-w-xl space-y-2">
                    {agents.map((agent) => (
                      <label key={agent.id} className="grid grid-cols-[minmax(0,1fr)_minmax(140px,220px)] items-center gap-3 text-sm">
                        <span className="min-w-0 truncate text-foreground/80" title={`${agent.name} (${agent.id})`}>{agent.name}</span>
                        <Input
                          key={`${agent.id}:${agentBadgeAliases[agent.id] ?? ''}`}
                          defaultValue={agentBadgeAliases[agent.id] ?? ''}
                          placeholder={agent.name}
                          className="h-8 rounded-lg text-sm"
                          onBlur={(event) => setAgentBadgeAlias(agent.id, event.currentTarget.value)}
                        />
                      </label>
                    ))}
                    {agents.length === 0 && <p className="text-meta text-muted-foreground">{t('appearance.agentBadgeNoAgents')}</p>}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-black/5 pt-5 dark:border-white/5">
                <div>
                  <Label htmlFor="settings-dev-mode" className="text-sm font-medium text-foreground">{t('advanced.devMode')}</Label>
                  <p className="text-meta text-muted-foreground mt-1">{t('advanced.devModeDesc')}</p>
                </div>
                <Switch
                  id="settings-dev-mode"
                  checked={devModeUnlocked}
                  onCheckedChange={setDevModeUnlocked}
                  data-testid="settings-dev-mode-switch"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="settings-telemetry" className="text-sm font-medium text-foreground">{t('advanced.telemetry')}</Label>
                  <p className="text-meta text-muted-foreground mt-1">{t('advanced.telemetryDesc')}</p>
                </div>
                <Switch id="settings-telemetry" checked={false} disabled title={t('pincer.noTelemetry')} />
              </div>
            </div>
          </div>

          <Separator className="hidden" />

          {/* Chat */}
          <div className={cn(!['chat', 'appearance'].includes(activeSection) && 'hidden', activeSection === 'appearance' && 'border-t border-border pt-8')} data-testid="settings-section-chat">
            <h2 className="openx-section-title !mb-2">{t('chat.title')}</h2>
            <p className="mb-6 text-sm text-muted-foreground">{t('chat.description')}</p>
            <ChatExtras />
            <div className="space-y-6 rounded-2xl border border-border bg-surface-modal p-5">
              <div id="settings-default-workspace" className="space-y-3">
                <div>
                  <Label className="text-sm font-medium text-foreground">{t('chat.defaultWorkspace')}</Label>
                  <p className="mt-1 text-meta text-muted-foreground">{t('chat.defaultWorkspaceDesc')}</p>
                </div>
                <div className="flex gap-2">
                  <Input aria-label={t('chat.defaultWorkspace')} value={chatWorkspacePath} onChange={(event) => setChatWorkspacePath(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg font-mono text-xs" />
                  <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => void chooseDefaultWorkspace()}>{t('chat.choose')}</Button>
                  <Button variant="ghost" size="sm" className="h-9 rounded-lg" onClick={() => setChatWorkspacePath(DEFAULT_WORKSPACE_CWD)}>{t('chat.resetWorkspace')}</Button>
                </div>
              </div>
              <div id="settings-send-shortcut" className="flex items-center justify-between gap-6 border-t border-border pt-5">
                <div>
                  <Label htmlFor="send-shortcut" className="text-sm font-medium text-foreground">{t('chat.sendShortcut')}</Label>
                  <p className="mt-1 text-meta text-muted-foreground">{t('chat.sendShortcutDesc')}</p>
                </div>
                <select id="send-shortcut" value={sendShortcut} onChange={(event) => setSendShortcut(event.target.value as typeof sendShortcut)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                  <option value="enter">{t('chat.sendWithEnter')}</option>
                  <option value="ctrl-enter">{t('chat.sendWithCtrlEnter')}</option>
                </select>
              </div>
              <div id="settings-chat-search" className="flex items-center justify-between gap-6 border-t border-border pt-5">
                <div>
                  <Label className="text-sm font-medium text-foreground">{t('chat.search')}</Label>
                  <p className="mt-1 text-meta text-muted-foreground">{t('chat.searchDesc')}</p>
                </div>
                <kbd className="rounded-lg border border-border bg-surface-input px-2.5 py-1.5 text-xs">Ctrl+F</kbd>
              </div>
            </div>
          </div>

          <Separator className="hidden" />

          {/* Keyboard shortcuts */}
          <div className={cn(!['shortcuts', 'appearance'].includes(activeSection) && 'hidden', activeSection === 'appearance' && 'border-t border-border pt-8')} data-testid="settings-section-shortcuts">
            <h2 className="openx-section-title !mb-2">{t('shortcuts.title')}</h2>
            <p className="mb-6 text-sm text-muted-foreground">{t('shortcuts.description')}</p>
            <div className="divide-y divide-border rounded-2xl border border-border bg-surface-modal px-5">
              {([
                ['settings-shortcut-new-chat', t('shortcuts.newChat'), 'Ctrl+N'],
                ['settings-shortcut-search-chats', t('shortcuts.searchChats'), 'Ctrl+K'],
                ['settings-shortcut-find-chat', t('shortcuts.findInChat'), 'Ctrl+F'],
                ['settings-shortcut-settings', t('shortcuts.openSettings'), 'Ctrl+,'],
                ['settings-shortcut-close', t('shortcuts.close'), 'Esc'],
              ] as const).map(([id, label, shortcut]) => (
                <div key={id} id={id} className="flex min-h-14 items-center justify-between gap-6 py-3">
                  <span className="text-sm text-foreground/90">{label}</span>
                  <kbd className="rounded-lg border border-border bg-surface-input px-2.5 py-1.5 text-xs">{shortcut}</kbd>
                </div>
              ))}
            </div>
          </div>

          <Separator className="hidden" />


          {activeSection === 'providers' && <div data-testid="settings-section-providers" id="settings-provider-limits"><div className="mb-6 flex gap-1 border-b border-border" role="tablist">{[['api', ru ? 'API и модели' : 'APIs and models'], ['limits', ru ? 'Лимиты' : 'Limits']].map(([id, label]) => <button key={id} role="tab" aria-selected={providerTab === id} onClick={() => guardNavigation(() => { setProviderTab(id); route('/settings?section=providers&tab=' + id, { replace: true }); })} className={cn('border-b-2 px-4 py-3 text-sm', providerTab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground')}>{label}</button>)}</div>{providerTab === 'limits' ? <ProviderLimitsSettings key={workspace?.scope} scope={workspace?.scope || ''} connected={connected} /> : <ProvidersSettings connected={connected} />}</div>}
          {activeSection === 'notifications' && <NotificationSettings />}
          {activeSection === 'agents' && <Agents workspace={workspace} connected={connected} />}
          {activeSection === 'channels' && <Channels workspace={workspace} connected={connected} />}
          {activeSection === 'skills' && <Skills workspace={workspace} connected={connected} />}
          {activeSection === 'automation' && <Cron workspace={workspace} connected={connected} />}
          {activeSection === 'memory' && <Memory state={workspace} language={language} connected={connected} embedded onDirty={setMemoryDirty} />}
          {activeSection === 'security' && <div className="space-y-5 rounded-2xl border border-border bg-surface-modal p-5 text-sm"><h2 className="font-semibold">{ru ? 'Доступ Pincer' : 'Pincer access'}</h2><p className="text-muted-foreground">{ru ? 'Режим доступа выбирается щитом в поле ввода чата. Ограничения Gateway и операционной системы продолжают действовать.' : 'Choose access mode using the shield in the composer. Gateway and OS restrictions remain in effect.'}</p><p>{ru ? 'Разрешённые права управления' : 'Granted operator scopes'}: {gateway.operator.grantedScopes?.join(', ') || '—'}</p><p>{ru ? 'Реализованные команды ноды' : 'Implemented node commands'}: {gateway.nodeCommands.join(', ') || '—'}</p><p className="text-muted-foreground">{ru ? 'Токены, ключи устройства и черновики шифруются средствами ОС. Pincer не устанавливает OpenClaw и не запускает его CLI.' : 'Tokens, device keys and drafts are encrypted by the OS. Pincer does not install OpenClaw or run its CLI.'}</p></div>}
          {activeSection === 'gateway' && <div data-testid="settings-section-gateway"><div className="mb-6 flex gap-1 border-b border-border" role="tablist"><button role="tab" aria-selected={gatewayTab === 'connection'} onClick={() => guardNavigation(() => { setGatewayTab('connection'); route('/settings?section=gateway', { replace: true }); })} className={cn('border-b-2 px-4 py-3 text-sm', gatewayTab === 'connection' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground')}>{ru ? 'Подключение' : 'Connection'}</button><button role="tab" aria-selected={gatewayTab === 'configuration'} onClick={() => guardNavigation(() => { setGatewayTab('configuration'); route('/settings?section=gateway&tab=configuration', { replace: true }); })} className={cn('border-b-2 px-4 py-3 text-sm', gatewayTab === 'configuration' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground')}>{ru ? 'Параметры Gateway' : 'Gateway configuration'}</button></div>{gatewayTab === 'connection' ? <ConnectionPage state={gateway} language={language} preview={back} embedded /> : <SettingsBrowser key={`gateway:${workspace?.scope || ''}`} category="gateway" connected={connected} scope={workspace?.scope || ''} title={false} onDirty={setGatewaySettingsDirty} />}</div>}
          {activeSection === 'updates' && <div data-testid="settings-section-updates"><UpdatesPage state={updates} language={language} dirty={dirty} nodeVersion={gateway.nodeVersion} /></div>}
          {activeSection === 'about' && <div data-testid="settings-section-about"><h2 className="openx-section-title">Pincer</h2><p className="text-subtitle">{gateway.appVersion}</p><p className="mt-4 text-sm text-muted-foreground">Electron · OpenClaw Gateway SDK {gateway.nodeVersion}</p></div>}
          {activeSection === 'developer' && <div data-testid="settings-section-developer"><h2 className="openx-section-title">{t('developer.title')}</h2><div className="rounded-2xl border border-border bg-surface-modal p-5 text-sm"><p>{t('pincer.directConnection')}</p><p className="mt-4 text-muted-foreground">{gateway.profile?.url || '—'}</p><p className="mt-2 text-muted-foreground">{gateway.nodeCommands.join(', ')}</p></div></div>}
          {['communications','talk','cloud-workers','labs','mcp','secrets','infrastructure','advanced'].includes(activeSection) && <div><h2 className="openx-section-title">{settingsNavigation.find(s => s.id === activeSection)?.label}</h2><p className="text-sm leading-6 text-muted-foreground">{ru ? 'Настройки подключённого OpenClaw. Все вложенные параметры доступны ниже; дополнительные и новые разделы всегда доступны в «Расширенные».' : 'Settings of your connected OpenClaw. All nested fields are available below; additional and new sections are always accessible under Advanced.'}</p></div>}
          {activeSection === 'profile' && <ProfileSettings connected={connected} />}
          {activeSection === 'devices' && <DevicesSettings connected={connected} />}
          {activeSection === 'logs' && <LogsSettings connected={connected} />}
          {activeSection === 'approvals' && <Approvals updateBusy={updates?.phase === 'downloading' || updates?.phase === 'installing'} inline />}
          {Object.hasOwn(gatewayCategories, activeSection) && activeSection !== 'gateway' && !(activeSection === 'providers' && providerTab === 'limits') && <SettingsBrowser key={`${activeSection}:${workspace?.scope || ''}`} category={activeSection} connected={connected} scope={workspace?.scope || ''} title={false} onDirty={setGatewaySettingsDirty} />}
        </div>
        </div>
      </div>
      </div>
      {pendingNavigation && <Modal open title={ru ? 'Отбросить изменения?' : 'Discard changes?'} close={() => setPendingNavigation(null)}><p className="text-sm text-muted-foreground">{ru ? 'Правки текущего раздела ещё не сохранены на Gateway.' : 'Changes to the current section have not been saved on Gateway.'}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setPendingNavigation(null)}>{ru ? 'Продолжить редактирование' : 'Keep editing'}</Button><Button onClick={() => { const action = pendingNavigation; setSettingsDirty(false); setMemoryDirty(false); setPendingNavigation(null); action(); }}>{ru ? 'Отбросить' : 'Discard'}</Button></div></Modal>}
    </div>
   </DonorProvider>
  );
}
