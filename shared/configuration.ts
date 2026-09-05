export type ProviderAuthProfile = {
  profileId: string;
  type: 'oauth' | 'token' | 'api_key' | 'aws-sdk' | string;
  status?: string;
  displayName?: string;
  email?: string;
  source?: string;
  logoutSupported?: boolean;
  externallyManaged?: boolean;
  expiry?: { at?: number; remainingMs?: number; label?: string };
};
export type ProviderConfig = {
  id: string;
  baseUrl: string;
  api: string;
  models: string[];
  hasKey: boolean;
  authStatus?: string;
  authProfiles?: ProviderAuthProfile[];
};
export type ProviderInput = Omit<ProviderConfig, 'hasKey'> & { apiKey?: string; headers?: Record<string, string> };
export type MemoryConfig = { hash: string; path: string; provider: string; model: string; baseUrl: string; hasKey: boolean };
export type MemoryInput = { provider: string; model: string; baseUrl?: string; apiKey?: string };
export type ConfigurationApi = {
  discoverModels(input: { baseUrl: string; api: string; apiKey?: string }): Promise<import('./contract').Result<string[]>>;
  providers(): Promise<import('./contract').Result<{ hash: string; providers: ProviderConfig[] }>>;
  saveProvider(hash: string, input: ProviderInput): Promise<import('./contract').Result<void>>;
  deleteProvider(hash: string, id: string): Promise<import('./contract').Result<void>>;
  authDetect(agentId?: string): Promise<import('./contract').Result<unknown>>;
  authStart(input: { sessionId: string; authChoice: string; agentId?: string; workspace?: string }): Promise<import('./contract').Result<unknown>>;
  authNext(input: { sessionId: string; answer?: { stepId: string; value?: unknown } }): Promise<import('./contract').Result<unknown>>;
  authCancel(sessionId: string): Promise<import('./contract').Result<unknown>>;
  authLogout(provider: string, profileIds?: string[], agentId?: string): Promise<import('./contract').Result<unknown>>;
  modelsList(agentId?: string): Promise<import('./contract').Result<unknown>>;
  refreshProviderModels(hash: string, id: string): Promise<import('./contract').Result<void>>;
  authStatus(refresh?: boolean, agentId?: string): Promise<import('./contract').Result<unknown>>;
  memory(): Promise<import('./contract').Result<MemoryConfig>>;
  saveMemory(hash: string, input: MemoryInput): Promise<import('./contract').Result<void>>;
};
