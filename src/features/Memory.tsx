import { useEffect, useRef, useState } from 'react';
import type { MemoryFile, MemoryHealth, MemorySearch, WorkspaceState } from '../../shared/contract';
import type { Language } from '../i18n';
import { featureText } from './text';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { MemoryConfiguration } from './Configuration';
export function Memory({ state, language, connected, onDirty, embedded = false }: { state: WorkspaceState | null; language: Language; connected: boolean; onDirty(value: boolean): void; embedded?: boolean }) {
  const t = featureText(language);
  const [agent, setAgent] = useState(''); const [file, setFile] = useState<MemoryFile | null>(null);
  const [content, setContent] = useState(''); const [query, setQuery] = useState('');
  const [health, setHealth] = useState<MemoryHealth | null>(null); const [search, setSearch] = useState<MemorySearch | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const generation = useRef(0); const selected = agent || state?.agentId || ''; const dirty = file !== null && file.content !== content;
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => { generation.current++; setFile(null); setContent(''); setHealth(null); setSearch(null); setError(''); }, [selected]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : t('loadFailed')); } finally { setBusy(false); } };
  const load = () => run(async () => { const current = generation.current; const result = await window.pincer.memory.read(selected); if (current !== generation.current) return; if (result.ok) { setFile(result.value); setContent(result.value.content); } else setError(result.error.message); });
  return <div className={embedded ? 'space-y-5' : 'mx-auto max-w-3xl space-y-5 p-8'} data-testid="memory-page">
    <div><h1 className="settings-section-title">{t('memory')}</h1><p className="settings-section-description">{t('memoryHelp')}</p></div>
    <div className="settings-card space-y-4">
      <MemoryConfiguration connected={connected && !busy} saved={() => { setHealth(null); setNotice(language === 'ru' ? 'Настройки сохранены. После переподключения проверьте семантический поиск.' : 'Settings saved. Check semantic search after reconnecting.'); }} />
      <Select aria-label={t('agent')} value={selected} disabled={dirty || busy || !connected} onChange={(event) => setAgent(event.target.value)}>{state?.agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!connected || !selected || busy} onClick={() => { if (!dirty || window.confirm(t('discard'))) void load(); }}>{t('read')}</Button><Button variant="outline" disabled={!connected || !selected || busy} onClick={() => void run(async () => { const result = await window.pincer.memory.status(selected, true); if (result.ok) setHealth(result.value); else setError(result.error.message); })}>{t('probe')}</Button></div>
      <form onSubmit={(event) => { event.preventDefault(); void run(async () => { const result = await window.pincer.memory.search(selected, query); if (result.ok) setSearch(result.value); else setError(result.error.message); }); }} className="flex gap-2"><Input aria-label={t('query')} placeholder={t('query')} value={query} onChange={(event) => setQuery(event.target.value)} maxLength={4000} /><Button disabled={!connected || !selected || busy || !query.trim()}>{t('search')}</Button></form>
    </div>
    {health && <div role="status" className="settings-card text-sm"><p>{t(health.ready ? 'ready' : health.checked ? 'notReady' : 'unknown')}</p><p className="mt-1 text-muted-foreground">{t('provider')}: {health.provider ?? '—'}</p>{health.error && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{health.error}</p>}</div>}
    {file && <section className="settings-card"><label htmlFor="memory-content" className="mb-2 block text-sm font-medium">MEMORY.md</label><textarea id="memory-content" value={content} onChange={(event) => setContent(event.target.value)} disabled={busy || !connected} maxLength={200000} rows={10} className="w-full rounded-xl border border-input bg-background p-4 font-mono text-sm outline-none focus:ring-1 focus:ring-ring" /><Button className="mt-3" disabled={!dirty || busy || !connected} onClick={() => void run(async () => { const result = await window.pincer.memory.save(selected, content, file.hash); if (result.ok) { setFile(result.value); setContent(result.value.content); setNotice(t('saved')); } else setError(result.error.code === 'MEMORY_CONFLICT' ? t('conflict') : result.error.message); })}>{t('save')}</Button></section>}
    {search && <section className="settings-card"><p className="mb-2 text-xs text-muted-foreground">{search.semantic === false ? t('keyword') : search.semantic === null ? t('verifySearch') : t('ready')}</p><pre className="whitespace-pre-wrap break-words text-xs leading-6">{search.text}</pre></section>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}{error && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">{error}</p>}
  </div>;
}
