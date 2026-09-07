import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Download, Info, Package, Power, RefreshCw, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { cn } from '../lib/utils';
import { usePreferences } from '../preferences';
import type { JsonRecord, PluginInstallInput } from '../../shared/management';

type PluginState = 'enabled' | 'disabled' | 'not-installed' | 'error';
type Plugin = {
  id: string;
  name: string;
  packageName?: string;
  description?: string;
  version?: string;
  kind: string[];
  origin?: string;
  installed: boolean;
  enabled: boolean;
  state: PluginState;
  featured: boolean;
  order?: number;
  error?: string;
  category?: string;
  removable: boolean;
  install?: PluginInstallInput;
};
type CatalogPlugin = {
  name: string;
  displayName: string;
  summary?: string;
  latestVersion?: string;
  runtimeId?: string;
  channel: 'official' | 'community' | 'private';
  isOfficial: boolean;
  downloads?: number;
  verificationTier?: string;
};
type ReviewAction = { kind: 'install'; install: PluginInstallInput } | { kind: 'enable' };
type Inspection = { plugin: Plugin; value: JsonRecord; action?: ReviewAction };
type Filter = 'all' | 'installed' | 'available' | 'error';

const record = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const message = (failure: unknown) => failure instanceof Error ? failure.message : String(failure);

function parsePlugin(value: unknown): Plugin | null {
  const row = record(value);
  if (typeof row.id !== 'string' || !row.id.trim() || typeof row.name !== 'string' || !row.name.trim() || typeof row.installed !== 'boolean' || typeof row.enabled !== 'boolean') return null;
  if (!['enabled', 'disabled', 'not-installed', 'error'].includes(String(row.state))) return null;
  const rawInstall = record(row.install);
  const install: PluginInstallInput | undefined = rawInstall.source === 'official' && typeof rawInstall.pluginId === 'string' && rawInstall.pluginId.trim()
    ? { source: 'official', pluginId: rawInstall.pluginId.trim() }
    : rawInstall.source === 'clawhub' && typeof rawInstall.packageName === 'string' && rawInstall.packageName.trim()
      ? { source: 'clawhub', packageName: rawInstall.packageName.trim() }
      : undefined;
  return {
    id: row.id,
    name: row.name,
    packageName: typeof row.packageName === 'string' ? row.packageName : undefined,
    description: typeof row.description === 'string' ? row.description : undefined,
    version: typeof row.version === 'string' ? row.version : undefined,
    kind: strings(row.kind),
    origin: typeof row.origin === 'string' ? row.origin : undefined,
    installed: row.installed,
    enabled: row.enabled,
    state: row.state as PluginState,
    featured: row.featured === true,
    order: typeof row.order === 'number' ? row.order : undefined,
    error: typeof row.error === 'string' ? row.error : undefined,
    category: typeof row.category === 'string' ? row.category : undefined,
    removable: row.removable === true,
    install,
  };
}

function parseCatalogPlugin(value: unknown): CatalogPlugin | null {
  const pkg = record(record(value).package);
  if (typeof pkg.name !== 'string' || !pkg.name.trim() || typeof pkg.displayName !== 'string' || !pkg.displayName.trim() || !['official', 'community', 'private'].includes(String(pkg.channel))) return null;
  return {
    name: pkg.name.trim(),
    displayName: pkg.displayName.trim(),
    summary: typeof pkg.summary === 'string' ? pkg.summary : undefined,
    latestVersion: typeof pkg.latestVersion === 'string' ? pkg.latestVersion : undefined,
    runtimeId: typeof pkg.runtimeId === 'string' && pkg.runtimeId.trim() ? pkg.runtimeId.trim() : undefined,
    channel: pkg.channel as CatalogPlugin['channel'],
    isOfficial: pkg.isOfficial === true,
    downloads: typeof pkg.downloads === 'number' ? pkg.downloads : undefined,
    verificationTier: typeof pkg.verificationTier === 'string' ? pkg.verificationTier : undefined,
  };
}

function catalogAsPlugin(item: CatalogPlugin): Plugin {
  const id = item.runtimeId || item.name;
  return {
    id,
    name: item.displayName,
    packageName: item.name,
    description: item.summary,
    version: item.latestVersion,
    kind: [],
    origin: item.channel,
    installed: false,
    enabled: false,
    state: 'not-installed',
    featured: item.isOfficial,
    removable: false,
    install: item.isOfficial && item.runtimeId
      ? { source: 'official', pluginId: item.runtimeId }
      : { source: 'clawhub', packageName: item.name, ...(item.latestVersion ? { version: item.latestVersion } : {}) },
  };
}

