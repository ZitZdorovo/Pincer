import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Download, Plug, Power, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { PluginInstallInput } from '../../shared/management';

type Integration = {
  id: string;
  name: string;
  description?: string;
  version?: string;
  kind: string[];
  installed: boolean;
  enabled: boolean;
  state: 'enabled' | 'disabled' | 'not-installed' | 'error';
  error?: string;
  featured?: boolean;
  order?: number;
  category?: string;
  install?: PluginInstallInput;
};

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const asIntegration = (value: unknown): Integration | null => {
  const row = asRecord(value);
  if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.installed !== 'boolean' || typeof row.enabled !== 'boolean') return null;
  const state = row.state;
  if (!['enabled', 'disabled', 'not-installed', 'error'].includes(String(state))) return null;
  const rawInstall = asRecord(row.install);
  const install = rawInstall.source === 'official' && typeof rawInstall.pluginId === 'string'
    ? { source: 'official' as const, pluginId: rawInstall.pluginId }
    : rawInstall.source === 'clawhub' && typeof rawInstall.packageName === 'string'
      ? { source: 'clawhub' as const, packageName: rawInstall.packageName }
      : undefined;
  return {
    id: row.id,
    name: row.name,
    description: typeof row.description === 'string' ? row.description : undefined,
    version: typeof row.version === 'string' ? row.version : undefined,
    kind: Array.isArray(row.kind) ? row.kind.filter((entry): entry is string => typeof entry === 'string') : [],
    installed: row.installed,
    enabled: row.enabled,
    state: state as Integration['state'],
    error: typeof row.error === 'string' ? row.error : undefined,
    featured: row.featured === true,
    order: typeof row.order === 'number' ? row.order : undefined,
    category: typeof row.category === 'string' ? row.category : undefined,
    install,
  };
};

const isSeparateIntegration = (plugin: Integration) => {
  const labels = new Set([...plugin.kind, plugin.category || ''].map((value) => value.toLowerCase()));
  return !labels.has('channel') && !labels.has('provider') && !labels.has('model-provider');
};

export function Integrations({ connected }: { connected: boolean }) {
  const { t } = useTranslation('channels');
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [mutationAllowed, setMutationAllowed] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError('');
    try {
      const result = await window.pincer.management.integrations();
      if (!result.ok) throw new Error(result.error.message);
      const payload = asRecord(result.value);
      setItems((Array.isArray(payload.plugins) ? payload.plugins : []).map(asIntegration).filter((item): item is Integration => Boolean(item)));
      setMutationAllowed(payload.mutationAllowed === true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter(isSeparateIntegration).filter((plugin) => !needle || [plugin.name, plugin.id, plugin.description, plugin.category, ...plugin.kind]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(needle)).sort((left, right) => {
    if (left.featured !== right.featured) return left.featured ? -1 : 1;
    return (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name);
    });
  }, [items, query]);

  const mutate = async (plugin: Integration) => {
    if (busyId || !mutationAllowed) return;
    setBusyId(plugin.id);
    try {
      const result = !plugin.installed
        ? plugin.install ? await window.pincer.management.installIntegration(plugin.install) : null
        : await window.pincer.management.setIntegrationEnabled(plugin.id, !plugin.enabled);
      if (!result) throw new Error(t('integrations.installUnavailable'));
      if (!result.ok) throw new Error(result.error.message);
      const response = asRecord(result.value);
      toast.success(plugin.installed
        ? t(plugin.enabled ? 'integrations.disabledToast' : 'integrations.enabledToast', { name: plugin.name })
        : t('integrations.installedToast', { name: plugin.name }));
      if (response.restartRequired === true) toast.info(t('integrations.restartRequired'));
      await load();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mt-12" data-testid="integrations-section">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="openx-section-title mb-1">{t('integrations.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('integrations.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-[240px] max-w-[42vw]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('integrations.searchPlaceholder')}
              aria-label={t('integrations.searchPlaceholder')}
              className="h-9 rounded-lg pl-9"
              data-testid="integrations-search"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-lg"
            onClick={() => void load()}
            disabled={!connected || loading}
            title={t('integrations.refresh')}
            aria-label={t('integrations.refresh')}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{t('integrations.loadError', { error })}</span>
        </div>
      )}
      {!error && !loading && !mutationAllowed && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{t('integrations.readOnly')}</span>
        </div>
      )}

      <div className="pincer-grid-2 gap-4">
        {visible.map((plugin) => (
          <div key={plugin.id} className="flex min-h-[116px] items-start gap-4 rounded-2xl border border-border bg-surface-modal p-4 shadow-sm">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-black/5 text-foreground dark:bg-white/5">
              <Plug className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground">{plugin.name}</h3>
                <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-2xs">
                  {t(`integrations.state.${plugin.state}`)}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground" title={plugin.error || plugin.description || plugin.id}>
                {plugin.error || plugin.description || plugin.id}
              </p>
              <Button
                variant={plugin.enabled ? 'outline' : 'secondary'}
                size="sm"
                className="mt-3 h-8 rounded-lg text-xs"
                disabled={!mutationAllowed || busyId !== null || (!plugin.installed && !plugin.install)}
                onClick={() => void mutate(plugin)}
              >
                {busyId === plugin.id ? <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                  : !plugin.installed ? <Download className="mr-2 h-3.5 w-3.5" />
                    : plugin.enabled ? <Power className="mr-2 h-3.5 w-3.5" /> : <Check className="mr-2 h-3.5 w-3.5" />}
                {!plugin.installed
                  ? t('integrations.install')
                  : t(plugin.enabled ? 'integrations.disable' : 'integrations.enable')}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {!error && !loading && visible.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t(query.trim() ? 'integrations.noResults' : 'integrations.empty')}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t('integrations.liveHint')}</p>
    </section>
  );
}
