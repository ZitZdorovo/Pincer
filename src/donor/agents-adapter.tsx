import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { WorkspaceState, Result } from '../../shared/contract';
import type { AgentSummary } from './agent-types';
import type { ProviderView } from './agent-model-options';
import { splitModelRef } from './agent-model-options';
import { resolveModelDisplayName } from './model-display';
export type ChannelGroupItem = { channelType: string; accounts: { accountId: string; name?: string; agentId?: string; lastError?: string }[] };
export type SubagentTaskSummary = { id: string; status: string; title?: string; agentId?: string; error?: string; progressSummary?: string; terminalSummary?: string };
const rec = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
async function checked<T>(request: Promise<Result<T>>): Promise<T> { const result = await request; if (!result.ok) throw new Error(result.error.message); return result.value; }
function useAgentData(workspace: WorkspaceState | null, connected: boolean) {
  const [agents, setAgents] = useState<AgentSummary[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const revision = useRef(0); const [defaultModelRef, setDefaultModel] = useState<string | null>(null);
  const agentsRef = useRef(agents); agentsRef.current = agents;
  const files = useRef(new Map<string, { content: string; hash: string }>());
  const fetchAgents = useCallback(async () => {
    if (!connected) return;
    const generation = ++revision.current; setLoading(true); setError(null);
    try {
      const result = await checked(window.pincer.management.list('agents'));
      if (generation !== revision.current) return;
      const defaults = rec(result.defaults); const defaultModel = typeof result.defaultModelRef === 'string' ? result.defaultModelRef : typeof rec(defaults.model).primary === 'string' ? String(rec(defaults.model).primary) : null;
      setDefaultModel(defaultModel);
      setAgents((Array.isArray(result.agents) ? result.agents : []).map((row) => { const raw = rec(row), id = String(raw.id || ''); const model = typeof raw.model === 'string' ? raw.model : String(rec(raw.model).primary || raw.modelRef || defaultModel || ''); return {
        id, name: String(raw.name || id), isDefault: raw.isDefault === true || raw.default === true || id === (result.defaultId || result.defaultAgentId || workspace?.agentId),
        modelRef: model, overrideModelRef: typeof raw.overrideModelRef === 'string' ? raw.overrideModelRef : model || null,
        modelDisplay: model ? resolveModelDisplayName(model, undefined, workspace?.models.find((item) => item.id === model)?.name) : '—', inheritedModel: !raw.model && !raw.overrideModelRef,
        workspace: String(raw.workspace || ''), agentDir: String(raw.agentDir || ''), mainSessionKey: String(raw.mainSessionKey || ''), channelTypes: Array.isArray(raw.channelTypes) ? raw.channelTypes.filter((type): type is string => typeof type === 'string') : [],
      }; }));
    } catch (failure) { if (generation === revision.current) setError(String(failure)); } finally { if (generation === revision.current) setLoading(false); }
  }, [connected, workspace?.agentId, workspace?.models]);
  const createAgent = async (name: string, options: { inheritWorkspace: boolean }) => {
    const inherited = agentsRef.current.find((agent) => agent.isDefault)?.workspace;
    if (options.inheritWorkspace && !inherited) throw new Error('Gateway did not provide the default agent workspace.');
    await checked(window.pincer.management.saveAgent(null, { name, ...(options.inheritWorkspace ? { workspace: inherited } : {}) })); await fetchAgents(); await checked(window.pincer.chat.refresh());
  };
  const updateAgent = async (id: string, name: string) => { await checked(window.pincer.management.saveAgent(id, { name })); await fetchAgents(); await checked(window.pincer.chat.refresh()); };
  const updateAgentModel = async (id: string, model: string | null) => {
    const agent = agentsRef.current.find((entry) => entry.id === id); if (!agent) throw new Error('Agent unavailable');
    // Null in the donor means inherit. The Gateway API does not expose a verified
    // clear-override operation, so refuse rather than pretending to reset it.
    if (!model) throw new Error('Resetting a model override is not supported by this Gateway adapter yet.');
    await checked(window.pincer.management.saveAgent(id, { name: agent.name, model })); await fetchAgents(); await checked(window.pincer.chat.refresh());
  };
  const deleteAgent = async (id: string) => { await checked(window.pincer.management.deleteAgent(id)); await fetchAgents(); await checked(window.pincer.chat.refresh()); };
  const provider = useMemo(() => {
    const groups = new Map<string, ProviderView>();
    for (const model of workspace?.models || []) { const key = model.provider || splitModelRef(model.id)?.providerKey; if (!key) continue; const existing = groups.get(key) || { runtimeProviderKey: key, label: key, models: [] }; existing.models.push(model); groups.set(key, existing); }
    return { accounts: [...groups.values()], statuses: {}, vendors: [], defaultAccountId: '', refreshProviderSnapshot: async () => {} };
  }, [workspace?.models]);
  const host = useMemo(() => ({
    channels: { accounts: async (): Promise<{ channels: ChannelGroupItem[] }> => {
      if (!connected) return { channels: [] };
      const result = await checked(window.pincer.management.list('channels'));
      return { channels: Object.entries(rec(result.channelAccounts)).map(([channelType, accounts]) => ({ channelType, accounts: (Array.isArray(accounts) ? accounts : []).map((item) => { const account = rec(item); return { accountId: String(account.accountId || ''), name: typeof account.name === 'string' ? account.name : undefined, agentId: typeof account.agentId === 'string' ? account.agentId : undefined, lastError: typeof account.lastError === 'string' ? account.lastError : undefined }; }) })) };
    } },
    agents: {
      subagents: async (): Promise<{ tasks: SubagentTaskSummary[] }> => { const result = await checked(window.pincer.management.list('subagents')); return { tasks: (Array.isArray(result.tasks) ? result.tasks : []).map(rec).filter((task) => task.runtime === 'subagent' || String(task.kind || '').includes('subagent')).map((task) => ({ id: String(task.id || ''), status: String(task.status || ''), title: String(task.title || task.label || ''), agentId: String(task.agentId || ''), error: typeof task.error === 'string' ? task.error : undefined, progressSummary: typeof task.progressSummary === 'string' ? task.progressSummary : undefined, terminalSummary: typeof task.terminalSummary === 'string' ? task.terminalSummary : undefined })) }; },
      cancelSubagent: async (id: string) => checked(window.pincer.management.cancelSubagent(id)),
      personality: async (id: string) => { const file = await checked(window.pincer.management.agentFile(id, 'SOUL.md')); files.current.set(id, file); return file; },
      updatePersonality: async (id: string, content: string) => { const file = files.current.get(id); if (!file) throw new Error('Load the personality file before saving.'); await checked(window.pincer.management.saveAgentFile(id, 'SOUL.md', content, file.hash)); const refreshed = await checked(window.pincer.management.agentFile(id, 'SOUL.md')); files.current.set(id, refreshed); return refreshed; },
    },
  }), [connected]);
  return { agents: { agents, loading, error, fetchAgents, createAgent, updateAgent, updateAgentModel, deleteAgent, defaultModelRef }, provider, catalog: { models: workspace?.models || [] }, host };
}
const Context = createContext<ReturnType<typeof useAgentData> | null>(null);
export function AgentDataProvider({ workspace, connected, children }: { workspace: WorkspaceState | null; connected: boolean; children: ReactNode }) { const value = useAgentData(workspace, connected); return <Context.Provider value={value}>{children}</Context.Provider>; }
function useData() { const value = useContext(Context); if (!value) throw new Error('Missing agent view provider'); return value; }
export const useAgentHost = () => useData().host;
export const useAgentsStore = () => useData().agents;
export function useProviderStore<T>(select: (state: ReturnType<typeof useAgentData>['provider']) => T) { return select(useData().provider); }
export function useModelCatalogStore<T>(select: (state: ReturnType<typeof useAgentData>['catalog']) => T) { return select(useData().catalog); }
