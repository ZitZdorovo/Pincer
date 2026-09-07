export type ManagementPage = 'models' | 'agents' | 'channels' | 'skills' | 'cron' | 'subagents';
export type AgentEdit = { name: string; workspace?: string; model?: string; emoji?: string };
export type JobEdit = { name: string; agentId: string; enabled: boolean; schedule: { kind: 'cron'; expr: string; tz?: string } | { kind: 'every'; everyMs: number } | { kind: 'at'; at: string }; message: string };
export type JsonRecord = Record<string, unknown>;
export type PluginAcknowledgement = {
  acknowledgeInstallPolicyWarning?: true;
  acknowledgeCapabilities?: { reviewToken: string };
};
export type PluginInstallInput = (
  { source: 'official'; pluginId: string }
  | { source: 'clawhub'; packageName: string; version?: string }
) & PluginAcknowledgement;
export type ManagementApi = {
  cancelSubagent(id: string): Promise<import('./contract').Result<void>>;
  usage(range: '7d' | '30d' | 'all'): Promise<import('./contract').Result<JsonRecord>>;
  quotas(force?: boolean): Promise<import('./contract').Result<import('./quotas').QuotaSnapshot>>;
  quotaSource(): Promise<import('./contract').Result<import('./quotas').QuotaSource>>;
  saveQuotaSource(input: import('./quotas').QuotaSourceInput): Promise<import('./contract').Result<import('./quotas').QuotaSource>>;
  list(page: ManagementPage, agentId?: string): Promise<import('./contract').Result<JsonRecord>>;
  saveAgent(agentId: string | null, input: AgentEdit): Promise<import('./contract').Result<void>>;
  deleteAgent(agentId: string): Promise<import('./contract').Result<void>>;
  agentFile(agentId: string, name: string): Promise<import('./contract').Result<{ content: string; hash: string }>>;
  saveAgentFile(agentId: string, name: string, content: string, hash: string): Promise<import('./contract').Result<void>>;
  setSkill(skillKey: string, enabled: boolean): Promise<import('./contract').Result<void>>;
  searchSkills(query: string): Promise<import('./contract').Result<JsonRecord>>;
  installSkill(slug: string, agentId: string): Promise<import('./contract').Result<void>>;
  channelAction(channel: string, accountId: string, action: 'start' | 'stop' | 'logout'): Promise<import('./contract').Result<void>>;
  bindChannelAgent(channel: string, accountId: string, agentId: string): Promise<import('./contract').Result<void>>;
  channelQrStart(accountId: string): Promise<import('./contract').Result<JsonRecord>>;
  channelQrWait(accountId: string, currentQrDataUrl: string): Promise<import('./contract').Result<JsonRecord>>;
  saveChannel(channel: string, accountId: string, values: Record<string, string>): Promise<import('./contract').Result<void>>;
  deleteChannel(channel: string, accountId?: string): Promise<import('./contract').Result<void>>;
  integrations(): Promise<import('./contract').Result<JsonRecord>>;
  searchPlugins(query: string): Promise<import('./contract').Result<JsonRecord>>;
  inspectPlugin(pluginId: string): Promise<import('./contract').Result<JsonRecord>>;
  refreshPlugins(): Promise<import('./contract').Result<JsonRecord>>;
  installIntegration(input: PluginInstallInput): Promise<import('./contract').Result<JsonRecord>>;
  setIntegrationEnabled(pluginId: string, enabled: boolean, reviewToken?: string): Promise<import('./contract').Result<JsonRecord>>;
  uninstallPlugin(pluginId: string): Promise<import('./contract').Result<JsonRecord>>;
  saveJob(id: string | null, input: JobEdit): Promise<import('./contract').Result<void>>;
  toggleJob(id: string, enabled: boolean): Promise<import('./contract').Result<void>>;
  deleteJob(id: string): Promise<import('./contract').Result<void>>;
  runJob(id: string): Promise<import('./contract').Result<void>>;
  jobRuns(id: string): Promise<import('./contract').Result<JsonRecord>>;
  probeModel(provider: string, agentId: string): Promise<import('./contract').Result<JsonRecord>>;
};
