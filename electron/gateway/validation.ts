import type { ConnectionInput, ConnectionProfile } from '../../shared/contract';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate again in Main: renderer form checks are not a trust boundary. */
export function parseConnection(value: unknown): ConnectionInput {
  if (!isRecord(value) || typeof value.url !== 'string' || value.url.length > 2048) {
    throw new Error('INVALID_URL');
  }
  let url: URL;
  try { url = new URL(value.url.trim()); } catch { throw new Error('INVALID_URL'); }
  if (!['ws:', 'wss:'].includes(url.protocol) || !url.hostname) throw new Error('INVALID_URL');
  if (url.username || url.password || url.search || url.hash) throw new Error('URL_CONTAINS_CREDENTIALS');
  // Local SSH tunnels are allowed. Remote connections always require TLS.
  if (url.protocol === 'ws:' && !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) {
    throw new Error('TLS_REQUIRED');
  }
  if (value.authMode !== 'token' && value.authMode !== 'password') throw new Error('INVALID_AUTH_MODE');
  if (value.credential !== undefined && (typeof value.credential !== 'string' || value.credential.length > 16384)) {
    throw new Error('INVALID_CREDENTIAL');
  }
  let tlsFingerprint: string | undefined;
  if (value.tlsFingerprint !== undefined && value.tlsFingerprint !== '') {
    if (typeof value.tlsFingerprint !== 'string') throw new Error('INVALID_TLS_PIN');
    tlsFingerprint = value.tlsFingerprint.trim().replaceAll(':', '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(tlsFingerprint) || url.protocol !== 'wss:') throw new Error('INVALID_TLS_PIN');
  }
  return { url: url.toString(), authMode: value.authMode, credential: value.credential, tlsFingerprint };
}

export function sameProfile(a: ConnectionProfile | null, b: ConnectionProfile): boolean {
  return a?.url === b.url && a.authMode === b.authMode && a.tlsFingerprint === b.tlsFingerprint;
}

export function profileKey(profile: ConnectionProfile): string {
  // Include the context path and TLS pin: two Gateways may share an origin.
  return JSON.stringify([profile.url, profile.tlsFingerprint ?? '']);
}
