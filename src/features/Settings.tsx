// OpenX Settings navigation + personal sections copied as presentation only.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Palette, MessageSquare, Network, Code2, RefreshCw, Info, Boxes, Bot, Radio, CircleHelp, Bell, Brain, Clock, ShieldCheck, Mic, Monitor, Cloud, FlaskConical, Server, KeyRound, Shield, Globe, SlidersHorizontal, ScrollText, UserRound, Keyboard, Puzzle, ChevronDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Select } from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { cn } from '../lib/utils';
import { setPreferences, usePreferences } from '../preferences';
import { ConnectionPage } from '../components/ConnectionPage';
import { UpdatesPage } from './Updates';
import type { GatewayState, UpdateState, WorkspaceState } from '../../shared/contract';
import { AppearanceExtras, ChatExtras, NotificationSettings } from './ClientPreferences';
import { ProviderLimitsSettings } from './ProviderLimits';
import { ProvidersSettings, type ProvidersSettingsHandle } from '../donor/Providers';
import { DonorProvider } from '../donor/adapter';
import { Agents } from '../donor/Agents';
import { Channels } from '../donor/Channels';
import { Skills } from '../donor/Skills';
import { Cron } from '../donor/Cron';
import { SettingsBrowser } from './SettingsBrowser';
import { Modal } from '../components/ui/modal';
import { DevicesSettings, LogsSettings, ProfileSettings } from './GatewayAdminSettings';
import { Memory } from './Memory';
import { Approvals } from './Approvals';
type Section = 'profile' | 'appearance' | 'chat' | 'shortcuts' | 'gateway' | 'developer' | 'updates' | 'about' | 'providers' | 'agents' | 'channels' | 'skills' | 'memory' | 'automation' | 'security' | 'notifications' | 'communications' | 'talk' | 'devices' | 'cloud-workers' | 'labs' | 'mcp' | 'secrets' | 'approvals' | 'infrastructure' | 'advanced' | 'logs';
const sections: Section[] = ['profile','appearance','chat','shortcuts','gateway','developer','updates','about','providers','agents','channels','skills','memory','automation','security','notifications','communications','talk','devices','cloud-workers','labs','mcp','secrets','approvals','infrastructure','advanced','logs'];
type SettingsSearchItem = { section: Section; target: string; label: string };
const SUPPORTED_LANGUAGES = [{ code: 'en' as const, label: 'English' }, { code: 'ru' as const, label: 'Русский' }];
const DEFAULT_WORKSPACE_CWD = '';
function SettingsPageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <div className="settings-section-header">
    <div className="min-w-0"><h2 className="settings-section-title">{title}</h2><p className="settings-section-description">{description}</p></div>
    {actions && <div className="shrink-0">{actions}</div>}
  </div>;
}
function OpenClawSettingsPanel({ category, connected, scope, onDirty, expanded = false, ru }: { category: string; connected: boolean; scope: string; onDirty(value: boolean): void; expanded?: boolean; ru: boolean }) {
  const [hasOpened, setHasOpened] = useState(expanded);
  if (expanded) return <div className="settings-schema-standalone"><SettingsBrowser key={`${category}:${scope}`} category={category} connected={connected} scope={scope} title={false} onDirty={onDirty} /></div>;
  return <details className="settings-openclaw-panel group" onToggle={(event) => { if (event.currentTarget.open) setHasOpened(true); }}>
    <summary className="settings-openclaw-summary">
      <div><p className="text-sm font-semibold">{ru ? 'Дополнительные параметры OpenClaw' : 'Additional OpenClaw settings'}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{ru ? 'Полная серверная схема этого раздела. Откройте только когда нужны расширенные параметры.' : 'The complete server schema for this section. Open it only when advanced fields are needed.'}</p></div>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
    </summary>
    {hasOpened && <div className="border-t border-border p-5"><SettingsBrowser key={`${category}:${scope}`} category={category} connected={connected} scope={scope} title={false} onDirty={onDirty} /></div>}
  </details>;
}
const gatewaySectionDescriptions: Record<string, [string, string]> = {
  communications: ['Сообщения, рассылки, вложения и синтез речи подключённого OpenClaw.', 'Messages, broadcasts, attachments, and speech for the connected OpenClaw.'],
  talk: ['Голосовой ввод, ответы и параметры синтеза речи.', 'Voice input, replies, and speech synthesis settings.'],
  'cloud-workers': ['Удалённые исполнители и параметры их подключения.', 'Remote workers and their connection settings.'],
  labs: ['Экспериментальные возможности OpenClaw. Изменяйте их только если понимаете последствия.', 'Experimental OpenClaw capabilities. Change them only when you understand the impact.'],
  mcp: ['Серверы MCP, транспорт и доступные подключения.', 'MCP servers, transports, and available connections.'],
  secrets: ['Защищённые значения, переменные окружения и профили авторизации.', 'Protected values, environment variables, and authentication profiles.'],
  infrastructure: ['Gateway, ноды, браузер, обнаружение, прокси и служебные поверхности.', 'Gateway, nodes, browser, discovery, proxies, and service surfaces.'],
  advanced: ['Полная схема установленного OpenClaw, включая новые и подключаемые разделы.', 'The complete installed OpenClaw schema, including new and plugin-provided sections.'],
};
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
 const { theme, language, interfaceFontSize, reducedMotion, closeBehavior, agentBadgeMode, agentBadgeAliases, sendShortcut, chatWorkspacePath } = preferences;
 const devModeUnlocked = preferences.devMode;
 const setTheme = (value: typeof theme) => setPreferences({ theme: value });
 const handleLanguageChange = (value: typeof language) => setPreferences({ language: value });
 const setInterfaceFontSize = (value: typeof interfaceFontSize) => setPreferences({ interfaceFontSize: value });
 const setReducedMotion = (value: typeof reducedMotion) => setPreferences({ reducedMotion: value });
 const setCloseBehavior = (value: typeof closeBehavior) => {
   setPreferences({ closeBehavior: value });
   void window.pincer.desktop.setCloseBehavior(value).then((result) => { if (!result.ok) toast.error(result.error.message); });
 };
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
 const settingsScrollRef = useRef<HTMLDivElement>(null);
 const providersSettingsRef = useRef<ProvidersSettingsHandle>(null);
 const location = useLocation(); const route = useNavigate();
 const navigate = (path: string) => { if (path === '/') back(); else route(path); };
 const requested = new URLSearchParams(location.search).get('section') as Section | null;
 const [activeSection, setActiveSection] = useState<Section>(requested && sections.includes(requested) ? requested : initialSection);
 const [providerTab, setProviderTab] = useState(new URLSearchParams(location.search).get('tab') === 'limits' ? 'limits' : 'api');
 const [gatewayTab, setGatewayTab] = useState(new URLSearchParams(location.search).get('tab') === 'configuration' ? 'configuration' : 'connection');
  const [settingsSearch, setSettingsSearch] = useState('');
  useEffect(() => { if (requested && sections.includes(requested)) setActiveSection(requested); }, [requested]);
  useEffect(() => {
    const requestedTab = new URLSearchParams(location.search).get('tab');
    if (requested === 'providers') setProviderTab(requestedTab === 'limits' ? 'limits' : 'api');
    if (requested === 'gateway') setGatewayTab(requestedTab === 'configuration' ? 'configuration' : 'connection');
  }, [location.search, requested]);
 useEffect(() => {
   let alive = true; let revision = -1;
   const accept = (snapshot: Awaited<ReturnType<typeof window.pincer.chat.snapshot>>) => { if (alive && snapshot.revision >= revision) { revision = snapshot.revision; setAgents(snapshot.agents); setWorkspace(snapshot); } };
   const off = window.pincer.chat.onState(accept); void window.pincer.chat.snapshot().then(accept);
   void window.pincer.desktop.startup().then((value) => { if (alive) setStartup(value); });
   void window.pincer.desktop.closeBehavior().then((value) => { if (alive && value !== preferences.closeBehavior) setPreferences({ closeBehavior: value }); });
   return () => { alive = false; off(); };
 }, []);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[role="dialog"], [role="listbox"], [role="menu"], [data-radix-popper-content-wrapper]')) { event.preventDefault(); back(); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [back]);
  const settingsNavigation = useMemo(() => [
     { id: 'profile' as const, label: ru ? 'Профиль' : 'Profile', icon: UserRound },
     { id: 'appearance' as const, label: ru ? 'Внешний вид' : 'Appearance', icon: Palette },
     { id: 'chat' as const, label: ru ? 'Чат' : 'Chat', icon: MessageSquare },
     { id: 'shortcuts' as const, label: ru ? 'Горячие клавиши' : 'Keyboard shortcuts', icon: Keyboard },
    { id: 'gateway' as const, label: ru ? 'Подключение' : 'Connection', icon: Network },
    { id: 'notifications' as const, label: ru ? 'Уведомления' : 'Notifications', icon: Bell },
    { id: 'agents' as const, label: t('navigation.agents'), icon: Bot },
    { id: 'labs' as const, label: ru ? 'Лаборатория' : 'Labs', icon: FlaskConical },
    { id: 'providers' as const, label: ru ? 'Поставщики моделей' : 'Model providers', icon: Boxes },
    { id: 'mcp' as const, label: 'MCP', icon: Server },
     { id: 'memory' as const, label: ru ? 'Память' : 'Memory', icon: Brain },
     { id: 'skills' as const, label: ru ? 'Навыки' : 'Skills', icon: Puzzle },
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
  ], [t, ru]);
  useLayoutEffect(() => {
    settingsScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeSection, providerTab, gatewayTab]);
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
    { section: 'appearance' as const, target: 'settings-close-behavior', label: ru ? 'При закрытии окна' : 'When closing the window' },
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
          <nav data-testid="settings-navigation-scroll" className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            {!settingsSearch.trim() && ([
              { label: t('navigation.personal'), items: settingsNavigation.filter(({ id }) => ['profile', 'appearance', 'chat', 'shortcuts', 'notifications'].includes(id)) },
              { label: t('navigation.connections'), items: settingsNavigation.filter(({ id }) => ['gateway', 'channels', 'communications', 'talk', 'devices', 'cloud-workers'].includes(id)) },
              { label: ru ? 'Агенты и инструменты' : 'Agents and tools', items: settingsNavigation.filter(({ id }) => ['agents', 'labs', 'providers', 'mcp', 'skills', 'memory', 'automation'].includes(id)) },
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
          <div role="separator" aria-label={ru ? 'Ширина боковой панели настроек' : 'Settings sidebar width'} aria-orientation="vertical" tabIndex={0} aria-valuenow={preferences.sidebarWidth} aria-valuemin={240} aria-valuemax={520} className="pincer-resize-handle group absolute inset-y-0 right-0 z-30 w-2" onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setPreferences({ sidebarWidth: Math.min(520, Math.max(240, preferences.sidebarWidth + (e.key === 'ArrowRight' ? 16 : -16))) }); } }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setPreferences({ sidebarWidth: Math.min(520, Math.max(240, e.clientX)) }); }}><span className="pincer-resize-line right-0" /></div>
        </aside>
      <div className="settings-content flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-tl-2xl border-t border-border/70 bg-surface-chat" data-testid="settings-content">
        <div ref={settingsScrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-12" data-testid="settings-scroll">
        <div className="mx-auto w-full max-w-[46rem] space-y-8 pb-8" data-testid="settings-content-inner">
          {/* Appearance */}
          <div className={cn('settings-section-panel', activeSection !== 'appearance' && 'hidden')} data-testid="settings-section-appearance">
            <SettingsPageHeader title={ru ? 'Внешний вид' : 'Appearance'} description={ru ? 'Внешний вид, язык и поведение этого клиента. Эти параметры сохраняются в Pincer и не меняют другие клиенты OpenClaw.' : 'Appearance, language and behavior of this client. Saved in Pincer without changing other OpenClaw clients.'} />
            <div className="space-y-6">
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
                        'overflow-hidden rounded-2xl border bg-surface-modal text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        theme === value ? 'border-primary ring-1 ring-primary/25' : 'border-border',
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
              <div className="settings-card space-y-5">
              <div id="settings-language" className="space-y-3">
                <Label className="text-sm font-medium text-foreground/80">{t('appearance.language')}</Label>
                <div className="flex flex-wrap gap-2">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <Button
                      key={lang.code}
                      variant={language === lang.code ? 'secondary' : 'outline'}
                      className={cn(
                        'h-10 rounded-lg border-border px-5',
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
              <div id="settings-font-size" className="flex items-center justify-between gap-6 border-t border-border pt-5">
                <div>
                  <Label htmlFor="interface-font-size" className="text-sm font-medium text-foreground/80">{t('appearance.fontSize')}</Label>
                  <p className="mt-1 text-meta text-muted-foreground">{t('appearance.fontSizeDesc')}</p>
                </div>
                <Select id="interface-font-size" value={interfaceFontSize} onChange={(event) => setInterfaceFontSize(event.target.value as typeof interfaceFontSize)} className="h-8">
                  <option value="small">{t('appearance.fontSizeSmall')}</option>
                  <option value="default">{t('appearance.fontSizeDefault')}</option>
                  <option value="large">{t('appearance.fontSizeLarge')}</option>
                  <option value="xl">XL · 125%</option>
                  <option value="xxl">XXL · 140%</option>
                </Select>
              </div>
              <div id="settings-reduced-motion" className="flex items-center justify-between gap-6">
                <div>
                  <Label htmlFor="reduced-motion" className="text-sm font-medium text-foreground/80">{t('appearance.reducedMotion')}</Label>
                  <p className="mt-1 text-meta text-muted-foreground">{t('appearance.reducedMotionDesc')}</p>
                </div>
                <Select id="reduced-motion" value={reducedMotion} onChange={(event) => setReducedMotion(event.target.value as typeof reducedMotion)}>
                  <option value="system">{t('appearance.reducedMotionSystem')}</option>
                  <option value="on">{t('appearance.reducedMotionOn')}</option>
                  <option value="off">{t('appearance.reducedMotionOff')}</option>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="settings-launch-at-startup" className="text-sm font-medium text-foreground/80">{t('appearance.launchAtStartup')}</Label>
                  <p className="text-meta text-muted-foreground mt-1">{t('appearance.launchAtStartupDesc')}</p>
                </div>
                <Switch id="settings-launch-at-startup" checked={launchAtStartup} onCheckedChange={setLaunchAtStartup} disabled={!startup.supported || startupBusy} />
              </div>
              <div id="settings-close-behavior" className="flex items-center justify-between gap-6 border-t border-border pt-5">
                <div>
                  <Label htmlFor="close-behavior" className="text-sm font-medium text-foreground/80">{ru ? 'При закрытии окна' : 'When closing the window'}</Label>
                  <p className="mt-1 text-meta text-muted-foreground">{ru ? 'Полностью завершить Pincer или оставить его работающим в системном трее.' : 'Quit Pincer completely or keep it running in the system tray.'}</p>
                </div>
                <Select id="close-behavior" aria-label={ru ? 'Действие при закрытии' : 'Close behavior'} value={closeBehavior} onChange={(event) => setCloseBehavior(event.target.value as typeof closeBehavior)}>
                  <option value="quit">{ru ? 'Закрыть полностью' : 'Quit completely'}</option>
                  <option value="tray">{ru ? 'Скрыть в трей' : 'Hide to tray'}</option>
                </Select>
              </div>
              <div className="space-y-3 border-t border-border pt-5">
                <div>
                  <Label htmlFor="agent-badge-mode" className="text-sm font-medium text-foreground/80">{t('appearance.agentBadge')}</Label>
                  <p className="mt-1 text-meta text-muted-foreground">{t('appearance.agentBadgeDesc')}</p>
                </div>
                <Select
                  id="agent-badge-mode"
                  value={agentBadgeMode}
                  onChange={(event) => setAgentBadgeMode(event.target.value as typeof agentBadgeMode)}
                  className="w-full max-w-sm"
                >
                  <option value="full">{t('appearance.agentBadgeFull')}</option>
                  <option value="initial">{t('appearance.agentBadgeInitial')}</option>
                  <option value="hidden">{t('appearance.agentBadgeHidden')}</option>
                  <option value="custom">{t('appearance.agentBadgeCustom')}</option>
                </Select>
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
              <div className="flex items-center justify-between border-t border-border pt-5">
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
          </div>

          <Separator className="hidden" />

          {/* Chat */}
          <div className={cn('settings-section-panel', activeSection !== 'chat' && 'hidden')} data-testid="settings-section-chat">
            <h2 className="settings-section-title">{t('chat.title')}</h2>
            <p className="settings-section-description mb-6">{t('chat.description')}</p>
            <ChatExtras />
            <div className="settings-card space-y-6">
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
                <Select id="send-shortcut" value={sendShortcut} onChange={(event) => setSendShortcut(event.target.value as typeof sendShortcut)}>
                  <option value="enter">{t('chat.sendWithEnter')}</option>
                  <option value="ctrl-enter">{t('chat.sendWithCtrlEnter')}</option>
                </Select>
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
          <div className={cn('settings-section-panel', activeSection !== 'shortcuts' && 'hidden')} data-testid="settings-section-shortcuts">
            <h2 className="settings-section-title">{t('shortcuts.title')}</h2>
            <p className="settings-section-description mb-6">{t('shortcuts.description')}</p>
            <div className="settings-card divide-y divide-border !py-0">
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


          {activeSection === 'providers' && <div data-testid="settings-section-providers" id="settings-provider-limits" className="settings-section-panel space-y-6">
            <SettingsPageHeader
              title={ru ? 'Поставщики моделей' : 'Model providers'}
              description={ru ? 'Модели, способы авторизации и лимиты подключённых учётных записей.' : 'Models, authentication methods, and connected account limits.'}
              actions={providerTab === 'api' ? <Button data-testid="providers-add-button" onClick={() => providersSettingsRef.current?.openAddProvider()} className="h-9 rounded-lg px-4 text-sm font-medium shadow-none"><Plus className="mr-2 h-4 w-4" />{t('aiProviders.add')}</Button> : undefined}
            />
            <div className="settings-tabs" role="tablist">{[['api', ru ? 'API и модели' : 'APIs and models'], ['limits', ru ? 'Лимиты' : 'Limits']].map(([id, label]) => <button key={id} role="tab" aria-selected={providerTab === id} onClick={() => guardNavigation(() => { setProviderTab(id); route('/settings?section=providers&tab=' + id, { replace: true }); })} className={cn('settings-tab', providerTab === id && 'settings-tab-active')}>{label}</button>)}</div>
            {providerTab === 'limits' ? <ProviderLimitsSettings key={workspace?.scope} scope={workspace?.scope || ''} connected={connected} /> : <><ProvidersSettings ref={providersSettingsRef} connected={connected} embedded /><OpenClawSettingsPanel category="providers" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} /></>}
          </div>}
          {activeSection === 'notifications' && <div data-testid="settings-section-notifications" className="settings-section-panel space-y-6"><SettingsPageHeader title={ru ? 'Уведомления' : 'Notifications'} description={ru ? 'Когда Pincer должен сообщать о завершении работы и событиях Gateway.' : 'When Pincer should report completed work and Gateway events.'} /><NotificationSettings /><OpenClawSettingsPanel category="notifications" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} /></div>}
          {activeSection === 'agents' && <div className="settings-section-panel space-y-6"><Agents workspace={workspace} connected={connected} /><OpenClawSettingsPanel category="agents" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} /></div>}
          {activeSection === 'channels' && <div className="settings-section-panel space-y-6"><Channels workspace={workspace} connected={connected} /><OpenClawSettingsPanel category="channels" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} /></div>}
          {activeSection === 'skills' && <div className="settings-section-panel space-y-6"><Skills workspace={workspace} connected={connected} /><OpenClawSettingsPanel category="skills" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} /></div>}
          {activeSection === 'automation' && <div className="settings-section-panel space-y-6"><Cron workspace={workspace} connected={connected} /><OpenClawSettingsPanel category="automation" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} /></div>}
          {activeSection === 'memory' && <div className="settings-section-panel space-y-6"><Memory state={workspace} language={language} connected={connected} embedded onDirty={setMemoryDirty} /><OpenClawSettingsPanel category="memory" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} /></div>}
          {activeSection === 'security' && <div className="space-y-6"><SettingsPageHeader title={ru ? 'Доступ и безопасность' : 'Access and security'} description={ru ? 'Права Pincer и защитные ограничения подключённого Gateway.' : 'Pincer permissions and connected Gateway safeguards.'} /><div className="settings-card space-y-4 text-sm"><h3 className="font-semibold">{ru ? 'Доступ Pincer' : 'Pincer access'}</h3><p className="text-muted-foreground">{ru ? 'Режим доступа выбирается щитом в поле ввода чата. Ограничения Gateway и операционной системы продолжают действовать.' : 'Choose access mode using the shield in the composer. Gateway and OS restrictions remain in effect.'}</p><div className="settings-technical-row"><span>{ru ? 'Права управления' : 'Operator scopes'}</span><code>{gateway.operator.grantedScopes?.join(', ') || '—'}</code></div><div className="settings-technical-row"><span>{ru ? 'Команды ноды' : 'Node commands'}</span><code>{gateway.nodeCommands.join(', ') || '—'}</code></div><p className="text-muted-foreground">{ru ? 'Токены, ключи устройства и черновики шифруются средствами ОС.' : 'Tokens, device keys, and drafts are encrypted by the operating system.'}</p></div><OpenClawSettingsPanel category="security" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} /></div>}
          {activeSection === 'gateway' && <div data-testid="settings-section-gateway" className="space-y-6"><SettingsPageHeader title={ru ? 'Подключение' : 'Connection'} description={ru ? 'Соединение Pincer с существующим OpenClaw Gateway и его серверные параметры.' : 'Connect Pincer to an existing OpenClaw Gateway and manage its server settings.'} /><div className="settings-tabs" role="tablist"><button role="tab" aria-selected={gatewayTab === 'connection'} onClick={() => guardNavigation(() => { setGatewayTab('connection'); route('/settings?section=gateway', { replace: true }); })} className={cn('settings-tab', gatewayTab === 'connection' && 'settings-tab-active')}>{ru ? 'Подключение' : 'Connection'}</button><button role="tab" aria-selected={gatewayTab === 'configuration'} onClick={() => guardNavigation(() => { setGatewayTab('configuration'); route('/settings?section=gateway&tab=configuration', { replace: true }); })} className={cn('settings-tab', gatewayTab === 'configuration' && 'settings-tab-active')}>{ru ? 'Параметры Gateway' : 'Gateway configuration'}</button></div>{gatewayTab === 'connection' ? <ConnectionPage state={gateway} language={language} preview={back} embedded /> : <div className="settings-schema-standalone"><SettingsBrowser key={`gateway:${workspace?.scope || ''}`} category="gateway" connected={connected} scope={workspace?.scope || ''} title={false} onDirty={setGatewaySettingsDirty} /></div>}</div>}
          {activeSection === 'updates' && <div data-testid="settings-section-updates" className="space-y-6"><UpdatesPage embedded state={updates} language={language} dirty={dirty} nodeVersion={gateway.nodeVersion} /><OpenClawSettingsPanel category="updates" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} /></div>}
          {activeSection === 'about' && <div data-testid="settings-section-about" className="space-y-6"><SettingsPageHeader title={ru ? 'О Pincer' : 'About Pincer'} description={ru ? 'Версия приложения и совместимость с подключённым OpenClaw.' : 'Application version and connected OpenClaw compatibility.'} /><div className="settings-card"><p className="text-lg font-semibold">Pincer {gateway.appVersion}</p><p className="mt-2 text-sm text-muted-foreground">Electron · OpenClaw Gateway SDK {gateway.nodeVersion}</p></div></div>}
          {activeSection === 'developer' && <div data-testid="settings-section-developer" className="space-y-6"><SettingsPageHeader title={ru ? 'Отладка' : 'Debug'} description={ru ? 'Сведения о прямом соединении и доступных командах ноды.' : 'Direct connection details and available node commands.'} /><div className="settings-card text-sm"><p>{t('pincer.directConnection')}</p><p className="mt-4 break-all font-mono text-xs text-muted-foreground">{gateway.profile?.url || '—'}</p><p className="mt-2 break-all font-mono text-xs text-muted-foreground">{gateway.nodeCommands.join(', ') || '—'}</p></div><OpenClawSettingsPanel category="developer" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} /></div>}
          {(['communications','talk','cloud-workers','labs','mcp','secrets','infrastructure','advanced'] as Section[]).includes(activeSection) && <div className="space-y-6"><SettingsPageHeader title={settingsNavigation.find(s => s.id === activeSection)?.label || activeSection} description={gatewaySectionDescriptions[activeSection]?.[ru ? 0 : 1] || ''} /><OpenClawSettingsPanel category={activeSection} connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} expanded ru={ru} /></div>}
          {activeSection === 'profile' && <ProfileSettings connected={connected} />}
          {activeSection === 'devices' && <div className="space-y-6"><DevicesSettings connected={connected} /><OpenClawSettingsPanel category="devices" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} /></div>}
          {activeSection === 'logs' && <div className="space-y-6"><LogsSettings connected={connected} /><OpenClawSettingsPanel category="logs" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} /></div>}
          {activeSection === 'approvals' && <div className="space-y-6"><Approvals updateBusy={updates?.phase === 'downloading' || updates?.phase === 'installing'} inline /><OpenClawSettingsPanel category="approvals" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} /></div>}
          {activeSection === 'appearance' && <OpenClawSettingsPanel category="appearance" connected={connected} scope={workspace?.scope || ''} onDirty={setGatewaySettingsDirty} ru={ru} />}
        </div>
        </div>
      </div>
      </div>
      {pendingNavigation && <Modal open title={ru ? 'Отбросить изменения?' : 'Discard changes?'} close={() => setPendingNavigation(null)}><p className="text-sm text-muted-foreground">{ru ? 'Правки текущего раздела ещё не сохранены на Gateway.' : 'Changes to the current section have not been saved on Gateway.'}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setPendingNavigation(null)}>{ru ? 'Продолжить редактирование' : 'Keep editing'}</Button><Button onClick={() => { const action = pendingNavigation; setSettingsDirty(false); setMemoryDirty(false); setPendingNavigation(null); action(); }}>{ru ? 'Отбросить' : 'Discard'}</Button></div></Modal>}
    </div>
   </DonorProvider>
  );
}
