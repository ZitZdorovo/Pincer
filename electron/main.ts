import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, session } from 'electron';
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GatewayService } from './gateway/service';
import { Vault } from './gateway/vault';
import { parseConnection } from './gateway/validation';
import type { Result } from '../shared/contract';
import { WorkspaceService } from './workspace/service';
import { RunTiming } from './workspace/run-timing';
import { QuotaService } from './workspace/quotas';
import { ManagementService } from './workspace/management';
import { WorkspaceFilesService } from './workspace/files';
import { DraftStore } from './workspace/drafts';
import { ProjectStore } from './workspace/projects';
import { ConfigurationService } from './workspace/configuration';
import { GatewaySettingsService } from './workspace/settings';
import { GatewayAdminService } from './workspace/gateway-admin';
import { ApprovalsService } from './workspace/approvals';
import updater from 'electron-updater';
import { UpdateService } from './updates/service';
import { isTrustedRendererUrl } from './renderer-origin';

app.setName('Pincer');
app.setAppUserModelId('app.pincer.desktop');
const testData = !app.isPackaged ? process.env.PINCER_TEST_DATA : undefined;
// Honor Electron's explicit profile switch for isolated packaged smoke tests too.
const explicitProfile = app.commandLine.getSwitchValue('user-data-dir');
if (explicitProfile && !isAbsolute(explicitProfile)) throw new Error('PROFILE_PATH_MUST_BE_ABSOLUTE');
app.setPath('userData', explicitProfile || testData || join(app.getPath('appData'), 'Pincer'));
const root = fileURLToPath(new URL('../', import.meta.url));
let window: BrowserWindow | null = null;
let gateway: GatewayService | null = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { window?.show(); if (window?.isMinimized()) window.restore(); window?.focus(); });
  void app.whenReady().then(start).catch(() => {
    dialog.showErrorBox('Pincer', 'Не удалось открыть защищённое хранилище или запустить приложение. Данные не сброшены.');
    app.quit();
  });
}

function trusted(event: IpcMainInvokeEvent): void {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || !isTrustedRendererUrl(event.senderFrame.url, pathToFileURL(join(root, 'dist/index.html')).href)) throw new Error('UNTRUSTED_SENDER');
}

