import { validateSessionsFilesSetParams } from '@openclaw/gateway-protocol';
import type { GatewayService } from '../gateway/service';
import { isRecord } from '../gateway/validation';
import { bounded } from './service';
import type { WorkspaceFile, WorkspaceFiles } from '../../shared/files';
import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
const record = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
export class WorkspaceFilesService {
  constructor(private gateway: Pick<GatewayService, 'operatorRequest'>, private localRoot: (sessionKey: string) => string | undefined = () => undefined) {}
  private async localPath(root: string, relativePath: string): Promise<{ root: string; full: string; relative: string }> {
    const canonicalRoot = await realpath(root);
    const requested = path.resolve(canonicalRoot, relativePath || '.');
    const canonical = await realpath(requested);
    const relative = path.relative(canonicalRoot, canonical);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('FILE_OUTSIDE_WORKSPACE');
    return { root: canonicalRoot, full: canonical, relative };
  }
  private async listLocal(root: string, relativePath: string, search?: string): Promise<WorkspaceFiles> {
    const current = await this.localPath(root, relativePath);
    if (!(await stat(current.full)).isDirectory()) throw new Error('NOT_A_DIRECTORY');
    const children = await readdir(current.full, { withFileTypes: true });
    const filtered = search ? children.filter((entry) => entry.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) : children;
    const entries = filtered.slice(0, 1000).map((entry) => ({ path: path.join(current.relative, entry.name), name: entry.name, kind: entry.isDirectory() ? 'directory' as const : 'file' as const }));
    return { root: current.root, path: current.relative, ...(current.relative ? { parentPath: path.dirname(current.relative) === '.' ? '' : path.dirname(current.relative) } : {}), entries, truncated: filtered.length > entries.length };
  }
  private async readLocal(root: string, relativePath: string): Promise<WorkspaceFile> {
    const current = await this.localPath(root, relativePath);
    if (!(await stat(current.full)).isFile()) throw new Error('NOT_A_FILE');
    const bytes = await readFile(current.full);
    if (bytes.length > 16_000_000) throw new Error('FILE_TOO_LARGE');
    const extension = path.extname(current.full).toLowerCase();
    const mimeType = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' } as Record<string, string>)[extension] || '';
    const image = Boolean(mimeType);
    const textFile = !image && !bytes.includes(0) && !['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.exe', '.dll'].includes(extension);
    return { path: current.relative, name: path.basename(current.full), content: image ? bytes.toString('base64') : textFile ? bytes.toString('utf8') : '', hash: createHash('sha256').update(bytes).digest('hex'), missing: false, previewKind: image ? 'image' : textFile ? 'text' : 'unsupported', mimeType, contentEncoding: image ? 'base64' : 'utf8' };
  }
  async list(sessionKey: unknown, path: unknown, search?: unknown): Promise<WorkspaceFiles> {
    const key = bounded(sessionKey);
    const local = this.localRoot(key);
    if (local) return this.listLocal(local, bounded(path, 8192, true), search ? bounded(search, 1024) : undefined);
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
  async read(sessionKey: unknown, path: unknown): Promise<WorkspaceFile> {
    const key = bounded(sessionKey); const relativePath = bounded(path, 8192);
    const local = this.localRoot(key);
    return local ? this.readLocal(local, relativePath) : this.file(await this.gateway.operatorRequest('sessions.files.get', { sessionKey: key, path: relativePath }));
  }
  async save(sessionKey: unknown, path: unknown, content: unknown, hash: unknown): Promise<WorkspaceFile> {
    const key = bounded(sessionKey); const relativePath = bounded(path, 8192);
    const local = this.localRoot(key);
    if (local) {
      const current = await this.localPath(local, relativePath);
      const previous = await readFile(current.full);
      if (createHash('sha256').update(previous).digest('hex') !== bounded(hash, 64)) throw new Error('FILE_SAVE_FAILED');
      await writeFile(current.full, bounded(content, 1_000_000, true));
      return this.readLocal(local, relativePath);
    }
    const params = { sessionKey: bounded(sessionKey), path: bounded(path, 8192), content: bounded(content, 1_000_000, true), expectedHash: bounded(hash, 64) };
    if (!validateSessionsFilesSetParams(params)) throw new Error('INVALID_INPUT');
    const result = record(await this.gateway.operatorRequest('sessions.files.set', params));
    if (result.ok === false) throw new Error('FILE_SAVE_FAILED');
    return this.read(params.sessionKey, params.path);
  }
}
