import type { GatewayService } from '../gateway/service';
import { isRecord } from '../gateway/validation';
import { bounded } from './service';
import type { MemoryConfig, ProviderConfig } from '../../shared/configuration';
import type { ProviderCredentials } from './provider-credentials';
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
  constructor(private gateway: Pick<GatewayService, 'operatorRequest'>, private credentials?: ProviderCredentials) {}
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
    return { hash: str(value.hash), config: value.config, sourceConfig: rec(value.sourceConfig) };
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
  async refreshProviderModels(hash: unknown, providerId: unknown, apiKey?: unknown): Promise<void> {
    const id = bounded(providerId, 128);
    const { hash: current, config } = await this.snapshot();
    if (current !== bounded(hash, 256)) throw new Error('CONFIG_CONFLICT');
    const previous = rec(rec(rec(config.models).providers)[id]);
    const baseUrl = str(previous.baseUrl);
    const api = str(previous.api);
    const enteredKey = apiKey ? bounded(apiKey, 8192).trim() : '';
    const key = enteredKey || this.credentials?.get(id, baseUrl) || str(previous.apiKey);
    let ids: string[] = [];
    if (baseUrl && api && key !== '__OPENCLAW_REDACTED__' && (key || !previous.apiKey)) {
      ids = await this.discoverModels({ baseUrl, api, ...(key ? { apiKey: key } : {}) });
    }
    if (!ids.length) {
      const catalog = rec(await this.gateway.operatorRequest('models.list', { view: 'all', refresh: true, includeProviderCapabilities: true }));
      const outcome = (Array.isArray(catalog.providerOutcomes) ? catalog.providerOutcomes : []).map(rec).find((row) => row.provider === id && row.status !== 'ready');
      if (outcome) throw new Error(outcome.status === 'auth-rejected' ? 'MODEL_DISCOVERY_HTTP_401' : 'MODEL_DISCOVERY_UNAVAILABLE');
      if (baseUrl && previous.apiKey && (!key || key === '__OPENCLAW_REDACTED__') && !(Array.isArray(catalog.providerOutcomes) && catalog.providerOutcomes.some((row) => rec(row).provider === id && rec(row).status === 'ready'))) throw new Error('MODEL_DISCOVERY_KEY_REQUIRED');
      const rows = Array.isArray(catalog.models) ? catalog.models : Array.isArray(catalog.data) ? catalog.data : [];
      ids = rows.map((row) => {
        const value = rec(row);
        const rowProvider = str(value.provider);
        const keyValue = str(value.key);
        const model = str(value.id) || (keyValue.includes('/') ? keyValue.slice(keyValue.indexOf('/') + 1) : keyValue);
        return (rowProvider === id || (!rowProvider && keyValue.startsWith(`${id}/`))) ? (model.startsWith(`${id}/`) ? model.slice(id.length + 1) : model) : '';
      }).filter(Boolean);
    }
    ids = [...new Set(ids)];
    if (!ids.length) throw new Error('EMPTY_MODEL_CATALOG');
    const existing = Array.isArray(previous.models) ? previous.models.map(rec) : [];
    const models = ids.map((model) => existing.find((entry) => entry.id === model) || { id: model, name: model });
    await this.patch(current, { models: { providers: { [id]: { models } } } }, [`models.providers.${id}.models`]);
    if (enteredKey) this.credentials?.set(id, baseUrl, enteredKey);
  }
  async providers(): Promise<{ hash: string; providers: ProviderConfig[] }> {
    const { hash, config, sourceConfig } = await this.snapshot();
    const sourceProviders = rec(rec(sourceConfig.models).providers);
    const configuredProviderIds = new Set(Object.keys(rec(rec(config.models).providers)));
    const hasSourceConfig = Object.keys(sourceConfig).length > 0;
    const configured = new Map<string, ProviderConfig>(Object.entries(rec(rec(config.models).providers)).filter(([id, entry]) => {
      // OpenClaw adds built-in provider catalogs to the resolved runtime
      // config. They are not saved accounts and must disappear from Pincer
      // when their auth profile is logged out.
      const provider = rec(entry);
      return !hasSourceConfig || Object.hasOwn(sourceProviders, id) || Boolean(provider.apiKey);
    }).map(([id, entry]) => {
      const provider = rec(entry);
      return [id, { id, baseUrl: str(provider.baseUrl), api: str(provider.api), hasKey: Boolean(provider.apiKey), models: (Array.isArray(provider.models) ? provider.models : []).map((model) => str(rec(model).id)).filter(Boolean) }] as [string, ProviderConfig];
    }));
    const auth = await this.authStatusSnapshot(true);
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
      const status = str(row.status);
      // A missing/expired auth row is not an account. If the provider is only
      // an OpenClaw runtime overlay (and has no saved config or profiles), do
      // not recreate it in the client after logout.
      if (!profiles.length && !row.apiKey && ['missing', 'expired'].includes(status) && !configured.has(id)) continue;
      const current = configured.get(id) || { id, baseUrl: '', api: '', hasKey: false, models: [] };
      configured.set(id, {
        ...current,
        hasKey: current.hasKey || Boolean(row.apiKey) || profiles.length > 0 || Boolean(str(row.status) && !['missing', 'expired'].includes(str(row.status))),
        ...(status ? { authStatus: status } : {}),
        ...(profiles.length ? { authProfiles: profiles } : {}),
      });
    }
    // OAuth and token providers are often absent from models.providers. Their
    // catalog is exposed by models.list instead, so merge those model ids into
    // the same provider rows that the client renders. This also makes a fresh
    // OAuth login visible without restarting Pincer.
    try {
      const catalog = rec(await this.gateway.operatorRequest('models.list', {}));
      const rows = Array.isArray(catalog.models) ? catalog.models : Array.isArray(catalog.data) ? catalog.data : [];
      for (const row of rows) {
        const value = rec(row);
        const key = str(value.key);
        const providerId = str(value.provider) || (key.includes('/') ? key.slice(0, key.indexOf('/')) : '');
        const modelId = str(value.id) || (key.includes('/') ? key.slice(key.indexOf('/') + 1) : key);
        if (!providerId || !modelId) continue;
        const provider = configured.get(providerId);
        // Configured providers already have an authoritative replacement list.
        // Only auth-only providers need their ids supplied by models.list;
        // mixing runtime rows back into config resurrects deleted models.
        if (provider && !configuredProviderIds.has(providerId) && !provider.models.includes(modelId)) provider.models.push(modelId);
      }
    } catch { /* Auth/config rows remain usable when the catalog is unavailable. */ }
    return { hash, providers: [...configured.values()] };
  }
  private async patch(hash: string, value: unknown, replacePaths?: string[]): Promise<Record<string, unknown>> {
    try {
      const result = rec(await this.gateway.operatorRequest('config.patch', { baseHash: hash, raw: JSON.stringify(value), ...(replacePaths?.length ? { replacePaths } : {}) }));
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
    if (input.apiKey) this.credentials?.set(id, baseUrl, bounded(input.apiKey, 8192));
  }
  private modelReferenceCleanup(config: Record<string, unknown>, providerId: string, modelId?: string): { patch: Record<string, unknown>; replacePaths: string[] } {
    const matches = (value: unknown) => {
      if (typeof value !== 'string') return false;
      const normalized = value.trim();
      if (!normalized) return false;
      if (modelId) return normalized === modelId || normalized === `${providerId}/${modelId}`;
      return normalized === providerId || normalized.startsWith(`${providerId}/`);
    };
    const cleanSetting = (value: unknown): { changed: boolean; value: unknown } => {
      if (typeof value === 'string') return matches(value) ? { changed: true, value: null } : { changed: false, value };
      if (!isRecord(value)) return { changed: false, value };
      let changed = false;
      const next: Record<string, unknown> = { ...value };
      if (matches(value.primary)) { next.primary = null; changed = true; }
      if (Array.isArray(value.fallbacks)) {
        const fallbacks = value.fallbacks.filter((entry) => !matches(entry));
        if (fallbacks.length !== value.fallbacks.length) { next.fallbacks = fallbacks; changed = true; }
      }
      return { changed, value: next };
    };
    const agents = rec(config.agents);
    const defaults = rec(agents.defaults);
    const patchAgents: Record<string, unknown> = {};
    const replacePaths: string[] = [];
    const cleanModelMap = (value: unknown): { changed: boolean; patch: Record<string, unknown> } => {
      const models = rec(value);
      const patch: Record<string, unknown> = {};
      for (const key of Object.keys(models)) if (matches(key)) patch[key] = null;
      return { changed: Object.keys(patch).length > 0, patch };
    };
    const defaultsPatch: Record<string, unknown> = {};
    const defaultsModel = cleanSetting(defaults.model);
    if (defaultsModel.changed) {
      defaultsPatch.model = defaultsModel.value;
      if (JSON.stringify(rec(defaults.model).fallbacks) !== JSON.stringify(rec(defaultsModel.value).fallbacks)) replacePaths.push('agents.defaults.model.fallbacks');
    }
    const defaultsModels = cleanModelMap(defaults.models);
    if (defaultsModels.changed) defaultsPatch.models = defaultsModels.patch;
    if (Object.keys(defaultsPatch).length) patchAgents.defaults = defaultsPatch;
    if (Array.isArray(agents.list)) {
      let listChanged = false;
      const list = agents.list.map((entry) => {
        if (!isRecord(entry)) return entry;
        const cleaned = cleanSetting(entry.model);
        const cleanedModels = cleanModelMap(entry.models);
        if (!cleaned.changed && !cleanedModels.changed) return entry;
        listChanged = true;
        const next = { ...entry };
        // agents.list is replaced wholesale: null here is a literal invalid
        // value, unlike a tombstone in the surrounding object merge patch.
        if (cleaned.changed) {
          if (cleaned.value === null) delete next.model;
          else next.model = Object.fromEntries(Object.entries(rec(cleaned.value)).filter(([, value]) => value !== null));
        }
        if (cleanedModels.changed) next.models = Object.fromEntries(Object.entries(rec(entry.models)).filter(([key]) => !matches(key)));
        return next;
      });
      if (listChanged) { patchAgents.list = list; replacePaths.push('agents.list'); }
    }
    const configuredEntries = rec(agents.entries);
    const entriesPatch: Record<string, unknown> = {};
    for (const [entryId, rawEntry] of Object.entries(configuredEntries)) {
      if (!isRecord(rawEntry)) continue;
      const cleaned = cleanSetting(rawEntry.model);
      const cleanedModels = cleanModelMap(rawEntry.models);
      if (!cleaned.changed && !cleanedModels.changed) continue;
      entriesPatch[entryId] = {
        ...(cleaned.changed ? { model: cleaned.value } : {}),
        ...(cleanedModels.changed ? { models: { ...rec(rawEntry.models), ...cleanedModels.patch } } : {}),
      };
    }
    if (Object.keys(entriesPatch).length) patchAgents.entries = entriesPatch;
    return { patch: Object.keys(patchAgents).length ? { agents: patchAgents } : {}, replacePaths };
  }
  async deleteProvider(hash: unknown, providerId: unknown): Promise<void> {
    const id = bounded(providerId, 128);
    const { hash: current, config, sourceConfig } = await this.snapshot();
    if (current !== bounded(hash, 256)) throw new Error('CONFIG_CONFLICT');
    const providers = rec(rec(config.models).providers);
    // config.patch follows RFC 7396 for objects: null removes the named key.
    // Also remove references from defaults and per-agent model settings so a
    // deleted provider cannot keep reappearing in the model picker.
    const cleanup = this.modelReferenceCleanup(config, id);
    // Deletion is intentionally idempotent. A previous OAuth logout or a
    // concurrent Gateway refresh may already have removed the provider while
    // the UI still has its old presentation snapshot.
    const sourceProviders = rec(rec(sourceConfig.models).providers);
    const runtimeOnly = Object.keys(sourceConfig).length > 0
      && !Object.hasOwn(sourceProviders, id)
      && !rec(providers[id]).apiKey;
    if ((!Object.hasOwn(providers, id) || runtimeOnly) && !Object.keys(cleanup.patch).length) return;
    const patchValue = runtimeOnly
      ? cleanup.patch
      : { models: { providers: { [id]: null } }, ...cleanup.patch };
    // Gateway protects arrays even when their containing provider is deleted.
    const arrays = (value: unknown, path: string): string[] => Array.isArray(value)
      ? [path]
      : Object.entries(rec(value)).flatMap(([key, child]) => arrays(child, `${path}.${key}`));
    const result = await this.patch(current, patchValue, [...cleanup.replacePaths, ...(!runtimeOnly ? arrays(providers[id], `models.providers.${id}`) : [])]);
    const returnedConfig = rec(result.config);
    if (!runtimeOnly && Object.keys(returnedConfig).length && Object.hasOwn(rec(rec(returnedConfig.models).providers), id)) {
      throw new Error('CONFIG_UPDATE_FAILED');
    }
    this.credentials?.set(id, str(rec(providers[id]).baseUrl), '');
  }
  async deleteProviderModel(hash: unknown, providerId: unknown, modelId: unknown): Promise<void> {
    const id = bounded(providerId, 128);
    const model = bounded(modelId, 256, true);
    if (!model) throw new Error('INVALID_MODEL');
    const { hash: current, config } = await this.snapshot();
    if (current !== bounded(hash, 256)) throw new Error('CONFIG_CONFLICT');
    const providers = rec(rec(config.models).providers);
    const previous = rec(providers[id]);
    // A repeated click after a successful deletion is harmless.
    if (!Object.hasOwn(providers, id)) return;
    const models = Array.isArray(previous.models) ? previous.models.filter((entry) => str(rec(entry).id) !== model) : [];
    const cleanup = this.modelReferenceCleanup(config, id, model);
    await this.patch(current, { models: { providers: { [id]: { models } } }, ...cleanup.patch }, [`models.providers.${id}.models`, ...cleanup.replacePaths]);
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
