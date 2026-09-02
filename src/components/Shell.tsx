import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Bot, Boxes, ChevronDown, Clock, MessageSquare, Network, Plus, Settings, Shapes, Brain, Download, RefreshCw } from 'lucide-react';
import type { GatewayState, UpdateState, WorkspaceState } from '../../shared/contract';
import { translator, type Language } from '../i18n';
import { Chat } from '../features/Chat';
import { Memory } from '../features/Memory';
import { UpdatesPage } from '../features/Updates';
import { featureText } from '../features/text';
export function Shell({ state, language, collapsed, configure, updates }: { state: GatewayState; language: Language; collapsed: boolean; configure(): void; updates: UpdateState | null }) {
  const t = translator(language); const f = featureText(language); const reducedMotion = useReducedMotion();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [view, setView] = useState<'chat' | 'memory' | 'updates'>('chat');
  const [chatDirty, setChatDirty] = useState(false); const [memoryDirty, setMemoryDirty] = useState(false);
  const [error, setError] = useState(''); const [creating, setCreating] = useState(false); const ready = state.operator.phase === 'connected';
  useEffect(() => {
    let active = true;
    const accept = (next: WorkspaceState) => { if (active) setWorkspace((previous) => !previous || next.revision >= previous.revision ? next : previous); };
    const off = window.pincer.chat.onState(accept);
    void window.pincer.chat.snapshot().then(accept).catch(() => setError(f('loadFailed')));
    return () => { active = false; off(); };
  }, []);
  const create = async () => {
    if (!workspace?.agentId || creating) return;
    setCreating(true); setError('');
    try { const result = await window.pincer.chat.create(workspace.agentId); if (!result.ok) setError(result.error.message); else setView('chat'); }
    finally { setCreating(false); }
  };
  return <div className="relative flex min-h-0 flex-1 overflow-hidden bg-surface-sidebar" data-testid="main-layout">
    <motion.aside initial={false} animate={{ width: collapsed ? 0 : 260, opacity: collapsed ? 0 : 1 }} transition={{ duration: reducedMotion ? 0 : 0.2 }} className="relative flex shrink-0 flex-col overflow-hidden" inert={collapsed}>
      <div className="flex h-full w-[260px] flex-col pr-1.5">
        <div className="flex h-11 items-center px-4 pt-1"><span className="text-base font-bold tracking-tight">Pincer</span></div>
        <div className="px-2"><button onClick={() => void create()} disabled={!ready || !workspace?.agentId || creating} className="sidebar-nav-text flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/5"><Plus className="h-3.5 w-3.5" />{t('newChat')}</button></div>
        <nav className="flex flex-col px-2" aria-label="Pincer">
          <button onClick={() => setView('memory')} className={`sidebar-nav-text flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 ${view === 'memory' ? 'bg-black/5 dark:bg-white/5' : ''}`}><Brain className="h-3.5 w-3.5" />{f('memory')}</button>
          {([{ key: 'models', icon: Boxes }, { key: 'agents', icon: Bot }, { key: 'channels', icon: MessageSquare }, { key: 'skills', icon: Shapes }, { key: 'cron', icon: Clock }] as const).map(({ key, icon: Icon }) => <button key={key} disabled title={t('later')} className="sidebar-nav-text flex items-center gap-2 rounded-lg px-2.5 py-1 text-foreground/40"><Icon className="h-3.5 w-3.5" /><span>{t(key)}</span></button>)}
        </nav>
        <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-auto px-2">
          <div className="mb-2 flex items-center px-1 text-meta font-semibold text-foreground/70"><ChevronDown className="mr-1 h-3 w-3" /><span>{t('sessions')}</span><button disabled={!ready || workspace?.loading} onClick={() => void window.pincer.chat.refresh()} aria-label={f('refresh')} className="ml-auto p-1"><RefreshCw size={12} /></button></div>
          {workspace?.sessions.map((session) => <button key={session.key} onClick={() => { setView('chat'); void window.pincer.chat.select(session.key); }} className={`sidebar-nav-text truncate rounded-lg px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 ${workspace.selected === session.key && view === 'chat' ? 'bg-black/5 dark:bg-white/5' : ''}`} title={session.title}>{session.title}</button>)}
        </div>
        <div className="mt-auto p-2"><button onClick={() => setView('updates')} className="sidebar-nav-text flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"><Download className="h-4 w-4" />{f('updates')}{updates?.phase === 'available' && <span className="ml-auto h-2 w-2 rounded-full bg-primary" />}</button><div className="flex items-center gap-1">
          <button onClick={configure} className="sidebar-nav-text flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"><Settings className="h-4 w-4" /><span>{t('settings')}</span></button>
          <button onClick={configure} title={t('connection')} aria-label={t('connection')} className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground"><Network className="h-4 w-4" /><span className={`absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-surface-sidebar ${ready && state.node.phase === 'connected' ? 'bg-green-500' : 'bg-amber-500'}`} /></button>
        </div></div>
      </div><div className="pointer-events-none absolute bottom-2 right-0 top-2 w-px bg-border/60" />
    </motion.aside>
    <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-background/40" data-testid="main-content">
      {error && <p role="alert" className="p-3 text-sm text-destructive">{error}</p>}
      <div className={view === 'chat' ? 'h-full' : 'hidden'}><Chat state={workspace} language={language} connected={ready} onDirty={setChatDirty} /></div>
      <div className={view === 'memory' ? 'h-full overflow-auto' : 'hidden'}><Memory state={workspace} language={language} connected={ready} onDirty={setMemoryDirty} /></div>
      {view === 'updates' && <UpdatesPage state={updates} language={language} dirty={chatDirty || memoryDirty} nodeVersion={state.nodeVersion} />}
    </main>
  </div>;
}
