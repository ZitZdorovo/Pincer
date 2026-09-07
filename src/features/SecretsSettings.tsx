import { useEffect, useState } from 'react';
import { KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { Select } from '../components/ui/select';
import { usePreferences } from '../preferences';
import type { SecretStoreEntry, SecretStoreInput } from '../../shared/secrets';

export function SecretsSettings({ connected }: { connected: boolean }) {
  const ru = usePreferences().language === 'ru';
  const [entries, setEntries] = useState<SecretStoreEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [kind, setKind] = useState<'secret' | 'env'>('secret');
  const [hosts, setHosts] = useState('');
  const [bulkText, setBulkText] = useState('');
  useEffect(() => {
    let alive = true;
    if (!connected) { setEntries([]); return () => { alive = false; }; }
    setBusy(true); setError('');
    void window.pincer.secrets.list().then((result) => { if (!alive) return; if (result.ok) setEntries(result.value.entries); else setError(result.error.message); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [connected, reload]);
  const save = async (items: SecretStoreInput[]) => {
    setBusy(true); setError('');
    try {
      const result = items.length === 1 ? await window.pincer.secrets.set(items[0]) : await window.pincer.secrets.setMany(items);
      if (!result.ok) { setError(result.error.message); return; }
      toast.success(ru ? 'Секреты синхронизированы с OpenClaw' : 'Secrets synchronized with OpenClaw');
      setEditor(false); setBulk(false); setName(''); setValue(''); setHosts(''); setBulkText(''); setReload((current) => current + 1);
    } finally { setBusy(false); }
  };
  const parseBulk = () => bulkText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf('=');
    return { name: line.slice(0, separator).trim().toUpperCase(), value: line.slice(separator + 1), kind: 'secret' as const };
  });
  return <section className="oc-settings-page" data-testid="openclaw-secrets"><header className="oc-page-brand"><div><span className="oc-brand-mark" aria-hidden>●</span><span>OpenClaw</span></div><p>{ru ? 'Общее хранилище секретов подключённого Gateway. Значения никогда не возвращаются в Pincer.' : 'Shared secret store of the connected Gateway. Values are never returned to Pincer.'}</p></header>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">{ru ? 'СЕКРЕТЫ' : 'SECRETS'}</h3><p className="mt-1 text-xs text-muted-foreground">{entries.length} {ru ? 'записей' : 'entries'}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!connected || busy} onClick={() => setBulk(true)}>{ru ? 'Добавить несколько' : 'Bulk add'}</Button><Button size="sm" disabled={!connected || busy} onClick={() => setEditor(true)}><Plus className="mr-2 h-4 w-4" />{ru ? 'Добавить' : 'Add'}</Button><Button variant="ghost" size="icon" aria-label={ru ? 'Обновить' : 'Reload'} disabled={!connected || busy} onClick={() => setReload((current) => current + 1)}><RefreshCw className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /></Button></div></div>
    {!connected && <div className="settings-browser-empty text-sm text-muted-foreground">{ru ? 'Подключитесь к Gateway, чтобы открыть хранилище секретов.' : 'Connect to the Gateway to open its secret store.'}</div>}
    {error && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    {connected && !busy && entries.length === 0 && <div className="settings-card py-10 text-center"><KeyRound className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{ru ? 'Секретов пока нет' : 'No secrets yet'}</p><p className="mt-1 text-xs text-muted-foreground">{ru ? 'Добавьте защищённое значение или переменную окружения.' : 'Add a protected value or environment variable.'}</p></div>}
    {entries.length > 0 && <div className="settings-card divide-y divide-border !py-0">{entries.map((entry) => <div key={entry.name} className="flex min-h-16 items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{entry.name}</p><p className="mt-1 text-xs text-muted-foreground">{entry.kind === 'env' ? (ru ? 'Переменная окружения' : 'Environment variable') : (ru ? 'Секрет' : 'Secret')}{entry.allowedHosts.length ? ` · ${entry.allowedHosts.join(', ')}` : ''}</p></div><Button variant="ghost" size="icon" aria-label={`${ru ? 'Удалить' : 'Delete'} ${entry.name}`} onClick={() => setDeleting(entry.name)}><Trash2 className="h-4 w-4" /></Button></div>)}</div>}
    {editor && <Modal open title={ru ? 'Добавить секрет' : 'Add secret'} close={() => !busy && setEditor(false)}><div className="space-y-4"><label className="block text-xs text-muted-foreground">{ru ? 'Имя' : 'Name'}<Input className="mt-2" autoCapitalize="characters" value={name} onChange={(event) => setName(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} placeholder="OPENAI_API_KEY" /></label><label className="block text-xs text-muted-foreground">{ru ? 'Тип' : 'Kind'}<Select className="mt-2" value={kind} onChange={(event) => setKind(event.target.value as 'secret' | 'env')}><option value="secret">{ru ? 'Секрет' : 'Secret'}</option><option value="env">{ru ? 'Переменная окружения' : 'Environment variable'}</option></Select></label><label className="block text-xs text-muted-foreground">{ru ? 'Значение' : 'Value'}<Input className="mt-2" type="password" autoComplete="new-password" value={value} onChange={(event) => setValue(event.target.value)} /></label>{kind === 'secret' && <label className="block text-xs text-muted-foreground">{ru ? 'Разрешённые хосты (через запятую)' : 'Allowed hosts (comma-separated)'}<Input className="mt-2" value={hosts} onChange={(event) => setHosts(event.target.value)} placeholder="api.example.com" /></label>}<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditor(false)}>{ru ? 'Отмена' : 'Cancel'}</Button><Button disabled={busy || !/^[A-Z][A-Z0-9_]{0,127}$/.test(name) || value.length === 0} onClick={() => void save([{ name, value, kind, allowedHosts: hosts.split(',').map((host) => host.trim()).filter(Boolean) }])}>{ru ? 'Сохранить' : 'Save'}</Button></div></div></Modal>}
    {bulk && <Modal open title={ru ? 'Добавить несколько секретов' : 'Bulk add secrets'} close={() => !busy && setBulk(false)}><p className="mb-3 text-xs leading-5 text-muted-foreground">{ru ? 'Одна строка на запись в формате ИМЯ=значение. Значения не сохраняются в Pincer.' : 'One NAME=value entry per line. Values are not persisted in Pincer.'}</p><textarea className="min-h-48 w-full rounded-xl border border-border bg-surface-input p-3 font-mono text-xs" spellCheck={false} value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={'OPENAI_API_KEY=…\nSERVICE_TOKEN=…'} /><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setBulk(false)}>{ru ? 'Отмена' : 'Cancel'}</Button><Button disabled={busy || parseBulk().some((item) => !/^[A-Z][A-Z0-9_]{0,127}$/.test(item.name) || !item.value) || parseBulk().length === 0} onClick={() => void save(parseBulk())}>{ru ? 'Добавить' : 'Add'}</Button></div></Modal>}
    {deleting && <Modal open title={ru ? 'Удалить секрет?' : 'Delete secret?'} close={() => !busy && setDeleting(null)}><p className="text-sm text-muted-foreground">{ru ? `Запись ${deleting} будет удалена из OpenClaw. Это может остановить использующие её интеграции.` : `${deleting} will be deleted from OpenClaw. Integrations that use it may stop working.`}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleting(null)}>{ru ? 'Отмена' : 'Cancel'}</Button><Button variant="destructive" disabled={busy} onClick={() => { setBusy(true); void window.pincer.secrets.delete(deleting).then((result) => { if (result.ok) { toast.success(ru ? 'Секрет удалён' : 'Secret deleted'); setDeleting(null); setReload((current) => current + 1); } else setError(result.error.message); }).finally(() => setBusy(false)); }}>{ru ? 'Удалить' : 'Delete'}</Button></div></Modal>}
  </section>;
}
