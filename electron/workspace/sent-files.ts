import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChatMessage, MessageFile } from '../../shared/contract';
import type { Cipher } from '../gateway/vault';

type Entry = { scope: string; session: string; text: string; files: MessageFile[]; after: number; turnKey?: string };

/** Gateway history may omit uploaded bytes. Keep a small, encrypted local copy attached to its user turn. */
export class SentFiles {
  private entries: Entry[] = [];
  private healthy = true;

  constructor(private storage?: { path: string; cipher: Cipher }) {
    if (!storage || !existsSync(storage.path)) return;
    try {
      const entries: unknown = JSON.parse(storage.cipher.decrypt(readFileSync(storage.path)));
      if (!Array.isArray(entries) || entries.length > 100 || !entries.every((entry) => this.valid(entry))) throw new Error('INVALID_SENT_FILES');
      this.entries = entries.map((entry: Entry) => ({ ...entry, files: entry.files.map((file) => file.data && /^(image\/png|image\/jpeg|image\/webp|image\/gif)$/i.test(file.mimeType) ? { ...file, imageData: `data:${file.mimeType};base64,${file.data}` } : file) }));
    } catch { this.healthy = false; } // Preserve unreadable encrypted data.
  }

  private valid(value: unknown): value is Entry {
    if (!value || typeof value !== 'object') return false;
    const entry = value as Entry;
    return typeof entry.scope === 'string' && /^[a-f0-9]{64}$/.test(entry.scope)
      && typeof entry.session === 'string' && entry.session.length <= 1024
      && typeof entry.text === 'string' && entry.text.length <= 100000
      && Number.isSafeInteger(entry.after) && entry.after >= 0
      && (entry.turnKey === undefined || typeof entry.turnKey === 'string')
      && Array.isArray(entry.files) && entry.files.length <= 32
      && entry.files.every((file) => file && typeof file.name === 'string' && typeof file.mimeType === 'string' && typeof file.data === 'string' && file.data.length <= 25 * 1024 * 1024);
  }

  remember(scope: string, session: string, text: string, files: MessageFile[], after: number) {
    if (!files.length) return;
    this.entries.push({ scope, session, text, files, after });
    if (this.entries.length > 100) this.entries.splice(0, this.entries.length - 100);
    this.save();
  }

  restore(scope: string, session: string, history: ChatMessage[]): ChatMessage[] {
    const users = history.filter((message) => message.role === 'user');
    let changed = false;
    for (const entry of this.entries) {
      if (entry.scope !== scope || entry.session !== session) continue;
      const matching = users.filter((message) => message.text === entry.text && (!entry.turnKey || message.turnKey === entry.turnKey));
      const message = entry.turnKey ? matching[0] : matching.find((candidate) => users.indexOf(candidate) >= entry.after);
      if (!message) continue;
      if (message.turnKey && entry.turnKey !== message.turnKey) { entry.turnKey = message.turnKey; changed = true; }
      message.files = entry.files;
    }
    if (changed) this.save();
    return history;
  }

  private save() {
    if (!this.storage || !this.healthy) return;
    try {
      // Image previews are derived from the same base64 bytes, so store only one copy.
      const compact = this.entries.map((entry) => ({ ...entry, files: entry.files.map(({ imageData: _imageData, ...file }) => file) }));
      while (compact.length > 1 && JSON.stringify(compact).length > 32 * 1024 * 1024) compact.shift();
      if (JSON.stringify(compact).length > 32 * 1024 * 1024) return;
      mkdirSync(dirname(this.storage.path), { recursive: true });
      const staging = this.storage.path + '.tmp';
      writeFileSync(staging, this.storage.cipher.encrypt(JSON.stringify(compact)), { mode: 0o600 });
      renameSync(staging, this.storage.path);
    } catch { /* Local attachment cache must not affect sending or replace unreadable storage. */ }
  }
}