export function Plugins({ connected }: { connected: boolean }) {
  const ru = usePreferences().language === 'ru';
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [catalog, setCatalog] = useState<CatalogPlugin[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [diagnostics, setDiagnostics] = useState<unknown[]>([]);
  const [mutationAllowed, setMutationAllowed] = useState(false);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Plugin | null>(null);

  const text = ru ? {
    title: 'Плагины', description: 'Установка и управление расширениями, которые предоставляет подключённый OpenClaw Gateway.',
    search: 'Найти установленный плагин или в каталоге', refresh: 'Обновить каталог и список', all: 'Все', installed: 'Установленные', available: 'Доступные', errors: 'С ошибками',
    disconnected: 'Подключитесь к Gateway, чтобы загрузить плагины.', readOnly: 'Gateway разрешает просмотр, но не изменение плагинов для этой учётной записи.',
    empty: 'Gateway не вернул ни одного плагина.', noResults: 'По этому запросу ничего не найдено.', catalog: 'Каталог OpenClaw', local: 'Плагины Gateway',
    enabled: 'Включён', disabled: 'Отключён', notInstalled: 'Не установлен', error: 'Ошибка', official: 'Официальный', community: 'Сообщество', private: 'Частный',
    install: 'Установить', enable: 'Включить', disable: 'Отключить', remove: 'Удалить', details: 'Подробнее', cancel: 'Отмена', confirm: 'Подтвердить',
    capabilities: 'Заявленные возможности', noCapabilities: 'Плагин не заявил дополнительных возможностей.', trust: 'Проверка доверия', source: 'Источник', version: 'Версия',
    reviewTitle: 'Проверка плагина', reviewHint: 'Перед продолжением проверьте источник, уровень доверия и возможности плагина. Подтверждение будет отправлено Gateway.',
    blocked: 'Gateway заблокировал этот плагин. Установка или включение недоступны.', reviewTokenMissing: 'Gateway не вернул токен проверки. Повторите обновление списка.', removeTitle: 'Удалить плагин?', removeHint: 'Плагин и перечисленные Gateway файлы будут удалены. Для применения потребуется перезапуск Gateway.',
    restart: 'Изменение сохранено. Перезапустите Gateway, чтобы применить его.', changed: 'Состояние плагина обновлено.', installedToast: 'Плагин установлен.', removedToast: 'Плагин удалён.', refreshed: 'Каталог и список плагинов обновлены.', diagnostics: 'Диагностика Gateway',
  } : {
    title: 'Plugins', description: 'Install and manage extensions exposed by the connected OpenClaw Gateway.',
    search: 'Search installed plugins or the catalog', refresh: 'Refresh catalog and list', all: 'All', installed: 'Installed', available: 'Available', errors: 'Errors',
    disconnected: 'Connect to Gateway to load plugins.', readOnly: 'Gateway allows this account to view plugins, but not modify them.',
    empty: 'Gateway returned no plugins.', noResults: 'Nothing matches this search.', catalog: 'OpenClaw catalog', local: 'Gateway plugins',
    enabled: 'Enabled', disabled: 'Disabled', notInstalled: 'Not installed', error: 'Error', official: 'Official', community: 'Community', private: 'Private',
    install: 'Install', enable: 'Enable', disable: 'Disable', remove: 'Uninstall', details: 'Details', cancel: 'Cancel', confirm: 'Confirm',
    capabilities: 'Declared capabilities', noCapabilities: 'This plugin declares no additional capabilities.', trust: 'Trust review', source: 'Source', version: 'Version',
    reviewTitle: 'Review plugin', reviewHint: 'Review the plugin source, trust status, and capabilities before continuing. Your acknowledgement will be sent to Gateway.',
    blocked: 'Gateway blocked this plugin. It cannot be installed or enabled.', reviewTokenMissing: 'Gateway did not return a review token. Refresh the plugin list and try again.', removeTitle: 'Uninstall plugin?', removeHint: 'The plugin and files reported by Gateway will be removed. Gateway must be restarted to apply the change.',
    restart: 'Change saved. Restart Gateway to apply it.', changed: 'Plugin state updated.', installedToast: 'Plugin installed.', removedToast: 'Plugin uninstalled.', refreshed: 'Plugin catalog and list refreshed.', diagnostics: 'Gateway diagnostics',
  };

  const load = useCallback(async () => {
    if (!connected) { setPlugins([]); setMutationAllowed(false); return; }
    setLoading(true); setError('');
    try {
      const result = await window.pincer.management.integrations();
      if (!result.ok) throw new Error(result.error.message);
      const payload = record(result.value);
      setPlugins((Array.isArray(payload.plugins) ? payload.plugins : []).map(parsePlugin).filter((item): item is Plugin => Boolean(item)));
      setDiagnostics(Array.isArray(payload.diagnostics) ? payload.diagnostics : []);
      setMutationAllowed(payload.mutationAllowed === true);
    } catch (failure) { setError(message(failure)); }
    finally { setLoading(false); }
  }, [connected]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const needle = query.trim();
    if (!connected || needle.length < 2) { setCatalog([]); setCatalogLoading(false); return; }
    let alive = true;
    const timer = window.setTimeout(() => {
      setCatalogLoading(true);
      void window.pincer.management.searchPlugins(needle).then((result) => {
        if (!alive) return;
        if (!result.ok) throw new Error(result.error.message);
        const payload = record(result.value);
        setCatalog((Array.isArray(payload.results) ? payload.results : []).map(parseCatalogPlugin).filter((item): item is CatalogPlugin => Boolean(item)));
      }).catch((failure) => { if (alive) setError(message(failure)); }).finally(() => { if (alive) setCatalogLoading(false); });
    }, 300);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [connected, query]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return plugins.filter((plugin) => {
      if (filter === 'installed' && !plugin.installed) return false;
      if (filter === 'available' && plugin.installed) return false;
      if (filter === 'error' && plugin.state !== 'error') return false;
      return !needle || [plugin.name, plugin.id, plugin.packageName, plugin.description, plugin.category, plugin.origin, ...plugin.kind]
        .filter(Boolean).join(' ').toLocaleLowerCase().includes(needle);
    }).sort((left, right) => Number(right.featured) - Number(left.featured)
      || (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
      || left.name.localeCompare(right.name));
  }, [filter, plugins, query]);

  const catalogVisible = useMemo(() => {
    const known = new Set(plugins.flatMap((plugin) => [plugin.id, plugin.packageName].filter((value): value is string => Boolean(value))));
    return catalog.filter((item) => !known.has(item.name) && (!item.runtimeId || !known.has(item.runtimeId))).map(catalogAsPlugin);
  }, [catalog, plugins]);

  const refresh = async () => {
    if (!connected || loading) return;
    setLoading(true); setError('');
    try {
      const result = await window.pincer.management.refreshPlugins();
      if (!result.ok) throw new Error(result.error.message);
      await load(); toast.success(text.refreshed);
    } catch (failure) { setError(message(failure)); }
    finally { setLoading(false); }
  };

  const inspect = async (plugin: Plugin, action?: ReviewAction) => {
    if (busyId) return;
    setBusyId(plugin.id);
    try {
      const inspectId = action?.kind === 'install' && action.install.source === 'official' ? action.install.pluginId : plugin.id;
      const result = await window.pincer.management.inspectPlugin(inspectId);
      if (!result.ok) throw new Error(result.error.message);
      setInspection({ plugin, value: record(result.value), action });
    } catch (failure) { toast.error(message(failure)); }
    finally { setBusyId(null); }
  };

  const complete = async (result: Awaited<ReturnType<typeof window.pincer.management.installIntegration>>, success: string) => {
    if (!result.ok) throw new Error(result.error.message);
    const payload = record(result.value);
    toast.success(success);
    if (payload.restartRequired === true) toast.info(text.restart);
    setInspection(null); await load();
  };

  const performReviewed = async () => {
    if (!inspection?.action || busyId) return;
    const reviewToken = typeof inspection.value.reviewToken === 'string' ? inspection.value.reviewToken : '';
    if (!reviewToken) { toast.error(text.reviewTokenMissing); return; }
    setBusyId(inspection.plugin.id);
    try {
      if (inspection.action.kind === 'enable') {
        await complete(await window.pincer.management.setIntegrationEnabled(inspection.plugin.id, true, reviewToken), text.changed);
      } else {
        const install = inspection.action.install;
        const acknowledged: PluginInstallInput = install.source === 'official'
          ? { source: 'official', pluginId: install.pluginId, acknowledgeInstallPolicyWarning: true, acknowledgeCapabilities: { reviewToken } }
          : { source: 'clawhub', packageName: install.packageName, ...(install.version ? { version: install.version } : {}), acknowledgeInstallPolicyWarning: true, acknowledgeCapabilities: { reviewToken } };
        await complete(await window.pincer.management.installIntegration(acknowledged), text.installedToast);
      }
    } catch (failure) { toast.error(message(failure)); }
    finally { setBusyId(null); }
  };

  const disable = async (plugin: Plugin) => {
    if (busyId) return;
    setBusyId(plugin.id);
    try { await complete(await window.pincer.management.setIntegrationEnabled(plugin.id, false), text.changed); }
    catch (failure) { toast.error(message(failure)); }
    finally { setBusyId(null); }
  };

  const uninstall = async () => {
    if (!removeTarget || busyId) return;
    setBusyId(removeTarget.id);
    try {
      const result = await window.pincer.management.uninstallPlugin(removeTarget.id);
      if (!result.ok) throw new Error(result.error.message);
      const payload = record(result.value);
      toast.success(text.removedToast);
      if (payload.restartRequired === true) toast.info(text.restart);
      setRemoveTarget(null); await load();
    } catch (failure) { toast.error(message(failure)); }
    finally { setBusyId(null); }
  };

  const stateLabel = (state: PluginState) => state === 'enabled' ? text.enabled : state === 'disabled' ? text.disabled : state === 'error' ? text.error : text.notInstalled;
  const renderCard = (plugin: Plugin, catalogCard = false) => (
    <article key={`${catalogCard ? 'catalog' : 'gateway'}:${plugin.id}`} className="settings-card flex min-h-[108px] items-start gap-4 !p-4" data-testid={`plugin-${plugin.id}`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-black/[0.035] dark:bg-white/[0.055]"><Package className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 truncate text-sm font-semibold">{plugin.name}</h3><Badge variant={plugin.state === 'error' ? 'destructive' : plugin.enabled ? 'success' : 'secondary'} className="h-5 px-1.5 text-2xs">{stateLabel(plugin.state)}</Badge>{plugin.featured && <Badge variant="outline" className="h-5 px-1.5 text-2xs">{text.official}</Badge>}</div>
        <p className={cn('mt-1 line-clamp-2 text-xs leading-5', plugin.error ? 'text-destructive' : 'text-muted-foreground')} title={plugin.error || plugin.description || plugin.packageName || plugin.id}>{plugin.error || plugin.description || plugin.packageName || plugin.id}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {plugin.installed ? <Button size="sm" variant="outline" className="h-8" disabled={!mutationAllowed || busyId !== null} onClick={() => plugin.enabled ? void disable(plugin) : void inspect(plugin, { kind: 'enable' })}>{busyId === plugin.id ? <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> : plugin.enabled ? <Power className="mr-2 h-3.5 w-3.5" /> : <Check className="mr-2 h-3.5 w-3.5" />}{plugin.enabled ? text.disable : text.enable}</Button>
            : <Button size="sm" className="h-8" disabled={!mutationAllowed || busyId !== null || !plugin.install} onClick={() => plugin.install && void inspect(plugin, { kind: 'install', install: plugin.install })}>{busyId === plugin.id ? <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5" />}{text.install}</Button>}
          <Button size="sm" variant="ghost" className="h-8" disabled={busyId !== null} onClick={() => void inspect(plugin)}><Info className="mr-2 h-3.5 w-3.5" />{text.details}</Button>
          {plugin.installed && plugin.removable && <Button size="icon" variant="ghost" className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive" disabled={!mutationAllowed || busyId !== null} onClick={() => setRemoveTarget(plugin)} title={text.remove} aria-label={`${text.remove}: ${plugin.name}`}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      </div>
    </article>
  );

  const trust = inspection ? record(inspection.value.trust) : {};
  const trustBlocked = trust.disposition === 'blocked';
  const declared = inspection ? record(inspection.value.declared) : {};
  const capabilityGroups = [
    [ru ? 'Каналы' : 'Channels', strings(declared.channels)], [ru ? 'Провайдеры' : 'Providers', strings(declared.providers)],
    [ru ? 'Инструменты' : 'Tools', strings(declared.tools)], ['MCP', strings(declared.mcpServers)], [ru ? 'Навыки' : 'Skills', strings(declared.skills)],
    [ru ? 'Хуки' : 'Hooks', strings(declared.hooks)], [ru ? 'Опасные параметры' : 'Dangerous flags', strings(declared.dangerousConfigFlags)],
  ].filter(([, values]) => (values as string[]).length > 0) as [string, string[]][];

  return <section className="settings-section-panel" data-testid="plugins-page">
    <div className="settings-section-header">
      <div className="min-w-0"><h2 className="settings-section-title">{text.title}</h2><p className="settings-section-description">{text.description}</p></div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative w-[280px] max-w-[38vw]"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.search} aria-label={text.search} className="h-9 rounded-lg pl-9" /></div>
        <Button size="icon" variant="outline" className="h-9 w-9" disabled={!connected || loading} onClick={() => void refresh()} title={text.refresh} aria-label={text.refresh}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /></Button>
      </div>
    </div>
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={ru ? 'Фильтр плагинов' : 'Plugin filter'}>{([['all', text.all], ['installed', text.installed], ['available', text.available], ['error', text.errors]] as const).map(([id, label]) => <Button key={id} size="sm" variant={filter === id ? 'secondary' : 'ghost'} className="h-8" onClick={() => setFilter(id)}>{label}</Button>)}</div>
    {!connected && <div className="settings-card text-sm text-muted-foreground">{text.disconnected}</div>}
    {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-words">{error}</span></div>}
    {connected && !loading && !mutationAllowed && <div className="mb-4 flex items-start gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-300"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{text.readOnly}</div>}
    {diagnostics.length > 0 && <details className="mb-4 rounded-xl border border-border bg-surface-modal p-3 text-xs"><summary className="font-medium">{text.diagnostics} · {diagnostics.length}</summary><pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">{diagnostics.map((item) => typeof item === 'string' ? item : JSON.stringify(item, null, 2)).join('\n\n')}</pre></details>}
    {connected && <><h3 className="mb-3 text-sm font-semibold">{text.local}</h3><div className="space-y-3">{visible.map((plugin) => renderCard(plugin))}</div>{!loading && visible.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{query.trim() ? text.noResults : text.empty}</div>}</>}
    {query.trim().length >= 2 && <div className="mt-8"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{text.catalog}</h3>{catalogLoading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}</div><div className="space-y-3">{catalogVisible.map((plugin) => renderCard(plugin, true))}</div>{!catalogLoading && catalogVisible.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{text.noResults}</div>}</div>}

    {inspection && <Modal open title={text.reviewTitle} description={text.reviewHint} close={() => { if (!busyId) setInspection(null); }}>
      <div className="space-y-4 text-sm">
        <div><p className="font-semibold">{inspection.plugin.name}</p><p className="mt-1 break-all text-xs text-muted-foreground">{inspection.plugin.id}</p></div>
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-black/[0.035] p-3 text-xs dark:bg-white/[0.05]"><div><p className="text-muted-foreground">{text.source}</p><p className="mt-1 break-all font-medium">{String(record(inspection.value.source).kind || inspection.plugin.origin || '—')}</p></div><div><p className="text-muted-foreground">{text.version}</p><p className="mt-1 font-medium">{inspection.plugin.version || String(record(inspection.value.plugin).version || '—')}</p></div></div>
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.trust}</p><Badge variant={trustBlocked ? 'destructive' : trust.disposition === 'clean' ? 'success' : 'warning'}>{String(trust.disposition || '—')}</Badge>{strings(trust.reasons).map((reason) => <p key={reason} className="mt-2 break-words text-xs text-muted-foreground">{reason}</p>)}{trustBlocked && <p className="mt-2 text-xs text-destructive">{text.blocked}</p>}</div>
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.capabilities}</p>{capabilityGroups.length ? <div className="space-y-2">{capabilityGroups.map(([label, values]) => <div key={label} className="rounded-lg border border-border p-3"><p className="text-xs font-medium">{label}</p><p className="mt-1 break-words text-xs text-muted-foreground">{values.join(', ')}</p></div>)}</div> : <p className="text-xs text-muted-foreground">{text.noCapabilities}</p>}</div>
        <div className="flex justify-end gap-2"><Button variant="ghost" disabled={Boolean(busyId)} onClick={() => setInspection(null)}>{text.cancel}</Button>{inspection.action && <Button disabled={Boolean(busyId) || trustBlocked} onClick={() => void performReviewed()}>{busyId ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : inspection.action.kind === 'install' ? <Download className="mr-2 h-4 w-4" /> : <Power className="mr-2 h-4 w-4" />}{text.confirm}</Button>}</div>
      </div>
    </Modal>}
    {removeTarget && <Modal open title={text.removeTitle} description={text.removeHint} close={() => { if (!busyId) setRemoveTarget(null); }}><p className="text-sm font-medium">{removeTarget.name}</p><p className="mt-2 break-all text-xs text-muted-foreground">{removeTarget.id}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" disabled={Boolean(busyId)} onClick={() => setRemoveTarget(null)}>{text.cancel}</Button><Button variant="destructive" disabled={Boolean(busyId)} onClick={() => void uninstall()}>{busyId && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}{text.remove}</Button></div></Modal>}
  </section>;
}
