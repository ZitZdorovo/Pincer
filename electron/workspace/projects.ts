import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Project } from '../../shared/contract';
import type { Cipher } from '../gateway/vault';

type Storage = { path: string; cipher: Cipher };
function bounded(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('INVALID_INPUT');
  return value;
}

/** Pincer projects are local chat groupings and may point at any folder, Git or otherwise. */
export class ProjectStore {
  private data: Record<string, Project[]> = {};
  private sessionPaths: Record<string, Record<string, string>> = {};
  private healthy = true;

  constructor(private storage?: Storage) {
    if (!storage || !existsSync(storage.path)) return;
    try {
      const value: unknown = JSON.parse(storage.cipher.decrypt(readFileSync(storage.path)));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_PROJECTS');
      for (const [scope, projects] of Object.entries(value)) {
        if (scope === '__sessionPaths') {
          if (!projects || typeof projects !== 'object' || Array.isArray(projects)) throw new Error('INVALID_PROJECTS');
          for (const [key, paths] of Object.entries(projects)) {
            this.scope(key);
            if (!paths || typeof paths !== 'object' || Array.isArray(paths)) throw new Error('INVALID_PROJECTS');
            for (const [sessionKey, path] of Object.entries(paths)) { bounded(sessionKey, 1024); bounded(path, 8192); }
          }
          this.sessionPaths = projects as Record<string, Record<string, string>>;
          continue;
        }
        if (!/^[a-f0-9]{64}$/.test(scope) || !Array.isArray(projects) || projects.length > 500) throw new Error('INVALID_PROJECTS');
        for (const project of projects) {
          if (!project || typeof project !== 'object' || Array.isArray(project)) throw new Error('INVALID_PROJECTS');
          const item = project as Record<string, unknown>;
          bounded(item.id, 128); bounded(item.name, 128); bounded(item.path, 8192);
        }
      }
      this.data = Object.fromEntries(Object.entries(value).filter(([key]) => key !== '__sessionPaths')) as Record<string, Project[]>;
    } catch { this.healthy = false; }
  }

  list(scope: unknown): Project[] {
    const key = this.scope(scope);
    if (!this.healthy) throw new Error('PROJECTS_UNREADABLE');
    return structuredClone(this.data[key] || []);
  }

  add(scope: unknown, name: unknown, path: unknown): Project {
    const key = this.scope(scope); const title = bounded(name, 128).trim(); const folder = bounded(path, 8192).trim();
    const projects = this.list(key);
    const existing = projects.find((project) => project.path.toLocaleLowerCase() === folder.toLocaleLowerCase());
    const project = existing ? { ...existing, name: title } : { id: randomUUID(), name: title, path: folder };
    const next = existing ? projects.map((item) => item.id === existing.id ? project : item) : [...projects, project];
    this.save(key, next);
    return project;
  }

  remove(scope: unknown, id: unknown): void {
    const key = this.scope(scope); const projectId = bounded(id, 128); const projects = this.list(key);
    const next = projects.filter((project) => project.id !== projectId);
    if (next.length === projects.length) throw new Error('PROJECT_NOT_FOUND');
    this.save(key, next);
  }
  updatePath(scope: unknown, id: unknown, path: unknown): Project {
    const key = this.scope(scope); const projectId = bounded(id, 128); const folder = bounded(path, 8192).trim();
    const projects = this.list(key);
    const current = projects.find((project) => project.id === projectId);
    if (!current) throw new Error('PROJECT_NOT_FOUND');
    const updated = { ...current, path: folder };
    this.save(key, projects.map((project) => project.id === projectId ? updated : project));
    return updated;
  }
  sessionPath(scope: unknown, sessionKey: unknown): string | undefined { return this.sessionPaths[this.scope(scope)]?.[bounded(sessionKey, 1024)]; }
  rememberSessionPath(scope: unknown, sessionKey: unknown, path: unknown): void {
    const key = this.scope(scope); const id = bounded(sessionKey, 1024); const cwd = bounded(path, 8192);
    this.sessionPaths = { ...this.sessionPaths, [key]: { ...this.sessionPaths[key], [id]: cwd } };
    this.save(key, this.list(key));
  }

  private scope(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('INVALID_SCOPE');
    return value;
  }

  private save(scope: string, projects: Project[]): void {
    if (!this.healthy) throw new Error('PROJECTS_UNREADABLE');
    const next = { ...this.data, [scope]: projects };
    if (this.storage) {
      const raw = JSON.stringify({ ...next, __sessionPaths: this.sessionPaths });
      if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw new Error('PROJECT_STORAGE_FULL');
      mkdirSync(dirname(this.storage.path), { recursive: true });
      const staging = this.storage.path + '.tmp';
      writeFileSync(staging, this.storage.cipher.encrypt(raw), { mode: 0o600 });
      renameSync(staging, this.storage.path);
    }
    this.data = next;
  }
}
