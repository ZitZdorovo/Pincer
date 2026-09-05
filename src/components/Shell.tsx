import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { usePreferences } from '../preferences';
import type { GatewayState, UpdateState, WorkspaceState } from '../../shared/contract';
import type { Language } from '../i18n';
import { Chat } from '../features/Chat';
import { Memory } from '../features/Memory';
import { UpdatesPage } from '../features/Updates';
import { Agents } from '../donor/Agents';
import { Skills } from '../donor/Skills';
import { Cron } from '../donor/Cron';
import { Channels } from '../donor/Channels';
import { Models } from '../donor/Models';
import { Sidebar } from '../donor/Sidebar';
import { DonorProvider } from '../donor/adapter';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';

const Files = lazy(() => import('../features/Files').then(module => ({ default: module.Files })));

export function Shell({ state, language, updates, onDirty, active }: { state: GatewayState; language: Language; configure(): void; openSettings(): void; updates: UpdateState | null; onDirty(value: boolean): void; active: boolean }) {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const location = useLocation(); const navigate = useNavigate();
  const view = location.pathname === '/' ? 'chat' : location.pathname.slice(1);
  const preferences = usePreferences(); const previousRun = useRef<WorkspaceState | null>(null);
  useEffect(() => {
    const previous = previousRun.current; previousRun.current = workspace;
    if (preferences.responseNotifications && (!active || view !== 'chat') && previous?.activeRun && workspace && !workspace.activeRun && !workspace.loading && previous.selected === workspace.selected && previous.scope === workspace.scope && workspace.messages.length > previous.messages.length && workspace.messages.at(-1)?.role === 'assistant') toast.info(language === 'ru' ? 'Ответ готов' : 'Response ready');
  }, [workspace, preferences.responseNotifications, active, view, language]);
  const setView = (page: string) => navigate(page === 'chat' ? '/' : `/${page}`);
  const [chatDirty, setChatDirty] = useState(false); const [memoryDirty, setMemoryDirty] = useState(false);
  const [fileKey, setFileKey] = useState<string | null>(null); const [filesDirty, setFilesDirty] = useState(false);
  const [error, setError] = useState(''); const ready = state.operator.phase === 'connected';
  useEffect(() => { onDirty(chatDirty || memoryDirty || filesDirty); }, [chatDirty, memoryDirty, filesDirty, onDirty]);
  useEffect(() => {
    let mounted = true;
    const accept = (next: WorkspaceState) => { if (mounted) setWorkspace((previous) => !previous || next.revision >= previous.revision ? next : previous); };
    const off = window.pincer.chat.onState(accept);
    void window.pincer.chat.snapshot().then(accept).catch(() => setError(language === 'ru' ? 'Не удалось загрузить чаты' : 'Unable to load chats'));
    return () => { mounted = false; off(); };
  }, []);
  return <DonorProvider gateway={state} workspace={workspace} updates={updates} newChat={(chatLocation) => { if (!active) return; setView('chat'); setFileKey(null); setError(''); void window.pincer.chat.prepare(chatLocation).then((result) => { if (!result.ok) setError(result.error.message); }); }}><div className="relative flex min-h-0 flex-1 overflow-hidden bg-surface-sidebar" data-testid="main-layout">
    <Sidebar active={active} />
    <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-background p-6" data-testid="main-content">
      {error && <p role="alert" className="absolute left-6 right-6 top-2 z-30 rounded-lg bg-surface-modal p-3 text-sm text-destructive" onClick={() => setError('')}>{error}</p>}
      <div className={view === 'chat' ? '-m-6 flex h-[calc(100%+3rem)]' : 'hidden'}><div className="min-w-0 flex-1"><Chat state={workspace} language={language} connected={ready} onDirty={setChatDirty} active={active && view === 'chat'} filesOpen={Boolean(fileKey)} openFiles={() => { if (fileKey) { if (!filesDirty || window.confirm(language === 'ru' ? 'Отменить изменения файла?' : 'Discard file changes?')) setFileKey(null); return; } if (workspace?.selected) setFileKey(workspace.selected); }} /></div><Suspense fallback={null}><AnimatePresence initial={false}>{fileKey && <Files key={fileKey} sessionKey={fileKey} close={() => setFileKey(null)} onDirty={setFilesDirty} />}</AnimatePresence></Suspense></div>
      <div className={view === 'memory' ? 'h-full overflow-auto' : 'hidden'}><Memory state={workspace} language={language} connected={ready} onDirty={setMemoryDirty} /></div>
      {view === 'updates' && <div className="h-full overflow-auto"><UpdatesPage state={updates} language={language} dirty={chatDirty || memoryDirty || filesDirty} nodeVersion={state.nodeVersion} /></div>}
      {view === 'agents' && <Agents workspace={workspace} connected={ready} />}
      {view === 'skills' && <Skills workspace={workspace} connected={ready} />}
      {view === 'cron' && <Cron workspace={workspace} connected={ready} />}
      {view === 'channels' && <Channels workspace={workspace} connected={ready} />}
      {view === 'models' && <Models connected={ready} />}
    </main>
  </div></DonorProvider>;
}
