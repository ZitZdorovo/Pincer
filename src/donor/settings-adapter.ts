import { setPreferences, usePreferences } from '../preferences';
const actions = {
  setSidebarCollapsed: (sidebarCollapsed: boolean) => setPreferences({ sidebarCollapsed }),
  setSidebarWidth: (sidebarWidth: number) => setPreferences({ sidebarWidth }),
};
const workspaceLabels: Record<string, string> = {};
export function useSettingsStore<T>(select: (state: ReturnType<typeof usePreferences> & typeof actions & { workspaceLabels: Record<string, string>; chatWorkspacePath: string }) => T): T {
  return select({ ...usePreferences(), ...actions, workspaceLabels });
}
