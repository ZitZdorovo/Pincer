import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DeviceIdentity, GatewayClientHostDeps, DeviceAuthTokenRecord } from '@openclaw/gateway-client';
import type { ConnectionProfile } from '../../shared/contract';
import { isRecord, parseConnection, profileKey } from './validation';

export interface Cipher {
  encrypt(text: string): Buffer;
  decrypt(data: Buffer): string;
}
type StoredToken = { token: string; scopes: string[] };
type VaultData = {
  version: 1;
  identity: DeviceIdentity;
  profile: ConnectionProfile | null;
  credential: string;
  tokens: Record<string, StoredToken>;
};

export function rawPublicKey(pem: string): string {
  const jwk = createPublicKey(pem).export({ format: 'jwk' });
  if (jwk.crv !== 'Ed25519' || !jwk.x) throw new Error('INVALID_DEVICE_KEY');
  return jwk.x;
}

export function createIdentity(): DeviceIdentity {
  const pair = generateKeyPairSync('ed25519');
  const publicKeyPem = pair.publicKey.export({ format: 'pem', type: 'spki' }).toString();
  return {
    deviceId: createHash('sha256').update(Buffer.from(rawPublicKey(publicKeyPem), 'base64url')).digest('hex'),
    publicKeyPem,
    privateKeyPem: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  };
}

function decodeData(raw: unknown): VaultData {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.identity) || !isRecord(raw.tokens)
      || typeof raw.credential !== 'string') throw new Error('VAULT_INVALID');
  const key = raw.identity;
  if (typeof key.deviceId !== 'string' || typeof key.publicKeyPem !== 'string' || typeof key.privateKeyPem !== 'string') {
    throw new Error('VAULT_INVALID');
  }
  const identity: DeviceIdentity = { deviceId: key.deviceId, publicKeyPem: key.publicKeyPem, privateKeyPem: key.privateKeyPem };
  const derivedPublic = createPublicKey(identity.privateKeyPem).export({ format: 'pem', type: 'spki' }).toString();
  const hash = createHash('sha256').update(Buffer.from(rawPublicKey(derivedPublic), 'base64url')).digest('hex');
  if (rawPublicKey(derivedPublic) !== rawPublicKey(identity.publicKeyPem) || hash !== identity.deviceId) throw new Error('VAULT_INVALID');
  const tokens: Record<string, StoredToken> = Object.create(null) as Record<string, StoredToken>;
  for (const [id, token] of Object.entries(raw.tokens)) {
    if (!isRecord(token) || typeof token.token !== 'string' || !Array.isArray(token.scopes)
        || !token.scopes.every((scope): scope is string => typeof scope === 'string')) throw new Error('VAULT_INVALID');
    tokens[id] = { token: token.token, scopes: token.scopes };
  }
  const profile = raw.profile === null ? null : parseConnection(raw.profile);
  return { version: 1, identity, tokens, profile, credential: raw.credential };
}

/** The entire vault, including private key and role tokens, is OS-encrypted. */
export class Vault {
  private data: VaultData;
  constructor(private readonly path: string, private readonly cipher: Cipher) {
    if (existsSync(path)) {
      try { this.data = decodeData(JSON.parse(cipher.decrypt(readFileSync(path)))); }
      catch { throw new Error('VAULT_UNREADABLE'); } // Never reset identity silently.
    } else {
      this.data = { version: 1, identity: createIdentity(), profile: null, credential: '', tokens: {} };
      this.persist(this.data);
    }
  }
  get identity(): DeviceIdentity { return { ...this.data.identity }; }
  get profile(): ConnectionProfile | null { return this.data.profile && { ...this.data.profile }; }
  get credential(): string { return this.data.credential; }

  configure(profile: ConnectionProfile, credential: string): void {
    const tokens = { ...this.data.tokens };
    // Replacing bootstrap credentials must not leave old role tokens in charge.
    if (profileKey(profile) === (this.data.profile && profileKey(this.data.profile)) && credential !== this.data.credential) {
      for (const role of ['operator', 'node']) delete tokens[this.tokenKey(profile, role)];
    }
    this.persist({ ...this.data, tokens, profile, credential });
  }

  hostDeps(profile: ConnectionProfile): GatewayClientHostDeps {
    const keyFor = (role: string) => this.tokenKey(profile, role);
    return {
      loadOrCreateDeviceIdentity: () => this.identity,
      signDevicePayload: (key, payload) => sign(null, Buffer.from(payload), key).toString('base64url'),
      publicKeyRawBase64UrlFromPem: rawPublicKey,
      loadDeviceAuthToken: ({ deviceId, role }): DeviceAuthTokenRecord | null => {
        const stored = deviceId === this.data.identity.deviceId ? this.data.tokens[keyFor(role)] : undefined;
        return stored ? { token: stored.token, scopes: [...stored.scopes] } : null;
      },
      storeDeviceAuthToken: ({ deviceId, role, token, scopes }) => {
        if (deviceId !== this.data.identity.deviceId) throw new Error('DEVICE_ID_MISMATCH');
        this.persist({ ...this.data, tokens: { ...this.data.tokens, [keyFor(role)]: { token, scopes: [...scopes] } } });
      },
      clearDeviceAuthToken: ({ deviceId, role }) => {
        if (deviceId !== this.data.identity.deviceId) return;
        const tokens = { ...this.data.tokens };
        delete tokens[keyFor(role)];
        this.persist({ ...this.data, tokens });
      },
      // No upstream raw logs: they may contain server-controlled strings or credentials.
      logDebug: () => {}, logError: () => {},
    };
  }

  redact(message: string): string {
    const secrets = [this.data.credential, ...Object.values(this.data.tokens).map((token) => token.token)];
    let clean = message;
    for (const secret of secrets) {
      if (!secret) continue;
      clean = clean.split(secret).join('[redacted]').split(encodeURIComponent(secret)).join('[redacted]');
    }
    return clean.slice(0, 1200);
  }

  private tokenKey(profile: ConnectionProfile, role: string): string {
    return JSON.stringify([profileKey(profile), this.data.identity.deviceId, role]);
  }
  private persist(next: VaultData): void {
    const encrypted = this.cipher.encrypt(JSON.stringify(next));
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(`${this.path}.next`, encrypted, { mode: 0o600 });
    renameSync(`${this.path}.next`, this.path);
    this.data = next;
  }
}
