import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import type { Cipher } from '../gateway/vault';

/** Only keys entered in Pincer; never reads another application's config. */
export class ProviderCredentials {
  constructor(private path: string, private cipher: Cipher, private scope: () => string) {}
  private read(): Record<string, string> {
    if (!existsSync(this.path)) return {};
    const value: unknown = JSON.parse(this.cipher.decrypt(readFileSync(this.path)));
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(v => typeof v !== 'string')) throw new Error('PROVIDER_CREDENTIALS_INVALID');
    return value as Record<string, string>;
  }
  get(id: string, endpoint: string): string { return this.read()[JSON.stringify([this.scope(), id, endpoint])] || ''; }
  set(id: string, endpoint: string, key: string): void {
    const values = this.read(); const scope = this.scope(); const index = JSON.stringify([scope, id, endpoint]);
    // Replacing or deleting a provider must not leave older destination keys.
    for (const stored of Object.keys(values)) {
      const parts: unknown = JSON.parse(stored);
      if (Array.isArray(parts) && parts[0] === scope && parts[1] === id) delete values[stored];
    }
    if (key) values[index] = key; else delete values[index];
    writeFileSync(`${this.path}.next`, this.cipher.encrypt(JSON.stringify(values)), { mode: 0o600 });
    renameSync(`${this.path}.next`, this.path);
  }
}
