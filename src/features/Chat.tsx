import { RunStatus, ToolActivity } from '../donor/ToolActivity';
import { DonorMarkdown, DonorMessage, ActivityStream } from '../donor/Message';
import { toast } from 'sonner';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { ChatAttachment, WorkspaceState } from '../../shared/contract';
import type { Language } from '../i18n';
import { featureText } from './text';
import { uiText } from '../ui-text';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { DonorComposer } from '../donor/Composer';
import { ChatHeader } from '../donor/ChatHeader';
import { usePreferences } from '../preferences';
import { cn } from '../lib/utils';
import { ChatScrollNavigator, type ChatScrollNavigatorItem } from '../donor/ChatScrollNavigator';

function navigatorPreview(text: string, fallback: string): string {
  const value = text.replace(/\s+/g, ' ').trim() || fallback;
  return value.length > 180 ? `${value.slice(0, 177)}...` : value;
}

export function Chat({ state, language, connected, onDirty, active, openFiles, filesOpen = false, creating }: { state: WorkspaceState | null; language: Language; connected: boolean; onDirty(value: boolean): void; active: boolean; filesOpen?: boolean; creating: boolean; openFiles(): void }) {
  const t = featureText(language); const c = uiText(language, 'chat');
  const ru = language === 'ru';
  const compactionToast = useRef<string | number | undefined>(undefined);
  useEffect(() => {
    if (!state?.compaction || !active) { if (compactionToast.current !== undefined) toast.dismiss(compactionToast.current); return; }
    const current = state.compaction;
    compactionToast.current = toast.info(current.phase === 'running' ? ru ? 'Сжатие контекста…' : 'Compacting context…' : ru ? 'Беседа оптимизирована' : 'Conversation optimized', { id: 'pincer-compaction', duration: current.phase === 'running' ? Infinity : 4000 });
    return () => { if (compactionToast.current !== undefined) toast.dismiss(compactionToast.current); };
  }, [state?.compaction?.id, state?.compaction?.phase, active, ru]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Record<string, ChatAttachment[]>>({});
  const [draftScope, setDraftScope] = useState(''); const savedDrafts = useRef<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const preferences = usePreferences();
  const [targetAgent, setTargetAgent] = useState<string | undefined>(); const [workspacePath, setWorkspacePath] = useState(preferences.chatWorkspacePath);
  const [find, setFind] = useState(false); const [query, setQuery] = useState(''); const [match, setMatch] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const scroller = useRef<HTMLDivElement | null>(null); const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null); const input = useRef<HTMLTextAreaElement>(null);
  const articles = useRef(new Map<number, HTMLElement>());
  const end = useRef<HTMLDivElement>(null);
  const composerOverlay = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(164);
  const attachScroller = useCallback((element: HTMLDivElement | null) => {
    scroller.current = element;
    setScrollElement((current) => current === element ? current : element);
  }, []);
  useEffect(() => {
    const overlay = composerOverlay.current;
    if (!overlay) return;
    const measure = () => setComposerHeight(Math.ceil(overlay.getBoundingClientRect().height));
    measure(); const observer = new ResizeObserver(measure); observer.observe(overlay);
    return () => observer.disconnect();
  }, []);
  const key = state?.selected ?? 'new'; const session = state?.sessions.find((item) => item.key === key);
  const draft = drafts[key] ?? '';
  const files = attachments[key];
  const pending = useRef<{ key: string; text: string; id: string; files?: ChatAttachment[] } | null>(null);
  const agentId = session?.agentId || state?.selected?.split(':')[1] || state?.agentId || '';
  const navigatorItems = useMemo<ChatScrollNavigatorItem[]>(() => {
    const messages = state?.messages || [];
    const items: ChatScrollNavigatorItem[] = [];
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.role !== 'user') continue;
      const assistant = messages.slice(index + 1).find((candidate) => candidate.role === 'user' ? false : candidate.role === 'assistant');
      const nextUser = messages.slice(index + 1).findIndex((candidate) => candidate.role === 'user');
      const assistantIndex = messages.slice(index + 1).findIndex((candidate) => candidate.role === 'assistant');
      const belongsToTurn = assistantIndex >= 0 && (nextUser < 0 || assistantIndex < nextUser);
      items.push({
        id: `${state?.selected || 'chat'}:${index}`,
        anchorId: `pincer-chat-turn-${index}`,
        userPreview: navigatorPreview(message.text, ru ? 'Вопрос' : 'Question'),
        assistantPreview: belongsToTurn && assistant ? navigatorPreview(assistant.text, ru ? 'Ответ' : 'Answer') : state?.activeRun && index === messages.length - 1 && state.stream ? navigatorPreview(state.stream, ru ? 'Ответ' : 'Answer') : undefined,
      });
    }
    return items;
  }, [ru, state?.activeRun, state?.messages, state?.selected, state?.stream]);
  useEffect(() => { setTargetAgent(undefined); }, [key, state?.scope]);
  const matches = state?.messages.flatMap((message, index) => query && message.text.toLowerCase().includes(query.toLowerCase()) ? [index] : []) ?? [];
  useEffect(() => {
    let current = true; setDraftScope(''); if (!state?.scope) return;
    const scope = state.scope;
    void window.pincer.drafts.read(scope).then((result) => { if (!current) return; if (result.ok) { savedDrafts.current = result.value; setDrafts(result.value); setDraftScope(scope); } else setError(result.error.message); });
    return () => { current = false; };
  }, [state?.scope]);
  useEffect(() => {
    if (!draftScope || draftScope !== state?.scope) return;
    for (const [id, text] of Object.entries(drafts)) if (savedDrafts.current[id] !== text) {
      savedDrafts.current = { ...savedDrafts.current, [id]: text };
      void window.pincer.drafts.write(draftScope, id, text).then((result) => { if (!result.ok) setError(result.error.message); });
    }
  }, [drafts, draftScope, state?.scope]);
  useEffect(() => { onDirty(Object.values(drafts).some((value) => value.length > 0) || Object.values(attachments).some((value) => value.length > 0)); }, [drafts, attachments, onDirty]);
  useEffect(() => { if (atBottom && !find) end.current?.scrollIntoView({ block: 'end' }); }, [state?.stream, state?.messages.length]);
  useEffect(() => { setAtBottom(true); setMatch(0); end.current?.scrollIntoView({ block: 'end' }); }, [key]);
  useEffect(() => { if (input.current) { input.current.style.height = '48px'; input.current.style.height = Math.min(240, input.current.scrollHeight) + 'px'; } }, [draft]);
  useEffect(() => {
    if (!active) return;
    const listener = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); setFind(true); } if (event.key === 'Escape') setFind(false); };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  }, [active]);
  useEffect(() => { if (matches.length) articles.current.get(matches[match % matches.length])?.scrollIntoView({ block: 'center' }); }, [query, match]);
  const act = async () => {
    if ((!draft.trim() && !files?.length) || busy || creating || !connected || state?.activeRun || draftScope !== state?.scope) return;
    setBusy(true); setError('');
    try {
      if (!state?.selected) {
        const created = await window.pincer.chat.create(agentId, workspacePath ? { cwd: workspacePath } : undefined);
        if (!created.ok) { setError(created.error.message); return; }
      }
      const selected = (await window.pincer.chat.snapshot()).selected;
      if (!selected) return;
      if (key === 'new') { setDrafts((previous) => ({ ...previous, new: '', [selected]: draft })); if (files) setAttachments((previous) => ({ ...previous, new: [], [selected]: files })); }
      if (pending.current?.key !== selected || pending.current.text !== draft || pending.current.files !== files) pending.current = { key: selected, text: draft, id: crypto.randomUUID(), files };
      const result = await window.pincer.chat.send(draft, pending.current.id, files, targetAgent);
      if (result.ok) { setDrafts((previous) => ({ ...previous, [key]: '', [selected]: '' })); setAttachments((previous) => ({ ...previous, [key]: [], [selected]: [] })); pending.current = null; setTargetAgent(undefined); setAtBottom(true); end.current?.scrollIntoView({ block: 'end' }); }
      else setError(result.error.message);
    } catch { setError(t('loadFailed')); }
    finally { setBusy(false); input.current?.focus(); }
  };
  const attach = async (selectedFiles: File[]) => {
    if (busy || creating || !connected || !selectedFiles.length) return;
    if ((files?.length || 0) + selectedFiles.length > 10 || selectedFiles.some((file) => file.size > 20 * 1024 * 1024) || selectedFiles.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) { setError(ru ? 'Не более 10 файлов и 20 МБ за один выбор. Лимит Gateway может быть меньше.' : 'Up to 10 files and 20 MB per selection. Gateway limits may be lower.'); return; }
    setBusy(true); setError('');
    try {
      const next = await Promise.all(selectedFiles.map((file) => new Promise<ChatAttachment>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('FILE_READ_FAILED')); reader.onload = () => resolve({ fileName: file.name || 'pasted-image.png', mimeType: file.type || 'application/octet-stream', content: String(reader.result).split(',')[1] || '' }); reader.readAsDataURL(file); })));
      setAttachments((previous) => ({ ...previous, [key]: [...(previous[key] || []), ...next] }));
    } catch { setError(ru ? 'Не удалось прочитать файл.' : 'Could not read the file.'); }
    finally { setBusy(false); }
  };
  const selectModel = async (model: string, thinking?: string) => {
    setBusy(true); setError('');
    try {
      if (!state?.selected) { const result = await window.pincer.chat.create(agentId, workspacePath ? { cwd: workspacePath } : undefined); if (!result.ok) { setError(result.error.message); return; } const selected = (await window.pincer.chat.snapshot()).selected; if (selected) { setDrafts((previous) => ({ ...previous, new: '', [selected]: draft })); if (files) setAttachments((previous) => ({ ...previous, new: [], [selected]: files })); } }
      const result = await window.pincer.chat.setModel(model, thinking);
      if (!result.ok) setError(result.error.message); else setError('');
    } finally { setBusy(false); }
  };
  return <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-tl-2xl border-t border-border/70 bg-surface-chat transition-colors duration-500" data-testid="chat-page">
    <ChatHeader session={session} agents={state?.agents || []} agentId={agentId} targetAgentId={targetAgent} onAgent={(id) => setTargetAgent(id || undefined)} connected={connected} openFiles={openFiles}>
    {find && <div className="absolute right-4 top-12 z-30 flex w-[min(400px,90%)] items-center gap-1 rounded-xl border border-border bg-surface-modal p-2 shadow-lg"><Input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setMatch(0); }} placeholder={c('find.placeholder')} className="h-8" /><span className="whitespace-nowrap px-1 text-xs text-muted-foreground">{matches.length ? (match % matches.length) + 1 : 0}/{matches.length}</span><button aria-label={c('find.previous')} onClick={() => setMatch((value) => Math.max(0, value + matches.length - 1))}><ChevronUp size={16} /></button><button aria-label={c('find.next')} onClick={() => setMatch((value) => value + 1)}><ChevronDown size={16} /></button><button aria-label={c('find.close')} onClick={() => setFind(false)}><X size={16} /></button></div>}
    </ChatHeader>
    <div className="relative min-h-0 flex-1 overflow-hidden"><div ref={attachScroller} onScroll={() => { const el = scroller.current; if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 100); }} className="openx-copy-surface h-full min-h-0 overflow-y-scroll px-4 py-4" data-testid="chat-scroll-container"><div className="mx-auto w-full space-y-7 pl-[4px]" style={{ maxWidth: 'var(--pincer-chat-width, 736px)', paddingBottom: composerHeight + 16 }}>
      {state?.hasMore && <Button variant="ghost" disabled={state.loading} onClick={() => void window.pincer.chat.more()}>{t('more')}</Button>}
      {!state?.messages.length && !state?.activeRun && <div data-testid="acp-chat-empty-state" className="flex h-[60vh] flex-col items-center justify-center text-center"><h1 className="text-4xl font-sans font-semibold tracking-tight text-foreground/80 md:text-5xl">{c('welcome.subtitle')}</h1></div>}
      {state?.messages.map((message, index) => <article id={message.role === 'user' ? `pincer-chat-turn-${index}` : undefined} ref={(element) => { if (element) articles.current.set(index, element); else articles.current.delete(index); }} key={`${state.selected}-${index}`} className={cn('relative scroll-mt-20 text-[14px] leading-[1.55]', find && matches[match % matches.length] === index && 'rounded-lg ring-2 ring-primary/40')}><DonorMessage message={message} /></article>)}
      {state?.activeRun && <article className="chat-markdown text-sm leading-7" aria-live="polite"><RunStatus startedAt={state.runStartedAt} phase={state.runPhase} />{state.liveActivity?.length ? <ActivityStream blocks={state.liveActivity} tools={state.liveTools} live /> : <>{!!state.liveTools?.length && <ToolActivity tools={state.liveTools} live />}{state.stream && <DonorMarkdown text={state.stream} isAnimating />}</>}</article>}
      {(error || state?.error) && <p role="alert" className="whitespace-pre-wrap break-words rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error || state?.error?.message}</p>}<div ref={end} />
    </div></div><ChatScrollNavigator items={navigatorItems} scrollElement={scrollElement} label={ru ? 'Навигация по вопросам и ответам' : 'Question and answer navigation'} concealed={filesOpen} /></div>
    <div ref={composerOverlay} data-testid="chat-composer-overlay" className="pointer-events-none absolute bottom-0 left-0 right-[12px] z-30 translate-x-[2px]"><div className="relative"><div className="pointer-events-auto"><DonorComposer input={draft} setInput={(text) => setDrafts((previous) => ({ ...previous, [key]: text }))} files={files || []} attach={(incoming) => void attach(incoming)} removeFile={(index) => setAttachments((previous) => ({ ...previous, [key]: (previous[key] || []).filter((_, position) => position !== index) }))} send={() => void act()} stop={() => void window.pincer.chat.abort().then((result) => { if (!result.ok) setError(result.error.message); })} disabled={!connected || busy || creating || draftScope !== state?.scope} sending={Boolean(state?.activeRun)} state={state} agentId={agentId} targetAgentId={targetAgent} onAgent={(id) => setTargetAgent(id || undefined)} onModel={selectModel} workspacePath={session?.cwd || workspacePath} onWorkspace={setWorkspacePath} scrollToLatestAction={!atBottom ? <button onClick={() => { setAtBottom(true); end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }} aria-label={c('scrollToLatest')} className="rounded-full border border-border bg-surface-modal p-2 shadow"><ArrowDown size={16} /></button> : undefined} /></div></div></div>
  </div>;
}
