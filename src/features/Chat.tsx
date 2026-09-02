import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Square } from 'lucide-react';
import type { WorkspaceState } from '../../shared/contract';
import type { Language } from '../i18n';
import { featureText } from './text';
import { Button } from '../components/ui/button';

export function Chat({ state, language, connected, onDirty }: { state: WorkspaceState | null; language: Language; connected: boolean; onDirty(value: boolean): void }) {
  const t = featureText(language);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [agent, setAgent] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const key = state?.selected ?? 'new';
  const draft = drafts[key] ?? '';
  const pending = useRef<{ key: string; text: string; id: string } | null>(null);
  useEffect(() => { onDirty(Object.values(drafts).some((value) => value.length > 0)); }, [drafts, onDirty]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [state?.stream, state?.messages.length, state?.selected]);
  const act = async () => {
    if (!draft.trim() || busy || !connected || state?.activeRun) return;
    setBusy(true); setError('');
    try {
      if (!state?.selected) {
        const created = await window.pincer.chat.create(agent || state?.agentId || '');
        if (!created.ok) { setError(created.error.message); return; }
      }
      const selected = (await window.pincer.chat.snapshot()).selected;
      if (!selected) return;
      if (key === 'new') setDrafts((previous) => ({ ...previous, new: '', [selected]: draft }));
      if (pending.current?.key !== selected || pending.current.text !== draft) pending.current = { key: selected, text: draft, id: crypto.randomUUID() };
      const result = await window.pincer.chat.send(draft, pending.current.id);
      if (result.ok) { setDrafts((previous) => ({ ...previous, [key]: '', [selected]: '' })); pending.current = null; }
      else setError(result.error.message);
    } catch { setError(t('loadFailed')); }
    finally { setBusy(false); }
  };
  return <div className="flex h-full min-h-0 flex-col" data-testid="chat-page">
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-6 text-sm"><span className="max-w-[75%] truncate">{state?.sessions.find((session) => session.key === state.selected)?.title ?? 'Pincer'}</span><span className="text-xs text-muted-foreground">{connected ? t('chat') : t('offline')}</span></div>
    <div className="min-h-0 flex-1 overflow-auto px-6 py-6"><div className="mx-auto max-w-3xl space-y-6">
      {state?.hasMore && <Button variant="ghost" disabled={state.loading} onClick={() => void window.pincer.chat.more()}>{t('more')}</Button>}
      {!state?.messages.length && !state?.activeRun && <div className="grid min-h-[30vh] place-items-center"><h1 className="text-3xl font-normal tracking-tight">{t('greeting')}</h1></div>}
      {state?.messages.map((message, index) => <article key={`${state.selected}-${index}`} className={message.role === 'user' ? 'ml-auto w-fit max-w-[90%] rounded-2xl bg-muted px-4 py-3' : 'chat-markdown text-sm leading-7'}>{message.role === 'user' ? <p className="whitespace-pre-wrap text-sm">{message.text}</p> : <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: () => null, a: ({ children }) => <span className="text-primary underline">{children}</span> }}>{message.text}</Markdown>}</article>)}
      {state?.activeRun && <article className="chat-markdown text-sm leading-7" aria-live="polite">{state.stream ? <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}>{state.stream}</Markdown> : <p className="animate-pulse text-muted-foreground">{t('thinking')}</p>}{state.tool && <p className="mt-2 text-xs text-muted-foreground">{t('tools')}: {state.tool}</p>}</article>}
      {(error || state?.error) && <p role="alert" className="whitespace-pre-wrap break-words rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error || state?.error?.message}</p>}<div ref={end} />
    </div></div>
    <form onSubmit={(event) => { event.preventDefault(); void act(); }} className="mx-auto mb-6 w-[calc(100%-3rem)] max-w-3xl shrink-0 rounded-[22px] border border-border/70 bg-muted/60 p-3 shadow-sm">
      <textarea value={draft} onChange={(event) => setDrafts((previous) => ({ ...previous, [key]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void act(); } }} aria-label={t('message')} placeholder={t('message')} disabled={!connected || busy} rows={3} maxLength={100000} className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground" />
      <div className="flex items-center gap-3 px-1">{!state?.selected && <select aria-label={t('agent')} value={agent || state?.agentId || ''} onChange={(event) => setAgent(event.target.value)} className="max-w-40 rounded bg-transparent text-xs" disabled={!connected}>{state?.agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<span className="text-xs text-muted-foreground">{t('full')}</span>
        {state?.activeRun ? <button type="button" onClick={() => void window.pincer.chat.abort().then((result) => { if (!result.ok) setError(result.error.message); })} aria-label={t('stop')} disabled={!connected} className="ml-auto rounded-full bg-foreground p-2 text-background"><Square size={16} fill="currentColor" /></button> : <button aria-label={t('send')} type="submit" disabled={!connected || busy || !draft.trim() || (!state?.selected && !state?.agentId)} className="ml-auto rounded-full bg-foreground p-2 text-background disabled:opacity-30"><ArrowUp size={18} /></button>}
      </div>
    </form>
  </div>;
}
