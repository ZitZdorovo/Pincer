import type { GatewayService } from '../gateway/service';
import { isRecord } from '../gateway/validation';
import { bounded } from './service';
import type { MemoryConfig, ProviderConfig } from '../../shared/configuration';
const rec = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const str = (value: unknown) => typeof value === 'string' ? value : '';
function endpoint(value: unknown): string {
  const raw = bounded(value, 2048); let url: URL;
  try { url = new URL(raw); } catch { throw new Error('INVALID_ENDPOINT'); }
  if (url.username || url.password || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new Error('INVALID_ENDPOINT');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('HTTPS_REQUIRED');
  return raw;
}
export class ConfigurationService {
  constructor(private gateway: Pick<GatewayService, 'operatorRequest'>) {}
  private async snapshot() {
    const value = rec(await this.gateway.operatorRequest('config.get', {}));
    if (!str(value.hash) || !isRecord(value.config)) throw new Error('CONFIG_UNAVAILABLE');
    return { hash: str(value.hash), config: value.config };
  }
  async providers(): Promise<{ hash: string; providers: ProviderConfig[] }> {
    const { hash, config } = await this.snapshot();
    return { hash, providers: Object.entries(rec(rec(config.models).providers)).map(([id, entry]) => {
      const provider = rec(entry); return { id, baseUrl: str(provider.baseUrl), api: str(provider.api), hasKey: Boolean(provider.apiKey), models: (Array.isArray(provider.models) ? provider.models : []).map((model) => str(rec(model).id)).filter(Boolean) };
    }) };
  }
  private async patch(hash: string, value: unknown, replacePaths?: string[]): Promise<void> {
    try {
      const result = rec(await this.gateway.operatorRequest('config.patch', { baseHash: hash, raw: JSON.stringify(value), ...(replacePaths ? { replacePaths } : {}) }));
      if (result.ok === false) throw new Error('CONFIG_UPDATE_FAILED');
    } catch { throw new Error('CONFIG_UPDATE_FAILED'); } // A validation error may echo a newly entered key.
  }
  async saveProvider(hash: unknown, input: unknown): Promise<void> {
    if (!isRecord(input) || Object.keys(input).some((key) => !['id', 'baseUrl', 'api', 'models', 'apiKey'].includes(key))) throw new Error('INVALID_INPUT');
    const id = bounded(input.id, 128);
    if (!/^[a-z][a-z0-9_-]*$/.test(id) || ['constructor', 'prototype', '__proto__'].includes(id)) throw new Error('INVALID_PROVIDER');
    const api = bounded(input.api, 64);
    if (!['openai-completions', 'openai-responses', 'anthropic-messages', 'ollama'].includes(api)) throw new Error('INVALID_API');
    if (!Array.isArray(input.models) || !input.models.length || input.models.length > 200) throw new Error('INVALID_MODELS');
    const ids = [...new Set(input.models.map((model) => bounded(model, 256)))];
    const { hash: current, config } = await this.snapshot(); if (current !== bounded(hash, 256)) throw new Error('CONFIG_CONFLICT');
    const previous = rec(rec(rec(config.models).providers)[id]);
    const existing = Array.isArray(previous.models) ? previous.models.map(rec) : [];
    const models = ids.map((model) => existing.find((entry) => entry.id === model) || { id: model, name: model });
    const baseUrl = endpoint(input.baseUrl);
    if (previous.apiKey && str(previous.baseUrl) !== baseUrl && !input.apiKey) throw new Error('NEW_DESTINATION_REQUIRES_NEW_KEY');
    const provider = { baseUrl, api, models, ...(input.apiKey ? { apiKey: bounded(input.apiKey, 8192) } : {}) };
    await this.patch(current, { models: { providers: { [id]: provider } } }, [`models.providers.${id}.models`]);
  }
  async deleteProvider(hash: unknown, providerId: unknown): Promise<void> {
    const id = bounded(providerId, 128);
    const { hash: current, config } = await this.snapshot();
    if (current !== bounded(hash, 256)) throw new Error('CONFIG_CONFLICT');
    const providers = { ...rec(rec(config.models).providers) };
    if (!Object.hasOwn(providers, id)) throw new Error('PROVIDER_NOT_FOUND');
    delete providers[id];
    // Replace the providers map as a whole so deletion works on Gateways whose
    // merge patch intentionally ignores null values.
    await this.patch(current, { models: { providers } }, ['models.providers']);
  }
  private async memoryPath(): Promise<'memory.search' | 'agents.defaults.memorySearch'> {
    for (const path of ['memory.search', 'agents.defaults.memorySearch'] as const) {
      try { const value = rec(await this.gateway.operatorRequest('config.schema.lookup', { path })); if (value.path === path && value.schema && Array.isArray(value.children)) return path; } catch { /* Explicit legacy schema fallback, not a guessed write. */ }
    }
    throw new Error('MEMORY_CONFIG_UNAVAILABLE');
  }
  async memory(): Promise<MemoryConfig> {
    const path = await this.memoryPath(); const { hash, config } = await this.snapshot();
    const memory = path === 'memory.search' ? rec(rec(config.memory).search) : rec(rec(rec(config.agents).defaults).memorySearch); const remote = rec(memory.remote);
    return { hash, path, provider: str(memory.provider), model: str(memory.model), baseUrl: str(remote.baseUrl), hasKey: Boolean(remote.apiKey) };
  }
  async saveMemory(hash: unknown, input: unknown): Promise<void> {
    if (!isRecord(input) || Object.keys(input).some((key) => !['provider', 'model', 'baseUrl', 'apiKey'].includes(key))) throw new Error('INVALID_INPUT');
    const provider = bounded(input.provider, 128); const model = bounded(input.model, 256, true);
    if (!/^[a-z][a-z0-9_-]*$/.test(provider)) throw new Error('INVALID_PROVIDER');
    const path = await this.memoryPath(); const { hash: current, config } = await this.snapshot();
    if (current !== bounded(hash, 256)) throw new Error('CONFIG_CONFLICT');
    const previous = path === 'memory.search' ? rec(rec(config.memory).search) : rec(rec(rec(config.agents).defaults).memorySearch);
    const previousRemote = rec(previous.remote);
    if (previousRemote.apiKey && !input.apiKey && (str(previous.provider) !== provider || (input.baseUrl && input.baseUrl !== previousRemote.baseUrl))) throw new Error('NEW_DESTINATION_REQUIRES_NEW_KEY');
    const remote = { ...(input.baseUrl ? { baseUrl: endpoint(input.baseUrl) } : {}), ...(input.apiKey ? { apiKey: bounded(input.apiKey, 8192) } : {}) };
    const memory = { provider, ...(model ? { model } : {}), ...(Object.keys(remote).length ? { remote } : {}) };
    await this.patch(current, path === 'memory.search' ? { memory: { search: memory } } : { agents: { defaults: { memorySearch: memory } } });
  }
}
