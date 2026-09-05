import { contextBridge, ipcRenderer } from 'electron';
import type { GatewayState, PincerApi } from '../shared/contract';
function subscribe<T>(channel: string, listener: (state: T) => void): () => void {
  const handle = (_event: Electron.IpcRendererEvent, state: T) => listener(state);
  ipcRenderer.on(channel, handle);
  return () => { ipcRenderer.removeListener(channel, handle); };
}

const api: PincerApi = {
  settings: {
    catalog: () => ipcRenderer.invoke('pincer:settings:catalog'),
    section: (root) => ipcRenderer.invoke('pincer:settings:section', root),
    save: (lease, value) => ipcRenderer.invoke('pincer:settings:save', lease, value),
  },
  gatewayAdmin: {
    profile: () => ipcRenderer.invoke('pincer:gateway-admin:profile'),
    setDisplayName: (id, name) => ipcRenderer.invoke('pincer:gateway-admin:profile-name', id, name),
    devices: () => ipcRenderer.invoke('pincer:gateway-admin:devices'),
    deviceAction: (action, id, label) => ipcRenderer.invoke('pincer:gateway-admin:device-action', action, id, label),
    logs: (cursor) => ipcRenderer.invoke('pincer:gateway-admin:logs', cursor),
  },
  approvals: {
    snapshot: () => ipcRenderer.invoke('pincer:approvals:snapshot'),
    refresh: () => ipcRenderer.invoke('pincer:approvals:refresh'),
    resolve: (id, token, decision) => ipcRenderer.invoke('pincer:approvals:resolve', id, token, decision),
    onState: (listener) => subscribe('pincer:approvals:state', listener),
  },
  platform: process.platform,
  configuration: {
    discoverModels: (input) => ipcRenderer.invoke('pincer:configuration:models-discover', input),
    providers: () => ipcRenderer.invoke('pincer:configuration:providers'),
    saveProvider: (hash, input) => ipcRenderer.invoke('pincer:configuration:provider-save', hash, input),
    deleteProvider: (hash, id) => ipcRenderer.invoke('pincer:configuration:provider-delete', hash, id),
    memory: () => ipcRenderer.invoke('pincer:configuration:memory'),
    saveMemory: (hash, input) => ipcRenderer.invoke('pincer:configuration:memory-save', hash, input),
  },
  drafts: { read: (scope) => ipcRenderer.invoke('pincer:drafts:read', scope), write: (scope, key, text) => ipcRenderer.invoke('pincer:drafts:write', scope, key, text) },
  files: {
    list: (key, path, search) => ipcRenderer.invoke('pincer:files:list', key, path, search),
    read: (key, path) => ipcRenderer.invoke('pincer:files:read', key, path),
    save: (key, path, content, hash) => ipcRenderer.invoke('pincer:files:save', key, path, content, hash),
  },
  management: {
    cancelSubagent: (id) => ipcRenderer.invoke('pincer:management:subagent-cancel', id),
    usage: (range) => ipcRenderer.invoke('pincer:management:usage', range),
    quotas: (force) => ipcRenderer.invoke('pincer:management:quotas', force),
    quotaSource: () => ipcRenderer.invoke('pincer:management:quotaSource'),
    saveQuotaSource: (input) => ipcRenderer.invoke('pincer:management:saveQuotaSource', input),
    list: (page, agent) => ipcRenderer.invoke('pincer:management:list', page, agent),
    saveAgent: (id, input) => ipcRenderer.invoke('pincer:management:agent-save', id, input),
    deleteAgent: (id) => ipcRenderer.invoke('pincer:management:agent-delete', id),
    agentFile: (id, name) => ipcRenderer.invoke('pincer:management:agent-file', id, name),
    saveAgentFile: (id, name, content, hash) => ipcRenderer.invoke('pincer:management:agent-file-save', id, name, content, hash),
    setSkill: (key, enabled) => ipcRenderer.invoke('pincer:management:skill-set', key, enabled),
    searchSkills: (query) => ipcRenderer.invoke('pincer:management:skill-search', query),
    installSkill: (slug, agent) => ipcRenderer.invoke('pincer:management:skill-install', slug, agent),
    channelAction: (channel, account, action) => ipcRenderer.invoke('pincer:management:channel-action', channel, account, action),
    saveJob: (id, input) => ipcRenderer.invoke('pincer:management:job-save', id, input),
    toggleJob: (id, enabled) => ipcRenderer.invoke('pincer:management:job-toggle', id, enabled),
    deleteJob: (id) => ipcRenderer.invoke('pincer:management:job-delete', id),
    runJob: (id) => ipcRenderer.invoke('pincer:management:job-run', id),
    jobRuns: (id) => ipcRenderer.invoke('pincer:management:job-runs', id),
    probeModel: (provider, agent) => ipcRenderer.invoke('pincer:management:model-probe', provider, agent),
  },
  desktop: {
    chooseDirectory: () => ipcRenderer.invoke('pincer:desktop:choose-directory'),
    startup: () => ipcRenderer.invoke('pincer:desktop:startup'),
    setStartup: (enabled) => ipcRenderer.invoke('pincer:desktop:set-startup', enabled),
    closeBehavior: () => ipcRenderer.invoke('pincer:desktop:close-behavior'),
    setCloseBehavior: (value) => ipcRenderer.invoke('pincer:desktop:set-close-behavior', value),
  },
  chat: {
    snapshot: () => ipcRenderer.invoke('pincer:chat:snapshot'),
    refresh: () => ipcRenderer.invoke('pincer:chat:refresh'),
    select: (key) => ipcRenderer.invoke('pincer:chat:select', key),
    prepare: (location) => ipcRenderer.invoke('pincer:chat:prepare', location),
    create: (agent, location) => ipcRenderer.invoke('pincer:chat:create', agent, location),
    registerProject: (name, path) => ipcRenderer.invoke('pincer:chat:project-register', name, path),
    removeProject: (id) => ipcRenderer.invoke('pincer:chat:project-remove', id),
    send: (message, key, attachments, target) => ipcRenderer.invoke('pincer:chat:send', message, key, attachments, target),
    setPermission: (mode) => ipcRenderer.invoke('pincer:chat:permission', mode),
    abort: () => ipcRenderer.invoke('pincer:chat:abort'),
    more: () => ipcRenderer.invoke('pincer:chat:more'),
    rename: (key, title) => ipcRenderer.invoke('pincer:chat:rename', key, title),
    pin: (key, pinned) => ipcRenderer.invoke('pincer:chat:pin', key, pinned),
    remove: (key) => ipcRenderer.invoke('pincer:chat:remove', key),
    setModel: (model, thinking) => ipcRenderer.invoke('pincer:chat:model', model, thinking),
    setThinking: (thinking) => ipcRenderer.invoke('pincer:chat:thinking', thinking),
    onState: (listener) => subscribe('pincer:chat:state', listener),
  },
  memory: {
    read: (agent) => ipcRenderer.invoke('pincer:memory:read', agent),
    save: (agent, content, hash) => ipcRenderer.invoke('pincer:memory:save', agent, content, hash),
    status: (agent, probe) => ipcRenderer.invoke('pincer:memory:status', agent, probe),
    search: (agent, query) => ipcRenderer.invoke('pincer:memory:search', agent, query),
  },
  updates: {
    snapshot: () => ipcRenderer.invoke('pincer:updates:snapshot'),
    check: () => ipcRenderer.invoke('pincer:updates:check'),
    install: () => ipcRenderer.invoke('pincer:updates:install'),
    onState: (listener) => subscribe('pincer:updates:state', listener),
  },
  gateway: {
    snapshot: () => ipcRenderer.invoke('pincer:gateway:snapshot'),
    connect: (input) => ipcRenderer.invoke('pincer:gateway:connect', input),
    disconnect: () => ipcRenderer.invoke('pincer:gateway:disconnect'),
    retry: () => ipcRenderer.invoke('pincer:gateway:retry'),
    onState: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, state: GatewayState) => listener(state);
      ipcRenderer.on('pincer:gateway:state', handle);
      return () => { ipcRenderer.removeListener('pincer:gateway:state', handle); };
    },
  },
  window: {
    action: (action) => ipcRenderer.invoke('pincer:window:action', action),
    isMaximized: () => ipcRenderer.invoke('pincer:window:maximized'),
    onMaximized: (listener) => {
      const handle = (_event: Electron.IpcRendererEvent, value: boolean) => listener(value);
      ipcRenderer.on('pincer:window:maximized', handle);
      return () => { ipcRenderer.removeListener('pincer:window:maximized', handle); };
    },
    showMenu: (menu) => ipcRenderer.invoke('pincer:window:menu', menu),
  },
};
contextBridge.exposeInMainWorld('pincer', api);
