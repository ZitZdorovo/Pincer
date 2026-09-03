import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { usePreferences } from '../preferences';
import type { GatewayState, UpdateState, WorkspaceState, ChatLocation } from '../../shared/contract';
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
import { Files } from '../features/Files';
import { Modal } from './ui/modal';
import { Button } from './ui/button';

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
  const [newLocation, setNewLocation] = useState<ChatLocation | undefined>(undefined);
  const [newChat, setNewChat] = useState(false); const [newAgent, setNewAgent] = useState('');
  const [error, setError] = useState(''); const [creating, setCreating] = useState(false); const ready = state.operator.phase === 'connected';
  useEffect(() => { onDirty(chatDirty || memoryDirty || filesDirty); }, [chatDirty, memoryDirty, filesDirty, onDirty]);
  useEffect(() => {
    let mounted = true;
    const accept = (next: WorkspaceState) => { if (mounted) setWorkspace((previous) => !previous || next.revision >= previous.revision ? next : previous); };
    const off = window.pincer.chat.onState(accept);
    void window.pincer.chat.snapshot().then(accept).catch(() => setError(language === 'ru' ? 'Не удалось загрузить чаты' : 'Unable to load chats'));
    return () => { mounted = false; off(); };
  }, []);
  const create = async (agent = workspace?.agentId, location?: ChatLocation) => {
    if (!workspace?.agentId || creating || !active) return;
    setCreating(true); setError('');
    try { const result = await window.pincer.chat.create(agent || workspace.agentId, location); if (!result.ok) setError(result.error.message); else { setView('chat'); setNewChat(false); } }
    finally { setCreating(false); }
  };
  return <DonorProvider gateway={state} workspace={workspace} updates={updates} newChat={(location) => { if (!active) return; setNewLocation(location); if (!ready) { setView('chat'); return; } if ((workspace?.agents.length || 0) > 1) { setNewAgent(workspace?.agentId || ''); setError(''); setNewChat(true); } else void create(undefined, location); }}><div className="relative flex min-h-0 flex-1 overflow-hidden bg-surface-sidebar" data-testid="main-layout">
    <Sidebar active={active} />
    <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-background p-6" data-testid="main-content">
      {error && <p role="alert" className="absolute left-6 right-6 top-2 z-30 rounded-lg bg-surface-modal p-3 text-sm text-destructive" onClick={() => setError('')}>{error}</p>}
      <div className={view === 'chat' ? '-m-6 flex h-[calc(100%+3rem)]' : 'hidden'}><div className="min-w-0 flex-1"><Chat creating={creating} state={workspace} language={language} connected={ready} onDirty={setChatDirty} active={active && view === 'chat'} filesOpen={Boolean(fileKey)} openFiles={() => { if (workspace?.selected && (!filesDirty || fileKey === workspace.selected || window.confirm(language === 'ru' ? 'Отменить изменения файла?' : 'Discard file changes?'))) setFileKey(workspace.selected); }} /></div>{fileKey && <Files key={fileKey} sessionKey={fileKey} close={() => setFileKey(null)} onDirty={setFilesDirty} />}</div>
      <div className={view === 'memory' ? 'h-full overflow-auto' : 'hidden'}><Memory state={workspace} language={language} connected={ready} onDirty={setMemoryDirty} /></div>
      {view === 'updates' && <div className="h-full overflow-auto"><UpdatesPage state={updates} language={language} dirty={chatDirty || memoryDirty || filesDirty} nodeVersion={state.nodeVersion} /></div>}
      {view === 'agents' && <Agents workspace={workspace} connected={ready} />}
      {view === 'skills' && <Skills workspace={workspace} connected={ready} />}
      {view === 'cron' && <Cron workspace={workspace} connected={ready} />}
      {view === 'channels' && <Channels workspace={workspace} connected={ready} />}
      {view === 'models' && <Models connected={ready} />}
    </main>
    <Modal open={newChat} title={language === 'ru' ? 'Новый чат' : 'New chat'} close={() => { if (!creating) setNewChat(false); }} description={language === 'ru' ? 'Выберите агента для нового разговора. Существующие чаты и черновики сохранятся.' : 'Choose an agent for the new conversation. Existing chats and drafts are preserved.'}><form onSubmit={(event) => { event.preventDefault(); void create(newAgent, newLocation); }}><label className="block text-sm">{language === 'ru' ? 'Агент' : 'Agent'}<select aria-label={language === 'ru' ? 'Агент нового чата' : 'New chat agent'} value={newAgent} onChange={(event) => setNewAgent(event.target.value)} className="mt-2 block w-full rounded-lg border border-border bg-surface-input p-2">{workspace?.agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select></label>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<Button className="mt-4" disabled={creating || !ready || !newAgent}>{language === 'ru' ? 'Создать чат' : 'Create chat'}</Button></form></Modal>
  </div></DonorProvider>;
}
