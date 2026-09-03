import { validateSessionsFilesSetParams } from '@openclaw/gateway-protocol';
import type { GatewayService } from '../gateway/service';
import { isRecord } from '../gateway/validation';
import { bounded } from './service';
import type { WorkspaceFile, WorkspaceFiles } from '../../shared/files';
const record = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
export class WorkspaceFilesService {
  constructor(private gateway: Pick<GatewayService, 'operatorRequest'>) {}
  async list(sessionKey: unknown, path: unknown, search?: unknown): Promise<WorkspaceFiles> {
    const value = record(await this.gateway.operatorRequest('sessions.files.list', { sessionKey: bounded(sessionKey), path: bounded(path, 8192, true), ...(search ? { search: bounded(search, 1024) } : {}) }));
    if (!Array.isArray(value.files)) throw new Error('INVALID_FILES_RESPONSE');
    const browser = record(value.browser);
    return {
      root: text(value.root), path: text(browser.path), parentPath: typeof browser.parentPath === 'string' ? browser.parentPath : undefined, truncated: browser.truncated === true,
      entries: (Array.isArray(browser.entries) ? browser.entries : value.files).map((entry) => { const item = record(entry); return { path: text(item.path), name: text(item.name), kind: item.kind === 'directory' ? 'directory' as const : 'file' as const, size: typeof item.size === 'number' ? item.size : undefined }; }).filter((entry) => entry.name),
    };
  }
  private file(value: unknown): WorkspaceFile {
    const file = record(record(value).file);
    if (typeof file.missing !== 'boolean' || !text(file.path)) throw new Error('INVALID_FILE_RESPONSE');
    const content = text(file.content);
    if (content.length > 16_000_000) throw new Error('FILE_TOO_LARGE');
    return { path: text(file.path), name: text(file.name), content, hash: typeof file.hash === 'string' ? file.hash : undefined, missing: file.missing, previewKind: file.previewKind === 'text' || file.previewKind === 'image' ? file.previewKind : 'unsupported', mimeType: text(file.mimeType), contentEncoding: text(file.contentEncoding) };
  }
  async read(sessionKey: unknown, path: unknown): Promise<WorkspaceFile> { return this.file(await this.gateway.operatorRequest('sessions.files.get', { sessionKey: bounded(sessionKey), path: bounded(path, 8192) })); }
  async save(sessionKey: unknown, path: unknown, content: unknown, hash: unknown): Promise<WorkspaceFile> {
    const params = { sessionKey: bounded(sessionKey), path: bounded(path, 8192), content: bounded(content, 1_000_000, true), expectedHash: bounded(hash, 64) };
    if (!validateSessionsFilesSetParams(params)) throw new Error('INVALID_INPUT');
    const result = record(await this.gateway.operatorRequest('sessions.files.set', params));
    if (result.ok === false) throw new Error('FILE_SAVE_FAILED');
    return this.read(params.sessionKey, params.path);
  }
}
