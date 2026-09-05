import type { GatewayService } from '../gateway/service';
import { isRecord } from '../gateway/validation';
import { bounded } from './service';
import type { MemoryConfig, ProviderConfig } from '../../shared/configuration';
const rec = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const str = (value: unknown) => typeof value === 'string' ? value : '';
const safeModelId = (value: string, api: string): string => {
  const id = value.trim();
  // Google's REST catalog returns names such as "models/gemini-2.5-pro";
  // OpenClaw expects the model id without the resource prefix.
  return api === 'google-generative-ai' ? id.replace(/^models\//, '') : id;
};
function endpoint(value: unknown): string {
  const raw = bounded(value, 2048); let url: URL;
  try { url = new URL(raw); } catch { throw new Error('INVALID_ENDPOINT'); }
  if (url.username || url.password || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new Error('INVALID_ENDPOINT');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('HTTPS_REQUIRED');
  return raw;
}
export class ConfigurationService {
  constructor(private gateway: Pick<GatewayService, 'operatorRequest'>) {}
  async discoverModels(input: unknown): Promise<string[]> {
    if (!isRecord(input)) throw new Error('INVALID_INPUT');
    const base = endpoint(input.baseUrl).replace(/\/$/, '').replace(/\/models$/, '');
    const api = bounded(input.api, 64);
    const key = input.apiKey ? bounded(input.apiKey, 8192) : '';
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (key) {
      if (api === 'anthropic-messages') { headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01'; }
      else if (api === 'google-generative-ai') headers['x-goog-api-key'] = key;
      else headers.Authorization = `Bearer ${key}`;
    }
    const url = new URL(api === 'ollama' ? `${base.replace(/\/v1$/, '')}/api/tags` : `${base}/models`);
    const ids = new Set<string>();
    const cursors = new Set<string>();
    do {
      let response: Response;
      try { response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
      catch { throw new Error('MODEL_DISCOVERY_UNAVAILABLE'); }
      if (!response.ok) throw new Error(`MODEL_DISCOVERY_HTTP_${response.status}`);
      let value: Record<string, unknown>;
      try { value = rec(await response.json()); } catch { throw new Error('INVALID_MODEL_CATALOG'); }
      const rows = Array.isArray(value.data) ? value.data : Array.isArray(value.models) ? value.models : [];
      for (const row of rows) { const model = rec(row); const id = safeModelId(str(model.id) || str(model.name), api); if (id) ids.add(bounded(id, 256)); }
      const cursor = api === 'google-generative-ai'
        ? str(value.nextPageToken) || str(value.next_page_token)
        : value.has_more === true ? str(value.last_id) : '';
      if (!cursor) break;
      if (cursors.has(cursor)) throw new Error('INVALID_MODEL_CATALOG');
      cursors.add(cursor); url.searchParams.set('after_id', cursor);
      if (api === 'google-generative-ai') {
        url.searchParams.delete('after_id');
        url.searchParams.set('pageToken', cursor);
      }
    } while (true);
    if (!ids.size) throw new Error('EMPTY_MODEL_CATALOG');
    return [...ids];
  }
  private async snapshot() {
    const value = rec(await this.gateway.operatorRequest('config.get', {}));
    if (!str(value.hash) || !isRecord(value.config)) throw new Error('CONFIG_UNAVAILABLE');
    return { hash: str(value.hash), config: value.config };
  }
  private async authStatusSnapshot(refresh = false, agentId?: string): Promise<Record<string, unknown>> {
    try {
      return rec(await this.gateway.operatorRequest('models.authStatus', {
        ...(refresh ? { refresh: true } : {}),
        ...(agentId ? { agentId: bounded(agentId, 128) } : {}),
      }));
    } catch {
      // Older Gateways do not expose auth status. Provider config remains usable.
      return {};
    }
  }
  async authDetect(agentId?: string): Promise<unknown> {
    return this.gateway.operatorRequest('openclaw.setup.detect', agentId ? { agentId: bounded(agentId, 128) } : {});
  }
  async authStart(input: unknown): Promise<unknown> {
    if (!isRecord(input) || !str(input.sessionId) || !str(input.authChoice)) throw new Error('INVALID_INPUT');
    const sessionId = bounded(input.sessionId, 128);
    const authChoice = bounded(input.authChoice, 128);
    return this.gateway.operatorRequest('openclaw.setup.auth.start', {
      sessionId,
      authChoice,
      ...(input.agentId ? { agentId: bounded(input.agentId, 128) } : {}),
      ...(input.workspace ? { workspace: bounded(input.workspace, 4096) } : {}),
    });
  }
  async authNext(input: unknown): Promise<unknown> {
    if (!isRecord(input) || !str(input.sessionId)) throw new Error('INVALID_INPUT');
    const answer = isRecord(input.answer) && str(input.answer.stepId)
      ? { stepId: bounded(input.answer.stepId, 256), ...(Object.hasOwn(input.answer, 'value') ? { value: input.answer.value } : {}) }
      : undefined;
    return this.gateway.operatorRequest('wizard.next', { sessionId: bounded(input.sessionId, 128), ...(answer ? { answer } : {}) });
  }
  async authCancel(sessionId: unknown): Promise<unknown> {
    if (!str(sessionId)) throw new Error('INVALID_INPUT');
    return this.gateway.operatorRequest('wizard.cancel', { sessionId: bounded(sessionId, 128) });
  }
  async authLogout(provider: unknown, profileIds?: unknown, agentId?: unknown): Promise<unknown> {
    if (!str(provider)) throw new Error('INVALID_INPUT');
    const ids = Array.isArray(profileIds) ? profileIds.filter((value): value is string => Boolean(str(value))).map((value) => bounded(value, 256)) : undefined;
    return this.gateway.operatorRequest('models.authLogout', { provider: bounded(provider, 128), ...(ids?.length ? { profileIds: ids } : {}), ...(str(agentId) ? { agentId: bounded(agentId, 128) } : {}) });
  }
  async authStatus(refresh = false, agentId?: string): Promise<unknown> {
    return this.authStatusSnapshot(refresh, agentId);
  }
  async modelsList(agentId?: string): Promise<unknown> {
    return this.gateway.operatorRequest('models.list', agentId ? { agentId } : {});
  }
  async refreshProviderModels(hash: unknown, providerId: unknown): Promise<void> {
    const id = bounded(providerId, 128);
    const { hash: current, config } = await this.snapshot();
    if (current !== bounded(hash, 256)) throw new Error('CONFIG_CONFLICT');
    const previous = rec(rec(rec(config.models).providers)[id]);
    const baseUrl = str(previous.baseUrl);
    const api = str(previous.api);
    const key = str(previous.apiKey);
    let ids: string[] = [];
    if (baseUrl && api) {
      try { ids = await this.discoverModels({ baseUrl, api, ...(key ? { apiKey: key } : {}) }); } catch { /* OAuth/native providers use models.list below. */ }
    }
    if (!ids.length) {
      const catalog = rec(await this.gateway.operatorRequest('models.list', {}));
      const rows = Array.isArray(catalog.models) ? catalog.models : Array.isArray(catalog.data) ? catalog.data : [];
      ids = rows.map((row) => {
        const value = rec(row);
        const rowProvider = str(value.provider);
        const keyValue = str(value.key);
        const model = str(value.id) || (keyValue.includes('/') ? keyValue.slice(keyValue.indexOf('/') + 1) : keyValue);
        return (!rowProvider || rowProvider === id || keyValue.startsWith(`${id}/`)) ? model : '';
      }).filter(Boolean);
    }
    ids = [...new Set(ids)];
    if (!ids.length) throw new Error('EMPTY_MODEL_CATALOG');
    const existing = Array.isArray(previous.models) ? previous.models.map(rec) : [];
    const models = ids.map((model) => existing.find((entry) => entry.id === model) || { id: model, name: model });
    await this.patch(current, { models: { providers: { [id]: { ...previous, models } } } }, [`models.providers.${id}.models`]);
  }
  async providers(): Promise<{ hash: string; providers: ProviderConfig[] }> {
    const { hash, config } = await this.snapshot();
    const configured = new Map<string, ProviderConfig>(Object.entries(rec(rec(config.models).providers)).map(([id, entry]) => {
      const provider = rec(entry);
      return [id, { id, baseUrl: str(provider.baseUrl), api: str(provider.api), hasKey: Boolean(provider.apiKey), models: (Array.isArray(provider.models) ? provider.models : []).map((model) => str(rec(model).id)).filter(Boolean) }] as [string, ProviderConfig];
    }));
    const auth = await this.authStatusSnapshot(false);
    const authRows = Array.isArray(auth.providers) ? auth.providers.map(rec) : [];
    for (const row of authRows) {
      const id = str(row.provider) || str(row.authProvider);
      if (!id) continue;
      const profiles = Array.isArray(row.profiles) ? row.profiles.map((profile) => {
        const value = rec(profile);
        const expiry = rec(value.expiry);
        return {
          profileId: str(value.profileId),
          type: str(value.type),
          ...(str(value.status) ? { status: str(value.status) } : {}),
          ...(str(value.displayName) ? { displayName: str(value.displayName) } : {}),
          ...(str(value.email) ? { email: str(value.email) } : {}),
          ...(str(value.source) ? { source: str(value.source) } : {}),
          ...(value.logoutSupported === true ? { logoutSupported: true } : {}),
          ...(value.externallyManaged === true ? { externallyManaged: true } : {}),
          ...(Object.keys(expiry).length ? { expiry: { ...(typeof expiry.at === 'number' ? { at: expiry.at } : {}), ...(typeof expiry.remainingMs === 'number' ? { remainingMs: expiry.remainingMs } : {}), ...(str(expiry.label) ? { label: str(expiry.label) } : {}) } } : {}),
        };
      }).filter((profile) => profile.profileId) : [];
      const current = configured.get(id) || { id, baseUrl: '', api: '', hasKey: false, models: [] };
      configured.set(id, {
        ...current,
        hasKey: current.hasKey || profiles.length > 0 || Boolean(str(row.status) && !['missing', 'expired'].includes(str(row.status))),
        ...(str(row.status) ? { authStatus: str(row.status) } : {}),
        ...(profiles.length ? { authProfiles: profiles } : {}),
      });
    }
    return { hash, providers: [...configured.values()] };
  }
  private async patch(hash: string, value: unknown, replacePaths?: string[]): Promise<Record<string, unknown>> {
    try {
      const result = rec(await this.gateway.operatorRequest('config.patch', { baseHash: hash, raw: JSON.stringify(value), ...(replacePaths ? { replacePaths } : {}) }));
      if (result.ok === false) throw new Error('CONFIG_UPDATE_FAILED');
      return result;
    } catch { throw new Error('CONFIG_UPDATE_FAILED'); } // A validation error may echo a newly entered key.
  }
  async saveProvider(hash: unknown, input: unknown): Promise<void> {
    if (!isRecord(input) || Object.keys(input).some((key) => !['id', 'baseUrl', 'api', 'models', 'apiKey', 'headers'].includes(key))) throw new Error('INVALID_INPUT');
    const id = bounded(input.id, 128);
    if (!/^[a-z][a-z0-9_-]*$/.test(id) || ['constructor', 'prototype', '__proto__'].includes(id)) throw new Error('INVALID_PROVIDER');
    const api = bounded(input.api, 64).trim();
    // OpenClaw accepts provider protocols added independently of Pincer's UI.
    // Validate the shape, but do not reject a newly introduced protocol here.
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(api)) throw new Error('INVALID_API');
    if (!Array.isArray(input.models) || !input.models.length) throw new Error('INVALID_MODELS');
    const ids = [...new Set(input.models.map((model) => bounded(model, 256)))];
    const { hash: current, config } = await this.snapshot(); if (current !== bounded(hash, 256)) throw new Error('CONFIG_CONFLICT');
    const previous = rec(rec(rec(config.models).providers)[id]);
    const existing = Array.isArray(previous.models) ? previous.models.map(rec) : [];
    const models = ids.map((model) => existing.find((entry) => entry.id === model) || { id: model, name: model });
    const baseUrl = endpoint(input.baseUrl).replace(/\/$/, '').replace(/\/models$/, '');
    if (previous.apiKey && str(previous.baseUrl) !== baseUrl && !input.apiKey) throw new Error('NEW_DESTINATION_REQUIRES_NEW_KEY');
    const headers = isRecord(input.headers)
      ? Object.fromEntries(Object.entries(input.headers).map(([key, value]) => [bounded(key, 128), bounded(value, 2048)]).filter(([key, value]) => Boolean(key) && Boolean(value)))
      : undefined;
    const provider = { baseUrl, api, models, ...(headers && Object.keys(headers).length ? { headers } : {}), ...(input.apiKey ? { apiKey: bounded(input.apiKey, 8192) } : {}) };
    await this.patch(current, { models: { providers: { [id]: provider } } }, [`models.providers.${id}.models`]);
  }
  async deleteProvider(hash: unknown, providerId: unknown): Promise<void> {
    const id = bounded(providerId, 128);
    const { hash: current, config } = await this.snapshot();
    if (current !== bounded(hash, 256)) throw new Error('CONFIG_CONFLICT');
    const providers = rec(rec(config.models).providers);
    if (!Object.hasOwn(providers, id)) throw new Error('PROVIDER_NOT_FOUND');
    // config.patch follows RFC 7396 for objects: null removes the named key.
    // replacePaths only controls arrays, so sending a shorter providers object
    // merely merges it and is reported by the Gateway as a successful noop.
    const result = await this.patch(current, { models: { providers: { [id]: null } } });
    const returnedConfig = rec(result.config);
    if (Object.keys(returnedConfig).length && Object.hasOwn(rec(rec(returnedConfig.models).providers), id)) {
      throw new Error('CONFIG_UPDATE_FAILED');
    }
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
