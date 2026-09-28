import { createHash } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import { open, lstat, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

type Params = Record<string, unknown>;
type Reply = Record<string, unknown>;
type Identity = { device: string; inode: string };
type Failure = { ok: false; code: string; message: string; canonicalPath?: string };
type Target = { path: string; info: BigIntStats; binding: { kind: 'existing' } & Identity };
const failure = (code: string, message: string, canonicalPath?: string): Failure => ({ ok: false, code, message, ...(canonicalPath ? { canonicalPath } : {}) });
const identity = (info: { dev: bigint; ino: bigint }): Identity => ({ device: String(info.dev), inode: String(info.ino) });
const sameIdentity = (value: unknown, actual: Identity): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const binding = value as Record<string, unknown>;
  return binding.kind === 'existing' && binding.device === actual.device && binding.inode === actual.inode;
};
const mime = (file: string, isDir = false): string => {
  if (isDir) return 'inode/directory';
  const extension = path.extname(file).toLowerCase();
  return ({ '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json', '.js': 'text/javascript', '.ts': 'text/plain', '.tsx': 'text/plain', '.jsx': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.zip': 'application/zip' } as Record<string, string>)[extension] || 'application/octet-stream';
};

async function canonical(input: Params): Promise<string | Failure> {
  const requested = input.path;
  if (typeof requested !== 'string' || !requested || requested.includes('\0') || !path.isAbsolute(requested)) return failure('INVALID_PATH', 'path must be absolute');
  try {
    if (input.followSymlinks !== true) {
      const parsed = path.parse(requested);
      let current = parsed.root;
      for (const part of requested.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        if ((await lstat(current)).isSymbolicLink()) return failure('SYMLINK_REDIRECT', 'path traverses a symlink');
      }
    }
    const resolved = await realpath(requested);
    if (typeof input.rootPath === 'string') {
      const root = await realpath(input.rootPath);
      const relative = path.relative(root, resolved);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return failure('PATH_TRAVERSAL', 'path is outside rootPath', resolved);
    }
    if (typeof input.expectedCanonicalPath === 'string' && input.expectedCanonicalPath !== resolved) return failure('CANONICAL_PATH_CHANGED', 'canonical path differs from the authorized target', resolved);
    return resolved;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    return failure(code === 'ENOENT' || code === 'ENOTDIR' ? 'NOT_FOUND' : code === 'EACCES' || code === 'EPERM' ? 'PERMISSION_DENIED' : 'READ_ERROR', 'cannot resolve path');
  }
}

async function target(input: Params, type?: 'file' | 'directory'): Promise<Target | Failure> {
  const resolved = await canonical(input);
  if (typeof resolved !== 'string') return resolved;
  try {
    const info = await stat(resolved, { bigint: true });
    if (type === 'file' && !info.isFile()) return failure('IS_DIRECTORY', 'path is not a regular file', resolved);
    if (type === 'directory' && !info.isDirectory()) return failure('IS_FILE', 'path is not a directory', resolved);
    if (!info.isFile() && !info.isDirectory()) return failure('UNSUPPORTED_FILE_TYPE', 'only files and directories are supported', resolved);
    const id = identity(info);
    if (input.expectedBinding !== undefined && !sameIdentity(input.expectedBinding, id)) return failure('CANONICAL_PATH_CHANGED', 'filesystem identity differs from the authorized target', resolved);
    return { path: resolved, info, binding: { kind: 'existing', ...id } };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    return failure(code === 'ENOENT' ? 'NOT_FOUND' : code === 'EACCES' || code === 'EPERM' ? 'PERMISSION_DENIED' : 'READ_ERROR', 'cannot inspect path', resolved);
  }
}

export async function fetchNodeFile(input: Params): Promise<Reply> {
  const entry = await target(input, 'file');
  if ('ok' in entry) return entry;
  const maxBytes = typeof input.maxBytes === 'number' && Number.isFinite(input.maxBytes) && input.maxBytes > 0 ? Math.min(Math.floor(input.maxBytes), 16 * 1024 * 1024) : 8 * 1024 * 1024;
  if (entry.info.size > BigInt(maxBytes)) return failure('FILE_TOO_LARGE', 'file exceeds transfer limit', entry.path);
  if (input.preflightOnly === true) return { ok: true, path: entry.path, size: Number(entry.info.size), mimeType: '', base64: '', sha256: '', preflightOnly: true, binding: entry.binding };
  try {
    const handle = await open(entry.path, 'r');
    try {
      const current = await handle.stat({ bigint: true });
      if (!current.isFile() || !sameIdentity(entry.binding, identity(current))) return failure('CANONICAL_PATH_CHANGED', 'filesystem identity changed', entry.path);
      const bytes = await handle.readFile();
      if (bytes.length > maxBytes) return failure('FILE_TOO_LARGE', 'file exceeds transfer limit', entry.path);
      return { ok: true, path: entry.path, size: bytes.length, mimeType: mime(entry.path), base64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex'), binding: entry.binding };
    } finally { await handle.close(); }
  } catch { return failure('READ_ERROR', 'cannot read file', entry.path); }
}

export async function statNodeFile(input: Params): Promise<Reply> {
  const entry = await target(input);
  if ('ok' in entry) return entry;
  return { ok: true, path: entry.path, type: entry.info.isDirectory() ? 'directory' : 'file', size: Number(entry.info.size), mtimeMs: Number(entry.info.mtimeNs) / 1_000_000, binding: entry.binding, ...(input.preflightOnly === true ? { preflightOnly: true } : {}) };
}

export async function listNodeFiles(input: Params): Promise<Reply> {
  const entry = await target(input, 'directory');
  if ('ok' in entry) return entry;
  if (input.preflightOnly === true) return { ok: true, path: entry.path, entries: [], truncated: false, preflight: true, binding: entry.binding };
  const limit = typeof input.maxEntries === 'number' && Number.isFinite(input.maxEntries) && input.maxEntries > 0 ? Math.min(Math.floor(input.maxEntries), 5000) : 200;
  const offset = typeof input.pageToken === 'string' && /^(0|[1-9]\d*)$/.test(input.pageToken) ? Math.min(Number(input.pageToken), 1_000_000) : 0;
  try {
    const names = (await readdir(entry.path)).sort((a, b) => a.localeCompare(b));
    const entries = [];
    for (const name of names.slice(offset, offset + limit)) {
      const file = path.join(entry.path, name);
      const info = await lstat(file);
      const isDir = info.isDirectory();
      entries.push({ name, path: file, size: isDir ? 0 : info.size, mimeType: mime(name, isDir), isDir, mtime: info.mtimeMs });
    }
    const nextPageToken = offset + limit < names.length ? String(offset + limit) : undefined;
    return { ok: true, path: entry.path, entries, ...(nextPageToken ? { nextPageToken } : {}), truncated: Boolean(nextPageToken), binding: entry.binding };
  } catch { return failure('READ_ERROR', 'cannot list directory', entry.path); }
}
