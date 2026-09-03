// Presentation-only types. No OpenX runtime or transport dependencies.
export type ChatSession = { key: string; label?: string; displayName?: string; derivedTitle?: string; workspacePath?: string; updatedAt?: number; createdLocally?: boolean; busy?: boolean };
export type ChatProject = { id: string; name: string; path: string; order: number };
export type ChatFolder = ChatProject & { projectId: string; parentId: string | null };
export const MAC_SIDEBAR_CHROME_HEIGHT = 28;
export const MAC_TRAFFIC_LIGHT_SAFE_INSET = 80;
export function getSessionDisplayTitle(session: ChatSession, labels: Record<string, string> = {}) {
  return labels[session.key] || session.label || session.derivedTitle || session.displayName || session.key;
}
export function projectSessionRunState(session: ChatSession) { return session.busy ? 'busy' : 'idle'; }
