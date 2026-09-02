import type { AppUpdater } from 'electron-updater';
import type { UpdateState } from '../../shared/contract';
export type UpdateDriver = Pick<AppUpdater, 'on' | 'autoDownload' | 'autoInstallOnAppQuit' | 'allowPrerelease' | 'allowDowngrade' | 'setFeedURL' | 'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall'>;
export class UpdateService {
  private state: UpdateState;
  private listeners = new Set<(state: UpdateState) => void>();
  private checking = false;
  private installing = false;
  constructor(private driver: UpdateDriver, version: string, private packaged: boolean, private prepareQuit: () => Promise<void>) {
    this.state = { revision: 0, phase: packaged ? 'idle' : 'development', currentVersion: version };
    driver.autoDownload = false;
    driver.autoInstallOnAppQuit = false;
    driver.allowPrerelease = false;
    driver.allowDowngrade = false;
    driver.setFeedURL({ provider: 'github', owner: 'ZitZdorovo', repo: 'Pincer', private: false });
    driver.on('update-available', (info) => this.set({ phase: 'available', version: info.version, error: undefined }));
    driver.on('update-not-available', () => this.set({ phase: 'current', version: undefined, error: undefined }));
    driver.on('download-progress', (progress) => this.set({ phase: 'downloading', percent: Math.min(100, Math.max(0, progress.percent)) }));
    driver.on('error', () => this.set({ phase: 'error', error: 'UPDATE_FAILED' }));
  }
  snapshot(): UpdateState { return { ...this.state }; }
  subscribe(listener: (state: UpdateState) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  get busy(): boolean { return this.installing; }
  async check(): Promise<void> {
    if (!this.packaged || this.checking || this.installing) return;
    this.checking = true; this.set({ phase: 'checking', error: undefined });
    try { await this.driver.checkForUpdates(); }
    catch { this.set({ phase: 'error', error: 'UPDATE_CHECK_FAILED' }); }
    finally { this.checking = false; }
  }
  async install(): Promise<void> {
    if (!this.packaged || this.installing || this.state.phase !== 'available') return;
    this.installing = true; this.set({ phase: 'downloading', percent: 0, error: undefined });
    try {
      // The official updater validates the asset against release SHA-512 metadata.
      const files = await this.driver.downloadUpdate();
      if (!files.length) throw new Error('NO_INSTALLER');
      this.set({ phase: 'installing', percent: undefined });
      await this.prepareQuit();
      this.driver.quitAndInstall(true, true);
    } catch { this.set({ phase: 'error', error: 'UPDATE_INSTALL_FAILED' }); }
    finally { this.installing = false; }
  }
  private set(next: Partial<UpdateState>): void { this.state = { ...this.state, ...next, revision: this.state.revision + 1 }; for (const listener of this.listeners) listener(this.snapshot()); }
}
