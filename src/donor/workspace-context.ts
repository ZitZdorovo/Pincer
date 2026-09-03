import type { ChatSession } from './types';
// An unspecified workspace belongs to the remote Gateway, never a local fallback.
export const DEFAULT_WORKSPACE_CWD = '';
export const isDefaultWorkspacePath = (path: string) => !path;
export const getSessionWorkspaceForGrouping = (session: ChatSession, globalWorkspace?: string | null) => session.workspacePath || globalWorkspace || '';
export function getWorkspaceDisplayLabel(path: string, defaultLabel: string, labels: Record<string, string> = {}, paths: readonly string[] = []) {
  if (!path) return defaultLabel;
  if (labels[path]) return labels[path];
  const leaf = path.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || path;
  return paths.some((candidate) => candidate !== path && candidate.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) === leaf) ? path : leaf;
}
