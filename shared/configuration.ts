export type ProviderConfig = { id: string; baseUrl: string; api: string; models: string[]; hasKey: boolean };
export type ProviderInput = Omit<ProviderConfig, 'hasKey'> & { apiKey?: string };
export type MemoryConfig = { hash: string; path: string; provider: string; model: string; baseUrl: string; hasKey: boolean };
export type MemoryInput = { provider: string; model: string; baseUrl?: string; apiKey?: string };
export type ConfigurationApi = {
  providers(): Promise<import('./contract').Result<{ hash: string; providers: ProviderConfig[] }>>;
  saveProvider(hash: string, input: ProviderInput): Promise<import('./contract').Result<void>>;
  deleteProvider(hash: string, id: string): Promise<import('./contract').Result<void>>;
  memory(): Promise<import('./contract').Result<MemoryConfig>>;
  saveMemory(hash: string, input: MemoryInput): Promise<import('./contract').Result<void>>;
};
