import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault, type Cipher } from '../../electron/gateway/vault';

export function fixtureVault() {
  const key = randomBytes(32);
  const cipher: Cipher = {
    encrypt(text) {
      const iv = randomBytes(12);
      const encryption = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([encryption.update(text, 'utf8'), encryption.final()]);
      return Buffer.concat([iv, encryption.getAuthTag(), data]);
    },
    decrypt(data) {
      const decryption = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
      decryption.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([decryption.update(data.subarray(28)), decryption.final()]).toString('utf8');
    },
  };
  const dir = mkdtempSync(join(tmpdir(), 'pincer-unit-'));
  const path = join(dir, 'test.vault');
  return { dir, path, cipher, vault: new Vault(path, cipher) };
}
