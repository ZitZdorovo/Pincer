export type WorkspaceEntry = { path: string; name: string; kind: 'file' | 'directory'; size?: number };
export type WorkspaceFile = { path: string; name: string; content: string; hash?: string; missing: boolean; previewKind: 'text' | 'image' | 'unsupported'; mimeType?: string; contentEncoding?: string };
export type WorkspaceFiles = { root: string; path: string; parentPath?: string; entries: WorkspaceEntry[]; truncated: boolean };
export type FilesApi = {
  list(sessionKey: string, path: string, search?: string): Promise<import('./contract').Result<WorkspaceFiles>>;
  read(sessionKey: string, path: string): Promise<import('./contract').Result<WorkspaceFile>>;
  save(sessionKey: string, path: string, content: string, hash: string): Promise<import('./contract').Result<WorkspaceFile>>;
};
