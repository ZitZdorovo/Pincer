import type { Result } from './contract';

export type SecretStoreEntry = {
  name: string;
  kind: 'secret' | 'env';
  createdAtMs: number;
  updatedAtMs: number;
  updatedBy?: string;
  allowedHosts: string[];
};

export type SecretStoreInput = { name: string; value: string; kind: 'secret' | 'env'; allowedHosts?: string[] };

export type SecretsApi = {
  list(): Promise<Result<{ entries: SecretStoreEntry[] }>>;
  set(input: SecretStoreInput): Promise<Result<{ reloaded: boolean; warningCount: number }>>;
  setMany(input: SecretStoreInput[]): Promise<Result<{ reloaded: boolean; warningCount: number }>>;
  delete(name: string): Promise<Result<{ reloaded: boolean; warningCount: number }>>;
};
