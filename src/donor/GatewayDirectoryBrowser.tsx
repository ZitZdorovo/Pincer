import { useEffect, useState } from 'react';
import { ChevronLeft, FolderOpen, Home, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

/** Browses the connected Gateway's filesystem. Paths chosen here are Gateway cwd values. */
export function GatewayDirectoryBrowser({ value, onChange }: { value: string; onChange(path: string): void }) {
  const { i18n } = useTranslation();
  const ru = i18n.language.startsWith('ru');
  const [directory, setDirectory] = useState<{ path: string; home: string; parent?: string; entries: { name: string; path: string }[] }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [navigation, setNavigation] = useState<string | undefined>(value.startsWith('/') ? value : undefined);
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    void window.pincer.chat.listDirectories(navigation).then((result) => {
      if (!current) return;
      if (!result.ok) { setError(result.error.message); return; }
      setDirectory(result.value);
      onChange(result.value.path);
    }).catch((reason) => { if (current) setError(String(reason)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  // The input value is edited separately; it must not restart browsing on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);
  return <div className="space-y-2">
    <div className="flex gap-2"><Input data-testid="gateway-directory-path" value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-lg font-mono text-xs" placeholder="/home/user/project" /><Button variant="outline" size="sm" className="h-9" onClick={() => setNavigation(value.trim())} disabled={!value.trim()}>{ru ? 'Открыть' : 'Open'}</Button></div>
    <div className="rounded-xl border border-border bg-background/40">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1"><Button variant="ghost" size="icon" className="h-7 w-7" disabled={!directory?.parent || loading} title={ru ? 'На уровень выше' : 'Parent folder'} onClick={() => setNavigation(directory?.parent)}><ChevronLeft className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-7 w-7" disabled={!directory?.home || loading} title={ru ? 'Домашняя папка' : 'Home folder'} onClick={() => setNavigation(directory?.home)}><Home className="h-4 w-4" /></Button><span className="min-w-0 truncate pl-1 font-mono text-xs" title={directory?.path}>{directory?.path || (ru ? 'Папки Gateway' : 'Gateway folders')}</span>{loading && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}</div>
      <div data-testid="gateway-directory-list" className="max-h-44 overflow-y-auto p-1">{directory?.entries.map((entry) => <button key={entry.path} type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-black/5 dark:hover:bg-white/10" title={entry.path} onClick={() => setNavigation(entry.path)}><FolderOpen className="h-4 w-4 shrink-0" /><span className="truncate">{entry.name}</span></button>)}{!loading && !directory?.entries.length && !error && <p className="px-2 py-2 text-xs text-muted-foreground">{ru ? 'Нет вложенных папок' : 'No subfolders'}</p>}</div>
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
