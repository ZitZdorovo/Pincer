import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Cipher } from '../gateway/vault';
import { isRecord } from '../gateway/validation';
import { bounded } from './service';
/** Text drafts are local, encrypted and isolated by Gateway identity. */
export class DraftStore {
  private data: Record<string, Record<string, string>> = {};
  private healthy = true;
  constructor(private path: string, private cipher: Cipher) {
    if (!existsSync(path)) return;
    try {
      const value: unknown = JSON.parse(cipher.decrypt(readFileSync(path)));
      if (!isRecord(value)) throw new Error('INVALID_DRAFTS');
      for (const [scope, entries] of Object.entries(value)) {
        if (!/^[a-f0-9]{64}$/.test(scope) || !isRecord(entries)) throw new Error('INVALID_DRAFTS');
        for (const [key, text] of Object.entries(entries)) { bounded(key); bounded(text, 100000, true); }
      }
      this.data = value as Record<string, Record<string, string>>;
    } catch {
      // Preserve the unreadable bytes verbatim, but move them out of the active
      // slot so one damaged legacy draft cannot permanently disable the chat.
      // The backup remains beside the new vault for manual recovery.
      try {
        mkdirSync(dirname(this.path), { recursive: true });
        let backup = `${this.path}.unreadable-${Date.now()}`;
        let suffix = 1;
        while (existsSync(backup)) backup = `${this.path}.unreadable-${Date.now()}-${suffix++}`;
        renameSync(this.path, backup);
        this.data = {};
      } catch { this.healthy = false; }
    }
  }
  read(scope: unknown): Record<string, string> {
    if (!this.healthy) throw new Error('DRAFTS_UNREADABLE');
    if (typeof scope !== 'string' || !/^[a-f0-9]{64}$/.test(scope)) throw new Error('INVALID_SCOPE');
    return { ...this.data[scope] };
  }
  write(scope: unknown, key: unknown, value: unknown): void {
    const entries = this.read(scope); const id = bounded(key); const content = bounded(value, 100000, true);
    if (entries[id] === content || (!Object.hasOwn(entries, id) && !content)) return;
    if (content) Object.defineProperty(entries, id, { value: content, enumerable: true, configurable: true, writable: true }); else delete entries[id];
    const next = { ...this.data, [scope as string]: entries }; const raw = JSON.stringify(next);
    if (Buffer.byteLength(raw) > 10 * 1024 * 1024) throw new Error('DRAFT_STORAGE_FULL');
    mkdirSync(dirname(this.path), { recursive: true });
    const staging = this.path + '.tmp'; writeFileSync(staging, this.cipher.encrypt(raw), { mode: 0o600 }); renameSync(staging, this.path);
    this.data = next;
  }
}