async function start(): Promise<void> {
  if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
    throw new Error('SECURE_STORAGE_UNAVAILABLE');
  }
  const vault = new Vault(join(app.getPath('userData'), 'gateway.vault'), {
    encrypt: (text) => safeStorage.encryptString(text), decrypt: (data) => safeStorage.decryptString(data),
  });
  gateway = new GatewayService(vault, app.getVersion());
  const service = gateway;
  const timing = new RunTiming({ path: join(app.getPath('userData'), 'run-timing.vault'), cipher: { encrypt: (text) => safeStorage.encryptString(text), decrypt: (data) => safeStorage.decryptString(data) } });
  const projects = new ProjectStore({ path: join(app.getPath('userData'), 'projects.vault'), cipher: { encrypt: (text) => safeStorage.encryptString(text), decrypt: (data) => safeStorage.decryptString(data) } });
  const workspace = new WorkspaceService(service, (message) => vault.redact(message), timing, projects);
  const management = new ManagementService(service);
  const quotas = new QuotaService(() => service.operatorRequest('usage.status', {}), () => JSON.stringify(service.snapshot().profile), { path: join(app.getPath('userData'), 'quota-sources.vault'), cipher: { encrypt: (text) => safeStorage.encryptString(text), decrypt: (data) => safeStorage.decryptString(data) } });
  const files = new WorkspaceFilesService(service);
  const configuration = new ConfigurationService(service);
  const gatewaySettings = new GatewaySettingsService(service);
  const gatewayAdmin = new GatewayAdminService(service, (value) => vault.redact(value));
  const approvals = new ApprovalsService(service);
  const drafts = new DraftStore(join(app.getPath('userData'), 'drafts.vault'), { encrypt: (text) => safeStorage.encryptString(text), decrypt: (data) => safeStorage.decryptString(data) });
  const updates = new UpdateService(updater.autoUpdater, app.getVersion(), app.isPackaged, async () => {
    await service.disconnect();
    quitting = true;
  });
  // Serialize user-triggered connection changes to prevent crossed identities/endpoints.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(action: () => Promise<T> | T): Promise<T> {
    const next = queue.then(action, action);
    queue = next.catch(() => {});
    return next;
  }
  const result = async <T,>(action: () => Promise<T> | T): Promise<Result<T>> => {
    try { return { ok: true, value: await action() }; }
    catch (error) {
      const message = vault.redact(error instanceof Error ? error.message : 'CONNECTION_FAILED');
      return { ok: false, error: { code: /^[A-Z_]+$/.test(message) ? message : 'CONNECTION_FAILED', message } };
    }
  };
  ipcMain.handle('pincer:gateway:snapshot', (event) => { trusted(event); return service.snapshot(); });
  const operation = (channel: string, action: (...args: unknown[]) => unknown, mutating = false) => {
    ipcMain.handle(`pincer:${channel}`, (event, ...args: unknown[]) => {
      trusted(event);
      return result(() => { if (mutating && updates.busy) throw new Error('UPDATE_BUSY'); return action(...args); });
    });
  };
  ipcMain.handle('pincer:chat:snapshot', (event) => { trusted(event); return workspace.snapshot(); });
  ipcMain.handle('pincer:approvals:snapshot', (event) => { trusted(event); return approvals.snapshot(); });
  operation('approvals:refresh', () => approvals.refresh());
  operation('approvals:resolve', (id, token, decision) => approvals.resolve(id, token, decision), true);
  operation('chat:refresh', () => workspace.refresh());
  operation('chat:select', (key) => workspace.select(key));
  operation('chat:prepare', (location) => workspace.prepare(location));
  operation('chat:create', (agent, location) => workspace.create(agent, location), true);
  operation('chat:project-register', (name, path) => workspace.registerProject(name, path), true);
  operation('chat:project-remove', (id) => workspace.removeProject(id), true);
  operation('chat:send', (message, key, attachments, target) => workspace.send(message, key, attachments, target), true);
  operation('chat:permission', (mode) => workspace.setPermission(mode), true);
  operation('desktop:choose-directory', async () => {
    if (!window) throw new Error('WINDOW_UNAVAILABLE');
    const picked = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] });
    return picked.canceled ? null : picked.filePaths[0] || null;
  });
  operation('management:subagent-cancel', (id) => management.cancelSubagent(id), true);
  operation('management:usage', (range) => management.usage(range));
  operation('management:quotas', (force) => quotas.load(force));
  operation('management:quotaSource', () => quotas.settings());
  operation('management:saveQuotaSource', (input) => quotas.configure(input as import('../shared/quotas').QuotaSourceInput));
  operation('chat:abort', () => workspace.abort(), true);
  operation('chat:more', () => workspace.more());
  operation('chat:rename', (key, title) => workspace.rename(key, title), true);
  operation('chat:pin', (key, pinned) => workspace.pin(key, pinned), true);
  operation('chat:remove', (key) => workspace.remove(key), true);
  operation('chat:model', (model, thinking) => workspace.setModel(model, thinking), true);
  operation('chat:thinking', (thinking) => workspace.setThinking(thinking), true);
  operation('management:list', (page, agent) => management.list(page, agent));
  operation('management:agent-save', async (id, input) => { await management.saveAgent(id, input); await workspace.refresh(); }, true);
  operation('management:agent-delete', async (id) => { await management.deleteAgent(id); await workspace.refresh(); }, true);
  operation('management:agent-file', (id, name) => management.agentFile(id, name));
  operation('management:agent-file-save', (id, name, content, hash) => management.saveAgentFile(id, name, content, hash), true);
  operation('management:skill-set', (key, enabled) => management.setSkill(key, enabled), true);
  operation('management:skill-search', (query) => management.searchSkills(query));
  operation('management:skill-install', (slug, agent) => management.installSkill(slug, agent), true);
  operation('management:channel-action', (channel, account, action) => management.channelAction(channel, account, action), true);
  operation('management:job-save', (id, input) => management.saveJob(id, input), true);
  operation('management:job-toggle', (id, enabled) => management.toggleJob(id, enabled), true);
  operation('management:job-delete', (id) => management.deleteJob(id), true);
  operation('management:job-run', (id) => management.runJob(id), true);
  operation('management:job-runs', (id) => management.jobRuns(id));
  operation('management:model-probe', (provider, agent) => management.probeModel(provider, agent));
  operation('files:list', (key, path, search) => files.list(key, path, search));
  operation('files:read', (key, path) => files.read(key, path));
  operation('files:save', (key, path, content, hash) => files.save(key, path, content, hash), true);
  operation('drafts:read', (scope) => { if (scope !== workspace.snapshot().scope) throw new Error('CONNECTION_CHANGED'); return drafts.read(scope); });
  operation('drafts:write', (scope, key, text) => { if (scope !== workspace.snapshot().scope) throw new Error('CONNECTION_CHANGED'); return drafts.write(scope, key, text); });
  operation('configuration:providers', () => configuration.providers());
  operation('settings:catalog', () => gatewaySettings.catalog());
  operation('settings:section', (root) => gatewaySettings.section(root));
  operation('settings:save', (lease, value) => gatewaySettings.save(lease, value), true);
  operation('gateway-admin:profile', () => gatewayAdmin.profile());
  operation('gateway-admin:profile-name', (id, name) => gatewayAdmin.setDisplayName(id, name), true);
  operation('gateway-admin:devices', () => gatewayAdmin.devices());
  operation('gateway-admin:device-action', (action, id, label) => gatewayAdmin.deviceAction(action, id, label), true);
  operation('gateway-admin:logs', (cursor) => gatewayAdmin.logs(cursor));
  operation('configuration:provider-save', (hash, input) => configuration.saveProvider(hash, input), true);
  operation('configuration:provider-delete', (hash, id) => configuration.deleteProvider(hash, id), true);
  operation('configuration:memory', () => configuration.memory());
  operation('configuration:memory-save', (hash, input) => configuration.saveMemory(hash, input), true);
  ipcMain.handle('pincer:desktop:startup', (event) => {
    trusted(event);
    const supported = app.isPackaged && !explicitProfile && ['win32', 'darwin'].includes(process.platform);
    return { supported, enabled: supported && app.getLoginItemSettings().openAtLogin };
  });
  operation('desktop:set-startup', (enabled) => {
    if (typeof enabled !== 'boolean') throw new Error('INVALID_INPUT');
    if (!app.isPackaged || explicitProfile || !['win32', 'darwin'].includes(process.platform)) throw new Error('INSTALLED_APP_REQUIRED');
    app.setLoginItemSettings({ openAtLogin: enabled });
    return app.getLoginItemSettings().openAtLogin;
  });
  operation('memory:read', (agent) => workspace.readMemory(agent));
  operation('memory:save', (agent, content, hash) => workspace.saveMemory(agent, content, hash), true);
  operation('memory:status', (agent, probe) => workspace.memoryStatus(agent, probe));
  operation('memory:search', (agent, query) => workspace.searchMemory(agent, query));
  ipcMain.handle('pincer:updates:snapshot', (event) => { trusted(event); return updates.snapshot(); });
  ipcMain.handle('pincer:updates:check', (event) => { trusted(event); return updates.check(); });
  ipcMain.handle('pincer:updates:install', (event) => { trusted(event); return updates.install(); });
  ipcMain.handle('pincer:gateway:connect', (event, input: unknown) => {
    trusted(event);
    return serial(() => result(() => service.configure(parseConnection(input))));
  });
  ipcMain.handle('pincer:gateway:disconnect', (event) => { trusted(event); return serial(() => service.disconnect()); });
  ipcMain.handle('pincer:gateway:retry', (event) => {
    trusted(event);
    return serial(() => result(async () => { await service.disconnect(); return service.connectSaved(); }));
  });
  ipcMain.handle('pincer:window:maximized', (event) => { trusted(event); return window?.isMaximized() ?? false; });
  ipcMain.handle('pincer:window:action', (event, action: unknown) => {
    trusted(event);
    if (action === 'minimize') window?.minimize();
    else if (action === 'maximize') { if (window?.isMaximized()) window.unmaximize(); else window?.maximize(); }
    else if (action === 'close') window?.close();
    else if (action === 'quit') app.quit();
    else throw new Error('INVALID_WINDOW_ACTION');
  });
  ipcMain.handle('pincer:window:menu', (event, id: unknown) => {
    trusted(event);
    const menus: Record<string, MenuItemConstructorOptions[]> = {
      file: [{ label: 'Выход', click: () => app.quit() }],
      edit: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
      view: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }],
      help: [{ label: 'Pincer · OpenClaw Gateway', enabled: false }, { label: `Версия ${app.getVersion()}`, enabled: false }],
    };
    if (typeof id !== 'string' || !Object.hasOwn(menus, id)) throw new Error('INVALID_MENU');
    Menu.buildFromTemplate(menus[id]).popup({ window: window ?? undefined });
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  Menu.setApplicationMenu(null);
  const createWindow = () => {
    window = new BrowserWindow({
      width: 1280, height: 850, minWidth: 760, minHeight: 620, show: false,
      title: 'Pincer', backgroundColor: '#f5f5f5',
      frame: process.platform !== 'win32',
      ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
      webPreferences: { preload: join(root, 'dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    window.webContents.on('context-menu', (_event, params) => {
      const template: MenuItemConstructorOptions[] = params.isEditable
        ? [
            { role: 'undo', enabled: params.editFlags.canUndo }, { role: 'redo', enabled: params.editFlags.canRedo },
            { type: 'separator' },
            { role: 'cut', enabled: params.editFlags.canCut }, { role: 'copy', enabled: params.editFlags.canCopy },
            { role: 'paste', enabled: params.editFlags.canPaste }, { role: 'selectAll', enabled: params.editFlags.canSelectAll },
          ]
        : params.selectionText ? [{ role: 'copy', enabled: params.editFlags.canCopy }, { role: 'selectAll' }] : [];
      if (template.length) Menu.buildFromTemplate(template).popup({ window: window ?? undefined });
    });
    window.on('maximize', () => window?.webContents.send('pincer:window:maximized', true));
    window.on('unmaximize', () => window?.webContents.send('pincer:window:maximized', false));
    window.once('ready-to-show', () => window?.show());
    window.on('closed', () => { window = null; });
    void window.loadFile(join(root, 'dist/index.html'));
  };
  service.subscribe((state) => {
    if (window && !window.isDestroyed()) window.webContents.send('pincer:gateway:state', state);
  });
  createWindow();
  approvals.subscribe((state) => { if (window && !window.isDestroyed()) window.webContents.send('pincer:approvals:state', state); });
  workspace.subscribe((state) => { if (window && !window.isDestroyed()) window.webContents.send('pincer:chat:state', state); });
  updates.subscribe((state) => { if (window && !window.isDestroyed()) window.webContents.send('pincer:updates:state', state); });
  let lastServerVersion: string | undefined;
  service.subscribe((state) => {
    const version = state.operator.serverVersion;
    if (version && version !== lastServerVersion) { lastServerVersion = version; void updates.check(); }
  });
  if (app.isPackaged) {
    setTimeout(() => { void updates.check(); }, 15000).unref();
    setInterval(() => { void updates.check(); }, 4 * 60 * 60 * 1000).unref();
  }
  app.on('activate', () => { if (!window) createWindow(); });
  if (vault.profile && vault.credential) service.connectSaved();
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', (event) => {
  if (!gateway || quitting) return;
  event.preventDefault();
  quitting = true;
  void gateway.disconnect().finally(() => app.quit());
});
