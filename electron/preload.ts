import { contextBridge, ipcRenderer } from 'electron';
import type { GatewayState, PincerApi } from '../shared/contract';
function subscribe<T>(channel: string, listener: (state: T) => void): () => void {
  const handle = (_event: Electron.IpcRendererEvent, state: T) => listener(state);
  ipcRenderer.on(channel, handle);
  return () => { ipcRenderer.removeListener(channel, handle); };
}

const api: PincerApi = {
  platform: process.platform,
  chat: {
    snapshot: () => ipcRenderer.invoke('pincer:chat:snapshot'),
    refresh: () => ipcRenderer.invoke('pincer:chat:refresh'),
    select: (key) => ipcRenderer.invoke('pincer:chat:select', key),
    create: (agent) => ipcRenderer.invoke('pincer:chat:create', agent),
    send: (message, key) => ipcRenderer.invoke('pincer:chat:send', message, key),
    abort: () => ipcRenderer.invoke('pincer:chat:abort'),
    more: () => ipcRenderer.invoke('pincer:chat:more'),
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
