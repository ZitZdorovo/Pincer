import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { WorkspaceState, Result } from '../../shared/contract';
import type { CronJob, CronJobCreateInput } from './cron-types';
import type { QuickAccessSkill } from './composer-controller';
export type ChannelTargetOption = { value: string; label: string; kind: 'user' | 'group' | 'channel' };
export type DeliveryChannelAccount = { accountId: string; name: string; isDefault: boolean };
export type DeliveryChannelGroup = { channelType: string; defaultAccountId: string; accounts: DeliveryChannelAccount[] };
const rec = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
async function checked<T>(request: Promise<Result<T>>) { const result = await request; if (!result.ok) throw new Error(result.error.message); return result.value; }
const date = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : typeof value === 'string' ? value : '';
export function formatRelativeTime(value: string | Date): string { const timestamp = new Date(value).getTime(); if (!Number.isFinite(timestamp)) return '—'; const minutes = Math.round((timestamp - Date.now()) / 60000); const unit = Math.abs(minutes) < 60 ? 'minute' : Math.abs(minutes) < 1440 ? 'hour' : 'day'; return new Intl.RelativeTimeFormat(document.documentElement.lang, { numeric: 'auto' }).format(Math.round(minutes / (unit === 'minute' ? 1 : unit === 'hour' ? 60 : 1440)), unit); }
export async function fetchQuickAccessSkills({ agentId }: { agentId: string }): Promise<{ success: boolean; skills: QuickAccessSkill[]; error?: string }> {
  const data = await checked(window.pincer.management.list('skills', agentId));
  return { success: true, skills: (Array.isArray(data.skills) ? data.skills : []).map(rec).filter((row) => row.disabled !== true && row.eligible !== false).map((row) => ({ name: String(row.name || row.skillKey || ''), description: String(row.description || ''), source: String(row.source || ''), sourceLabel: String(row.source || 'Gateway') })) };
}
function useData(workspace: WorkspaceState | null, connected: boolean) {
  const [jobs, setJobs] = useState<CronJob[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const rawJobs = useRef(new Map<string, Record<string, unknown>>()); const generation = useRef(0);
  const fetchJobs = useCallback(async () => {
    if (!connected) return; const epoch = ++generation.current; setLoading(true); setError('');
    try { const data = await checked(window.pincer.management.list('cron')); if (epoch !== generation.current) return;
      const rows = (Array.isArray(data.jobs) ? data.jobs : []).map(rec); rawJobs.current = new Map(rows.map((row) => [String(row.id), row]));
      setJobs(rows.map((row): CronJob => { const state = rec(row.state), payload = rec(row.payload), delivery = rec(row.delivery); return {
        id: String(row.id || ''), name: String(row.name || ''), message: String(payload.message || payload.text || ''), agentId: String(row.agentId || workspace?.agentId || ''),
        schedule: row.schedule as CronJob['schedule'], enabled: row.enabled === true, createdAt: date(row.createdAtMs), updatedAt: date(row.updatedAtMs), nextRun: date(state.nextRunAtMs) || undefined,
        lastRun: state.lastRunAtMs ? { time: date(state.lastRunAtMs), success: (state.lastRunStatus || state.lastStatus) !== 'error', error: typeof state.lastError === 'string' ? state.lastError : undefined } : undefined,
        delivery: { mode: delivery.mode === 'announce' ? 'announce' : 'none', channel: typeof delivery.channel === 'string' ? delivery.channel : undefined, to: typeof delivery.to === 'string' ? delivery.to : undefined, accountId: typeof delivery.accountId === 'string' ? delivery.accountId : undefined },
      }; }));
    } catch (failure) { if (epoch === generation.current) setError(String(failure)); } finally { if (epoch === generation.current) setLoading(false); }
  }, [connected, workspace?.agentId]);
  const save = async (id: string | null, input: CronJobCreateInput) => {
    const previous = id ? rawJobs.current.get(id) : null;
    if (id && (!previous || rec(previous.payload).kind !== 'agentTurn' || (rec(previous.delivery).mode && !['none', 'announce'].includes(String(rec(previous.delivery).mode))))) throw new Error('This job uses settings that Pincer cannot safely edit yet.');
    // Existing advanced delivery fields stay intact. Refuse changes until the
    // narrow Gateway contract can write them rather than silently discarding them.
    const previousDelivery = rec(previous?.delivery);
    const requestedDelivery = input.delivery || { mode: 'none' };
    if (requestedDelivery.mode !== (previousDelivery.mode || 'none') || (requestedDelivery.mode === 'announce' && ['channel','to','accountId'].some((key) => (requestedDelivery[key as keyof typeof requestedDelivery] || '') !== (previousDelivery[key] || '')))) throw new Error('Changing delivery targets is not supported by the current Gateway adapter yet.');
    await checked(window.pincer.management.saveJob(id, { name: input.name, agentId: input.agentId || workspace?.agentId || '', message: input.message, enabled: input.enabled ?? true, schedule: typeof input.schedule === 'string' ? { kind: 'cron', expr: input.schedule } : input.schedule })); await fetchJobs();
  };
  const host = useMemo(() => ({ channels: {
    accounts: async (): Promise<{ success: boolean; channels: DeliveryChannelGroup[]; error?: string }> => {
      if (!connected) return { success: false, channels: [] };
      const data = await checked(window.pincer.management.list('channels'));
      return { success: true, channels: Object.entries(rec(data.channelAccounts)).map(([channelType, accounts]) => ({ channelType, defaultAccountId: 'default', accounts: (Array.isArray(accounts) ? accounts : []).map((item) => { const row = rec(item); const id = String(row.accountId || 'default'); return { accountId: id, name: String(row.name || id), isDefault: id === 'default' }; }) })) };
    },
    targets: async (_input: { channelType: string; accountId?: string }): Promise<{ success: boolean; targets: ChannelTargetOption[]; error?: string }> => ({ success: false, targets: [], error: 'Gateway target discovery is unavailable; no targets were loaded.' }),
  } }), [connected]);
  return { host, agents: { agents: workspace?.agents || [], currentAgentId: workspace?.agentId || '' }, cron: {
    jobs, loading, error, fetchJobs, createJob: (input: CronJobCreateInput) => save(null, input), updateJob: (id: string, input: CronJobCreateInput) => save(id, input),
    toggleJob: async (id: string, enabled: boolean) => { await checked(window.pincer.management.toggleJob(id, enabled)); await fetchJobs(); },
    deleteJob: async (id: string) => { await checked(window.pincer.management.deleteJob(id)); await fetchJobs(); },
    triggerJob: async (id: string) => { await checked(window.pincer.management.runJob(id)); await fetchJobs(); },
  } };
}
const Context = createContext<ReturnType<typeof useData> | null>(null);
export function CronDataProvider({ workspace, connected, children }: { workspace: WorkspaceState | null; connected: boolean; children: ReactNode }) { const value = useData(workspace, connected); return <Context.Provider value={value}>{children}</Context.Provider>; }
function useModel() { const value = useContext(Context); if (!value) throw new Error('Missing Cron view provider'); return value; }
export const useCronStore = () => useModel().cron;
export const useCronHost = () => useModel().host;
export function useAgentsStore<T>(select: (state: ReturnType<typeof useData>['agents']) => T) { return select(useModel().agents); }
