import { useSyncExternalStore } from 'react';
export type Preferences = {
  theme: 'system' | 'light' | 'dark'; language: 'ru' | 'en';
  sidebarWidth: number; sidebarCollapsed: boolean; workspacePanelWidth: number; interfaceFontSize: 'small' | 'default' | 'large' | 'xl' | 'xxl';
  interfaceFont: 'system' | 'sans' | 'serif' | 'mono'; chatFont: 'system' | 'sans' | 'serif' | 'mono';
  accentColor: 'default' | 'orange' | 'green' | 'violet' | 'rose'; chatWidth: number;
  collapseTools: boolean; showAgentActivity: boolean; responseNotifications: boolean;
  reducedMotion: 'system' | 'on' | 'off'; sendShortcut: 'enter' | 'ctrl-enter'; closeBehavior: 'quit' | 'tray';
  agentBadgeMode: 'full' | 'initial' | 'hidden' | 'custom'; agentBadgeAliases: Record<string, string>;
  devMode: boolean; chatWorkspacePath: string;
};
function initial(): Preferences {
  const storage = typeof localStorage === 'undefined' ? undefined : localStorage;
  let stored: Partial<Preferences> = {};
  try { const value: unknown = JSON.parse(storage?.getItem('pincer.preferences') || '{}'); if (value && typeof value === 'object') stored = value as Partial<Preferences>; } catch { /* Keep valid defaults; credentials are stored separately in Main. */ }
  const theme = stored.theme ?? storage?.getItem('pincer.theme');
  return {
    theme: theme === 'light' || theme === 'dark' ? theme : 'system',
    language: (stored.language ?? storage?.getItem('pincer.language')) === 'en' ? 'en' : 'ru',
    sidebarWidth: typeof stored.sidebarWidth === 'number' && Number.isFinite(stored.sidebarWidth) ? Math.min(520, Math.max(240, stored.sidebarWidth)) : 320,
    sidebarCollapsed: stored.sidebarCollapsed === true,
    workspacePanelWidth: typeof stored.workspacePanelWidth === 'number' && Number.isFinite(stored.workspacePanelWidth) ? Math.min(75, Math.max(28, stored.workspacePanelWidth)) : 45,
    interfaceFontSize: ['small', 'large', 'xl', 'xxl'].includes(stored.interfaceFontSize ?? '') ? stored.interfaceFontSize! : 'default',
    interfaceFont: ['sans', 'serif', 'mono'].includes(stored.interfaceFont ?? '') ? stored.interfaceFont! : 'system',
    chatFont: ['sans', 'serif', 'mono'].includes(stored.chatFont ?? '') ? stored.chatFont! : 'system',
    accentColor: ['orange', 'green', 'violet', 'rose'].includes(stored.accentColor ?? '') ? stored.accentColor! : 'default',
    chatWidth: typeof stored.chatWidth === 'number' && Number.isFinite(stored.chatWidth) ? Math.min(1200, Math.max(560, stored.chatWidth)) : 736,
    collapseTools: stored.collapseTools === true, showAgentActivity: stored.showAgentActivity !== false, responseNotifications: stored.responseNotifications !== false,
    reducedMotion: stored.reducedMotion === 'on' || stored.reducedMotion === 'off' ? stored.reducedMotion : 'system',
    sendShortcut: stored.sendShortcut === 'ctrl-enter' ? 'ctrl-enter' : 'enter',
    closeBehavior: stored.closeBehavior === 'tray' ? 'tray' : 'quit',
    agentBadgeMode: ['initial', 'hidden', 'custom'].includes(stored.agentBadgeMode ?? '') ? stored.agentBadgeMode! : 'full',
    agentBadgeAliases: Object.fromEntries(Object.entries(stored.agentBadgeAliases ?? {}).filter(([, value]) => typeof value === 'string').slice(0, 200)),
    devMode: stored.devMode === true,
    chatWorkspacePath: typeof stored.chatWorkspacePath === 'string' ? stored.chatWorkspacePath.slice(0, 4096) : '',
  };
}
let preferences = initial();
const listeners = new Set<() => void>();
export function setPreferences(patch: Partial<Preferences>): void {
  preferences = { ...preferences, ...patch };
  localStorage.setItem('pincer.preferences', JSON.stringify(preferences));
  for (const listener of listeners) listener();
}
export function usePreferences(): Preferences {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => preferences);
}
