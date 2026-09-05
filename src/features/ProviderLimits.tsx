import { useEffect, useRef, useState } from 'react';
import { ArrowRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { QuotaSnapshot, QuotaSource } from '../../shared/quotas';
import { usePreferences } from '../preferences';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const snapshots = new Map<string, QuotaSnapshot>();
export function useProviderQuotas(scope: string, enabled = true) {
  const [data, setData] = useState<QuotaSnapshot | undefined>(); const [loading, setLoading] = useState(false); const [failed, setFailed] = useState(false);
  const generation = useRef(0); const running = useRef(false); const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const attempts = useRef(0);
  const refresh = async (force = false) => {
    if (!scope || !enabled || running.current) return;
    const epoch = generation.current; running.current = true; setLoading(true);
    try {
      const result = await window.pincer.management.quotas(force);
      if (generation.current !== epoch) return;
      if (!result.ok) { setFailed(true); return; }
      const old = snapshots.get(scope);
      const value = result.value;
      if (old) value.providers = value.providers.map(p => {
        if (!p.error || p.windows.length) return p;
        const previous = old.providers.find(n => n.provider === p.provider && n.source === p.source);
        return previous ? { ...previous, error: 'STALE_QUOTA' } : p;
      });
      // Keep the last successful numbers visibly stale when a source fails.
      if (value.errors.length && old) for (const p of old.providers) if (!value.providers.some(n => n.provider === p.provider && n.source === p.source)) value.providers.push({ ...p, error: 'STALE_QUOTA' });
      snapshots.set(scope, value); if (snapshots.size > 10) snapshots.delete(snapshots.keys().next().value!);
      setData(value); setFailed(false);
      clearTimeout(timer.current);
      if (value.refreshing && attempts.current++ < 8) timer.current = setTimeout(() => void refresh(), Math.min(15000, 1500 * 2 ** Math.min(attempts.current, 3)));
    } catch { if (generation.current === epoch) setFailed(true); }
    finally { if (generation.current === epoch) { running.current = false; setLoading(false); } }
  };
  useEffect(() => {
    generation.current++; running.current = false; attempts.current = 0; setFailed(false); setLoading(false); setData(snapshots.get(scope));
    if (enabled) void refresh();
    const interval = enabled ? setInterval(() => { if (!document.hidden) { attempts.current = 0; void refresh(); } }, 60000) : undefined;
    return () => { generation.current++; clearInterval(interval); clearTimeout(timer.current); };
  }, [scope, enabled]);
  return { data, loading, failed, refresh: (force = false) => { attempts.current = 0; return refresh(force); } };
}
export function QuotaList({ scope, enabled = true, compact = false }: { scope: string; enabled?: boolean; compact?: boolean }) {
  const ru = usePreferences().language === 'ru'; const { data, loading, failed, refresh } = useProviderQuotas(scope, enabled); const navigate = useNavigate();
  const date = (n: number) => new Intl.DateTimeFormat(ru ? 'ru' : 'en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(n);
  return <section data-testid="provider-quotas" className={compact ? 'text-xs' : 'settings-card text-sm'}>
    <div className="flex items-center justify-between gap-3"><h3 className="font-medium">{ru ? 'Лимиты провайдеров' : 'Provider limits'}</h3><button type="button" disabled={loading || !enabled} onClick={() => void refresh(true)} aria-label={ru ? 'Обновить лимиты' : 'Refresh limits'} className="rounded-lg p-1.5 hover:bg-foreground/5"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button></div>
    {loading && !data && <p className="mt-3 text-muted-foreground">{ru ? 'Загружаем лимиты…' : 'Loading limits…'}</p>}
    {data?.providers.map((p, i) => <div key={`${p.source}:${p.provider}:${i}`} className="mt-4 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{p.displayName}</strong><span className="text-[10px] text-muted-foreground">{p.source === 'gateway' ? 'Gateway' : 'OmniRoute'}{p.plan ? ` · ${p.plan}` : ''}</span></div>
      {p.error && <p className="mt-1 text-amber-700 dark:text-amber-400">{ru ? 'Последние данные. Не удалось обновить.' : 'Last known data. Refresh failed.'}</p>}
      {!p.windows.length && <p className="mt-2 text-muted-foreground">{ru ? 'Провайдер не сообщил лимиты.' : 'Provider did not report limits.'}</p>}
      {p.windows.map((w, index) => <div key={index} className="mt-3 space-y-1.5"><div className="flex justify-between gap-3"><span className="min-w-0 break-words text-muted-foreground">{w.accountName ? `${w.accountName} · ` : ''}{w.label}</span><span className="shrink-0 tabular-nums">{w.unlimited ? ru ? 'Без лимита' : 'Unlimited' : w.usedPercent !== undefined ? `${Math.round(100 - w.usedPercent)}% ${ru ? 'осталось' : 'left'}` : '—'}</span></div>
        {w.usedPercent !== undefined && !w.unlimited && <div className="h-1 overflow-hidden rounded-full bg-foreground/10"><div className={`h-full rounded-full ${w.usedPercent >= 90 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.max(0, 100 - w.usedPercent)}%` }} /></div>}
        {w.resetAt !== undefined && <p className="text-[10px] text-muted-foreground">{w.resetAt <= Date.now() ? ru ? 'Срок сброса прошёл — ожидаем новые данные' : 'Reset time passed — awaiting new data' : `${ru ? 'Сброс' : 'Resets'}: ${date(w.resetAt)}`}</p>}
      </div>)}
      {p.updatedAt !== undefined && <p className="mt-2 text-[10px] text-muted-foreground">{ru ? 'Данные от' : 'As of'} {date(p.updatedAt)}</p>}
    </div>)}
    {data?.refreshing && <p role="status" className="mt-3 text-muted-foreground">{ru ? 'Gateway запрашивает свежие лимиты…' : 'Gateway is refreshing provider limits…'}</p>}
    {(failed || !!data?.errors.length) && <p role="alert" className="mt-3 text-amber-700 dark:text-amber-400">{ru ? 'Не удалось обновить часть лимитов. Проверь подключение и токен источника.' : 'Some limits could not be refreshed. Check the connection and source token.'}</p>}
    {!loading && !data?.refreshing && !data?.providers.length && <p className="mt-3 leading-relaxed text-muted-foreground">{ru ? 'Gateway пока не передал квоты. Для моделей через OmniRoute подключи его ниже. Отсутствие данных не означает нулевой расход или полный остаток.' : 'Gateway has not supplied quotas. Connect OmniRoute for routed models. Missing data does not mean zero usage or full allowance.'}</p>}
    {compact && <button
      type="button"
      data-testid="configure-quota-sources"
      className="mt-3 inline-flex min-h-8 items-center gap-2 rounded-lg px-2 font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
      onClick={() => navigate('/settings?section=providers&tab=limits')}
    >
      <span>{ru ? 'Настроить источники лимитов' : 'Configure quota sources'}</span>
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </button>}
  </section>;
}
export function ProviderLimitsSettings({ scope, connected }: { scope: string; connected: boolean }) {
  const ru = usePreferences().language === 'ru'; const [source, setSource] = useState<QuotaSource>(); const [url, setUrl] = useState(''); const [token, setToken] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [revision, setRevision] = useState(0);
  useEffect(() => { let live = true; void window.pincer.management.quotaSource().then(r => { if (!live) return; if (r.ok) { setSource(r.value); setUrl(r.value.baseUrl); } else setError(r.error.message); }); return () => { live = false; }; }, [scope]);
  const save = async (clear = false) => {
    setBusy(true); setError(''); setNotice('');
    try { const r = await window.pincer.management.saveQuotaSource({ baseUrl: url, ...(token ? { managementToken: token } : {}), ...(clear ? { clear: true } : {}) }); if (!r.ok) { setError(r.error.code.startsWith('OMNIROUTE_HTTP_') ? ru ? 'Источник отклонил запрос. Проверь адрес и management token.' : 'Source rejected the request. Check its URL and management token.' : ru ? 'Не удалось подключить источник. Нужен HTTPS (или локальный HTTP) и действующий management token.' : 'Could not connect. Use HTTPS (or loopback HTTP) and a valid management token.'); return; } setToken(''); setSource(r.value); setUrl(r.value.baseUrl); snapshots.delete(scope); setRevision(v => v + 1); setNotice(clear ? ru ? 'Источник отключён, его токен удалён.' : 'Source disconnected and its token removed.' : ru ? 'Подключение проверено. Токен сохранён в защищённом хранилище Pincer.' : 'Connection verified. Token saved in Pincer’s encrypted storage.'); } catch { setError(ru ? 'Не удалось связаться с приложением. Повтори попытку.' : 'Could not reach the application. Please retry.'); } finally { setBusy(false); }
  };
  return <div className="space-y-6">
    <form data-testid="quota-source-form" className="settings-card space-y-4" onSubmit={e => { e.preventDefault(); void save(); }}>
      <div><h3 className="font-semibold">OmniRoute</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{ru ? 'Дополнительный источник квот, когда Gateway не сообщает лимиты проксируемых моделей. Используется management token OmniRoute, не ключ модели и не токен OpenClaw.' : 'Additional quota source when Gateway cannot report routed-model limits. Requires an OmniRoute management token, not a model API key or OpenClaw token.'}</p></div>
      <label className="block space-y-2 text-sm"><span>{ru ? 'Адрес OmniRoute' : 'OmniRoute URL'}</span><Input type="url" required value={url} disabled={busy} placeholder="https://omniroute.example.com" onChange={e => setUrl(e.target.value)} /></label>
      <label className="block space-y-2 text-sm"><span>{ru ? 'Токен управления' : 'Management token'}</span><Input type="password" autoComplete="off" value={token} disabled={busy} onChange={e => setToken(e.target.value)} placeholder={source?.configured ? ru ? 'Сохранён · оставь пустым, чтобы сохранить' : 'Saved · leave blank to keep' : ru ? 'Вставьте токен управления' : 'Paste management token'} /></label>
      <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck size={15} className="shrink-0" />{ru ? 'Секрет шифруется средствами ОС. Сохранённый токен не отображается и не переносится на другой адрес автоматически.' : 'Encrypted by the OS. Saved tokens are never displayed or automatically sent to a different address.'}</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !url || !source}>{busy ? ru ? 'Проверяем…' : 'Checking…' : ru ? 'Проверить и сохранить' : 'Test and save'}</Button>{source?.configured && <Button type="button" variant="outline" disabled={busy} onClick={() => void save(true)}>{ru ? 'Отключить источник' : 'Disconnect source'}</Button>}</div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    </form>
    <QuotaList key={scope + revision} scope={scope} enabled={connected} />
  </div>;
}
