import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChatMessage, RunPhase } from '../../shared/contract';
import type { Cipher } from '../gateway/vault';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fingerprint = (message: ChatMessage) => hash([message.text, message.files ?? []]);
type Run = { scope: string; session: string; started: number; phase: RunPhase; fingerprint: string; known: Set<string>; turnKey?: string; duration?: number };

/** Only observed send-to-terminal durations. No transcript text or secrets on disk. */
export class RunTiming {
  private runs = new Map<string, Run>();
  private durations = new Map<string, number>();
  private healthy = true;
  constructor(private storage?: { path: string; cipher: Cipher }) {
    if (!storage || !existsSync(storage.path)) return;
    try {
      const entries: unknown = JSON.parse(storage.cipher.decrypt(readFileSync(storage.path)));
      if (!Array.isArray(entries) || entries.length > 2000 || !entries.every(e => Array.isArray(e) && /^[a-f0-9]{64}$/.test(e[0]) && typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] >= 0)) throw new Error('INVALID_TIMING');
      this.durations = new Map(entries);
    } catch { this.healthy = false; } // Preserve unreadable data; timing is non-critical.
  }
  begin(id: string, scope: string, session: string, message: ChatMessage, history: ChatMessage[], started = Date.now()) {
    this.runs.set(id, { scope, session, started, phase: 'starting', fingerprint: fingerprint(message), known: new Set(history.filter(m => m.role === 'user' && m.turnKey).map(m => m.turnKey!)) });
    if (this.runs.size > 200) this.runs.delete(this.runs.keys().next().value!);
  }
  rename(before: string, after: string) { const run = this.runs.get(before); if (run && before !== after) { this.runs.set(after, run); this.runs.delete(before); } }
  get(id: string | null) { return id ? this.runs.get(id) : undefined; }
  phase(id: string, phase: RunPhase) { const run = this.runs.get(id); if (run && run.phase !== 'working') run.phase = phase; }
  finish(id: string, finished = Date.now()) { const run = this.runs.get(id); if (run && run.duration === undefined) { run.duration = Math.max(0, finished - run.started); this.save(run); } }
  clearActive() { this.runs.clear(); }
  apply(scope: string, session: string, messages: ChatMessage[]) {
    for (const run of this.runs.values()) {
      if (run.scope !== scope || run.session !== session || run.turnKey) continue;
      const candidates = messages.filter(m => m.role === 'user' && m.turnKey && !run.known.has(m.turnKey) && fingerprint(m) === run.fingerprint);
      // Ambiguous/repeated turns never receive another turn's timing.
      if (candidates.length === 1) { run.turnKey = candidates[0].turnKey; this.save(run); }
    }
    for (const message of messages) {
      if (message.role !== 'assistant' || !message.turnKey) continue;
      const duration = this.durations.get(hash([scope, session, message.turnKey]));
      if (duration !== undefined) message.durationMs = duration;
    }
    return messages;
  }
  private save(run: Run) {
    if (!run.turnKey || run.duration === undefined) return;
    const key = hash([run.scope, run.session, run.turnKey]);
    if (this.durations.get(key) === run.duration) return;
    this.durations.set(key, run.duration);
    while (this.durations.size > 2000) this.durations.delete(this.durations.keys().next().value!);
    if (!this.storage || !this.healthy) return;
    try {
      mkdirSync(dirname(this.storage.path), { recursive: true });
      const staging = this.storage.path + '.tmp';
      writeFileSync(staging, this.storage.cipher.encrypt(JSON.stringify([...this.durations])), { mode: 0o600 }); renameSync(staging, this.storage.path);
    } catch { /* A timing-cache write must not break chat or overwrite unreadable data. */ }
  }
}
