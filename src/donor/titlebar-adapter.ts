import type { MenuId } from '../../shared/contract';
// Closed presentation adapter: no generic IPC or remote calls.
export const titlebarHost = { window: {
  minimize: () => window.pincer.window.action('minimize'),
  maximize: () => window.pincer.window.action('maximize'),
  close: () => window.pincer.window.action('close'),
  isMaximized: () => window.pincer.window.isMaximized(),
  showMenu: (menu: MenuId, _x: number, _y: number) => window.pincer.window.showMenu(menu),
} };
