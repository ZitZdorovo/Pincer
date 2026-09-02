import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, session } from 'electron';
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GatewayService } from './gateway/service';
import { Vault } from './gateway/vault';
import { parseConnection } from './gateway/validation';
import type { Result } from '../shared/contract';
import { WorkspaceService } from './workspace/service';
import updater from 'electron-updater';
import { UpdateService } from './updates/service';

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
      || event.senderFrame.url !== pathToFileURL(join(root, 'dist/index.html')).href) throw new Error('UNTRUSTED_SENDER');
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
  const workspace = new WorkspaceService(service, (message) => vault.redact(message));
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
  operation('chat:refresh', () => workspace.refresh());
  operation('chat:select', (key) => workspace.select(key));
  operation('chat:create', (agent) => workspace.create(agent), true);
  operation('chat:send', (message, key) => workspace.send(message, key), true);
  operation('chat:abort', () => workspace.abort(), true);
  operation('chat:more', () => workspace.more());
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
