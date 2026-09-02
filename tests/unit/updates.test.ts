import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { UpdateService, type UpdateDriver } from '../../electron/updates/service';
function fixture(packaged = true) {
  const emitter = new EventEmitter();
  const driver = Object.assign(emitter, { autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true, setFeedURL: vi.fn(), checkForUpdates: vi.fn(async () => { emitter.emit('update-available', { version: '0.2.1' }); }), downloadUpdate: vi.fn(async () => ['verified-installer.exe']), quitAndInstall: vi.fn() });
  const prepare = vi.fn(async () => {});
  const service = new UpdateService(driver as unknown as UpdateDriver, '0.2.0', packaged, prepare);
  return { driver, prepare, service };
}
describe('Pincer update transaction', () => {
  it('uses only the authorized feed and never installs on normal app exit', () => {
    const { driver } = fixture();
    expect(driver.setFeedURL).toHaveBeenCalledWith({ provider: 'github', owner: 'ZitZdorovo', repo: 'Pincer', private: false });
    expect(driver.autoDownload).toBe(false); expect(driver.autoInstallOnAppQuit).toBe(false); expect(driver.allowDowngrade).toBe(false);
  });
  it('does nothing in development and cannot install without an available release', async () => {
    const { service, driver } = fixture(false); await service.check(); await service.install();
    expect(service.snapshot().phase).toBe('development'); expect(driver.checkForUpdates).not.toHaveBeenCalled(); expect(driver.quitAndInstall).not.toHaveBeenCalled();
  });
  it('downloads before shutdown, reports real progress and requests silent restart', async () => {
    const { service, driver, prepare } = fixture();
    await service.check();
    driver.downloadUpdate.mockImplementation(async () => { driver.emit('download-progress', { percent: 42 }); expect(service.snapshot().percent).toBe(42); expect(prepare).not.toHaveBeenCalled(); return ['verified.exe']; });
    await service.install();
    expect(prepare).toHaveBeenCalledOnce(); expect(driver.quitAndInstall).toHaveBeenCalledWith(true, true);
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(driver.quitAndInstall.mock.invocationCallOrder[0]);
    expect(service.snapshot()).toMatchObject({ phase: 'installing', percent: undefined });
  });
  it('does not close the app after a failed download or checksum verification', async () => {
    const { service, driver, prepare } = fixture(); await service.check();
    driver.downloadUpdate.mockRejectedValue(new Error('SHA-512 mismatch'));
    await service.install();
    expect(service.snapshot().phase).toBe('error'); expect(prepare).not.toHaveBeenCalled(); expect(driver.quitAndInstall).not.toHaveBeenCalled();
  });
  it('coalesces repeated install clicks and checks during download', async () => {
    const { service, driver } = fixture(); await service.check();
    let resolve!: (files: string[]) => void;
    driver.downloadUpdate.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const first = service.install(); await service.install(); await service.check();
    expect(driver.downloadUpdate).toHaveBeenCalledOnce(); expect(driver.checkForUpdates).toHaveBeenCalledOnce();
    resolve(['verified.exe']); await first;
  });
  it('allows retry after a network failure', async () => {
    const { service, driver } = fixture(); driver.checkForUpdates.mockRejectedValueOnce(new Error('offline'));
    await service.check(); expect(service.snapshot().phase).toBe('error');
    await service.check(); expect(service.snapshot().phase).toBe('available');
  });
});
