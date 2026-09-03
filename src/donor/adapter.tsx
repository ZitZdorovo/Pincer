import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { GatewayState, WorkspaceState, UpdateState, Result, ChatLocation } from '../../shared/contract';
import type { ChatFolder, ChatSession } from './types';
export { useSettingsStore } from './settings-adapter';

function unavailable() {
  const message = document.documentElement.lang === 'ru'
    ? 'Эта операция ещё не поддерживается прямым подключением к Gateway. Данные не изменены.'
    : 'This operation is not supported by the direct Gateway connection yet. No data was changed.';
  toast.error(message);
  return message;
}
async function checked<T>(request: Promise<Result<T>>): Promise<T> {
  const result = await request;
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
// Rejections of click-only actions are displayed, never silently treated as success.
async function reported(request: Promise<Result<unknown>>) { try { await checked(request); } catch (error) { toast.error(String(error)); } }
const refresh = () => reported(window.pincer.chat.refresh());
const loadOrganization = async () => { /* projects arrive in the same revisioned workspace snapshot */ };
const emptyFolders: ChatFolder[] = [];
type Props = { children: ReactNode; workspace: WorkspaceState | null; gateway: GatewayState; updates: UpdateState | null; newChat(location?: ChatLocation): void };
function useViewModel({ workspace, gateway, updates, newChat }: Omit<Props, 'children'>) {
  const [collapsedProjectIds, collapseProjects] = useState<string[]>([]);
  const [pinnedProjectIds, pinProjects] = useState<string[]>([]);
  const [pinnedCollapsed, collapsePinned] = useState(false);
  const sessions = useMemo<ChatSession[]>(() => (workspace?.sessions || []).map((session) => ({
    key: session.key, label: session.title, workspacePath: session.cwd, updatedAt: session.updatedAt,
    busy: Boolean(session.activeRunId),
  })), [workspace?.sessions]);
  const projects = useMemo(() => (workspace?.projects || []).map((project, order) => ({ ...project, order })), [workspace?.projects]);
  const phase = gateway.operator.phase;
  return {
    newChat,
    chat: {
      sessions, currentSessionKey: workspace?.selected || '', sessionLabels: {} as Record<string, string>, sessionLastActivity: {} as Record<string, number>,
      switchSession: (key: string) => void reported(window.pincer.chat.select(key)),
      setSessionWorkspace: (_key: string, _path: string) => { /* selection does not change a session's real cwd */ },
      loadSessions: refresh,
      renameSession: (key: string, title: string) => checked(window.pincer.chat.rename(key, title)),
      deleteSession: (key: string) => checked(window.pincer.chat.remove(key)),
    },
    agents: { agents: workspace?.agents || [], fetchAgents: refresh },
    gateway: { status: {
      state: phase === 'connected' ? 'running' : phase === 'reconnecting' ? 'reconnecting' : phase === 'disconnected' ? 'stopped' : phase === 'connecting' ? 'starting' : 'error',
      gatewayReady: phase === 'connected', connectedAt: gateway.operator.connectedAt,
      error: gateway.operator.failure?.message, errorCode: gateway.operator.failure?.code, reconnectAttempts: 1,
    } },
    update: { status: (updates?.phase || 'idle') as string, updateInfo: updates?.version ? { version: updates.version } : undefined },
    attention: { bySessionKey: {} as Record<string, { unread: boolean }>, markRead: (_key: string) => {} },
    organization: {
      projects, folders: emptyFolders,
      placements: sessions.flatMap((session, order) => {
        const project = projects.find((candidate) => candidate.path === session.workspacePath);
        return project ? [{ chatKey: session.key, projectId: project.id, folderId: null as string | null, order }] : [];
      }),
      workspacePaths: {} as Record<string, string>, pinnedChatKeys: (workspace?.sessions || []).filter((session) => session.pinned).map((session) => session.key),
      pinnedProjectIds, pinnedFolderIds: [] as string[], collapsedProjectIds, collapsedFolderIds: [] as string[], pinnedCollapsed,
      loading: workspace?.loading || false, load: loadOrganization,
      createProject: (name: string, path: string) => checked(window.pincer.chat.registerProject(name.trim() || path.split(/[\\/]/).at(-1) || path, path)),
      deleteProject: (id: string, _keepChats: boolean) => checked(window.pincer.chat.removeProject(id)),
      pinChat: (key: string, pinned: boolean, _before?: string | null) => reported(window.pincer.chat.pin(key, pinned)),
      pinNode: async (kind: string, id: string, pinned: boolean) => { if (kind === 'project') pinProjects((ids) => pinned ? [...ids.filter((value) => value !== id), id] : ids.filter((value) => value !== id)); },
      setCollapsed: (kind: string, collapsed: boolean, id?: string) => {
        if (kind === 'pinned') collapsePinned(collapsed);
        else if (kind === 'project' && id) collapseProjects((ids) => collapsed ? [...ids.filter((value) => value !== id), id] : ids.filter((value) => value !== id));
      },
      // Controls using these actions are disabled in the donor presentation until
      // the Gateway exposes real cwd/folder operations; no local imaginary moves.
      moveChat: async (_key: string, _project: string, _folder: string | null, _before?: string) => { throw new Error(unavailable()); },
      moveFolder: async (_id: string, _project: string, _parent: string | null) => { throw new Error(unavailable()); },
      unplaceChat: async (_key: string, _cwd: string) => { /* pinning does not mutate cwd */ },
      createFolder: async (_project: string, _name: string, _parent?: string | null) => { unavailable(); },
      rename: async (_kind: string, _id: string, _name: string) => { unavailable(); },
      deleteFolder: async (_id: string, _keepChats: boolean) => { unavailable(); },
    },
  };
}
const Context = createContext<ReturnType<typeof useViewModel> | null>(null);
export function DonorProvider({ children, ...props }: Props) { const value = useViewModel(props); return <Context.Provider value={value}>{children}</Context.Provider>; }
function useModel() { const value = useContext(Context); if (!value) throw new Error('Pincer presentation provider missing'); return value; }
export function useChatStore<T>(select: (state: ReturnType<typeof useViewModel>['chat']) => T) { return select(useModel().chat); }
export function useGatewayStore<T>(select: (state: ReturnType<typeof useViewModel>['gateway']) => T) { return select(useModel().gateway); }
export function useAgentsStore<T>(select: (state: ReturnType<typeof useViewModel>['agents']) => T) { return select(useModel().agents); }
export function useUpdateStore<T>(select: (state: ReturnType<typeof useViewModel>['update']) => T) { return select(useModel().update); }
export function useSessionAttentionStore<T>(select: (state: ReturnType<typeof useViewModel>['attention']) => T) { return select(useModel().attention); }
export function useChatOrganizationStore() { return useModel().organization; }
export function useNewChatAction() { return useModel().newChat; }
export const hostApi = {
  dialog: { open: async (_options: { title: string; properties: string[] }) => { const result = await window.pincer.desktop.chooseDirectory(); if (!result.ok) { toast.error(result.error.message); return { canceled: true, filePaths: [] as string[] }; } return { canceled: !result.value, filePaths: result.value ? [result.value] : [] }; } },
  shell: { openPath: async (_path: string) => { unavailable(); }, openTerminal: async (_path: string) => { unavailable(); } },
};
