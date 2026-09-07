import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { usePreferences } from '../preferences';
import type { GatewayState, UpdateState, WorkspaceState } from '../../shared/contract';
import type { Language } from '../i18n';
import { Chat } from '../features/Chat';
import { Sidebar } from '../donor/Sidebar';
import { DonorProvider } from '../donor/adapter';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { ConfirmDialog } from './ui/confirm-dialog';
import { cn } from '../lib/utils';

const Files = lazy(() => import('../features/Files').then(module => ({ default: module.Files })));
const Memory = lazy(() => import('../features/Memory').then(module => ({ default: module.Memory })));
const UpdatesPage = lazy(() => import('../features/Updates').then(module => ({ default: module.UpdatesPage })));
const Agents = lazy(() => import('../donor/Agents').then(module => ({ default: module.Agents })));
const Skills = lazy(() => import('../donor/Skills').then(module => ({ default: module.Skills })));
const Cron = lazy(() => import('../donor/Cron').then(module => ({ default: module.Cron })));
const Channels = lazy(() => import('../donor/Channels').then(module => ({ default: module.Channels })));
const Models = lazy(() => import('../donor/Models').then(module => ({ default: module.Models })));

export function Shell({ state, language, updates, onDirty, active }: { state: GatewayState; language: Language; configure(): void; openSettings(): void; updates: UpdateState | null; onDirty(value: boolean): void; active: boolean }) {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const location = useLocation(); const navigate = useNavigate();
  const requestedView = location.pathname === '/' ? 'chat' : location.pathname.slice(1);
  const views = ['chat', 'memory', 'updates', 'agents', 'skills', 'cron', 'channels', 'models'] as const;
  const view = views.includes(requestedView as typeof views[number]) ? requestedView : 'chat';
  const preferences = usePreferences(); const previousRun = useRef<WorkspaceState | null>(null);
  useEffect(() => {
    const previous = previousRun.current; previousRun.current = workspace;
    if (preferences.responseNotifications && (!active || view !== 'chat') && previous?.activeRun && workspace && !workspace.activeRun && !workspace.loading && previous.selected === workspace.selected && previous.scope === workspace.scope && workspace.messages.length > previous.messages.length && workspace.messages.at(-1)?.role === 'assistant') toast.info(language === 'ru' ? 'Ответ готов' : 'Response ready');
  }, [workspace, preferences.responseNotifications, active, view, language]);
  const setView = (page: string) => navigate(page === 'chat' ? '/' : `/${page}`);
  const [chatDirty, setChatDirty] = useState(false); const [memoryDirty, setMemoryDirty] = useState(false);
  const [fileKey, setFileKey] = useState<string | null>(null); const [filesDirty, setFilesDirty] = useState(false);
  const [confirmFilesClose, setConfirmFilesClose] = useState(false);
  const [error, setError] = useState(''); const ready = state.operator.phase === 'connected';
  useEffect(() => { onDirty(chatDirty || memoryDirty || filesDirty); }, [chatDirty, memoryDirty, filesDirty, onDirty]);
  useEffect(() => { if (active && requestedView !== view) navigate('/', { replace: true }); }, [active, navigate, requestedView, view]);
  useEffect(() => {
    let mounted = true;
    const accept = (next: WorkspaceState) => { if (mounted) setWorkspace((previous) => !previous || next.revision >= previous.revision ? next : previous); };
    const off = window.pincer.chat.onState(accept);
    void window.pincer.chat.snapshot().then(accept).catch(() => setError(language === 'ru' ? 'Не удалось загрузить чаты' : 'Unable to load chats'));
    return () => { mounted = false; off(); };
  }, []);
  return <DonorProvider gateway={state} workspace={workspace} updates={updates} newChat={(chatLocation) => { if (!active) return; setView('chat'); setFileKey(null); setError(''); void window.pincer.chat.prepare(chatLocation).then((result) => { if (!result.ok) setError(result.error.message); }); }}><div className="relative flex min-h-0 flex-1 overflow-hidden bg-surface-sidebar" data-testid="main-layout">
    <Sidebar active={active} />
    <main className={cn('relative min-h-0 min-w-0 flex-1 overflow-hidden p-6', view === 'chat' ? 'bg-surface-sidebar' : 'bg-background')} data-testid="main-content">
      {error && <div role="alert" className="absolute left-6 right-6 top-2 z-30 flex items-start gap-3 rounded-lg border border-destructive/25 bg-surface-modal p-3 text-sm text-destructive shadow-lg"><p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{error}</p><button type="button" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={language === 'ru' ? 'Закрыть сообщение об ошибке' : 'Dismiss error'} onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}
      <div data-testid="chat-workspace-surface" className={view === 'chat' ? 'chat-workspace-surface -m-6 flex h-[calc(100%+3rem)] overflow-hidden rounded-t-2xl bg-surface-chat' : 'hidden'}><div className="min-w-0 flex-1"><Chat state={workspace} language={language} connected={ready} onDirty={setChatDirty} active={active && view === 'chat'} filesOpen={Boolean(fileKey)} openFiles={() => { if (fileKey) { if (filesDirty) setConfirmFilesClose(true); else setFileKey(null); return; } if (workspace?.selected) setFileKey(workspace.selected); }} /></div><Suspense fallback={null}><AnimatePresence initial={false}>{fileKey && <Files key={fileKey} sessionKey={fileKey} close={() => setFileKey(null)} onDirty={setFilesDirty} />}</AnimatePresence></Suspense></div>
      <Suspense fallback={<div role="status" className="grid h-full place-items-center text-sm text-muted-foreground">{language === 'ru' ? 'Загрузка раздела…' : 'Loading section…'}</div>}>
        <div className={view === 'memory' ? 'h-full overflow-auto' : 'hidden'}><Memory state={workspace} language={language} connected={ready} onDirty={setMemoryDirty} embedded={false} /></div>
        {view === 'updates' && <div className="h-full overflow-auto"><UpdatesPage state={updates} language={language} dirty={chatDirty || memoryDirty || filesDirty} nodeVersion={state.nodeVersion} /></div>}
        {view === 'agents' && <Agents workspace={workspace} connected={ready} />}
        {view === 'skills' && <Skills workspace={workspace} connected={ready} />}
        {view === 'cron' && <Cron workspace={workspace} connected={ready} />}
        {view === 'channels' && <Channels workspace={workspace} connected={ready} />}
        {view === 'models' && <Models connected={ready} />}
      </Suspense>
      <ConfirmDialog open={confirmFilesClose} title={language === 'ru' ? 'Отбросить изменения?' : 'Discard changes?'} message={language === 'ru' ? 'Несохранённые изменения файла будут потеряны.' : 'Unsaved file changes will be lost.'} confirmLabel={language === 'ru' ? 'Отбросить' : 'Discard'} cancelLabel={language === 'ru' ? 'Продолжить редактирование' : 'Keep editing'} variant="destructive" onCancel={() => setConfirmFilesClose(false)} onConfirm={() => { setConfirmFilesClose(false); setFileKey(null); }} />
    </main>
  </div></DonorProvider>;
}
