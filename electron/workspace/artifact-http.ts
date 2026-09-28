import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import type { DetailedPeerCertificate } from 'node:tls';

const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;

/** Resolve a Gateway-issued media URL without allowing it to redirect to another host. */
export function artifactUrl(endpoint: string, value: string): { url: URL; sameOrigin: boolean } {
  const base = new URL(endpoint);
  if (base.protocol === 'wss:') base.protocol = 'https:';
  else if (base.protocol === 'ws:') base.protocol = 'http:';
  else throw new Error('ARTIFACT_DOWNLOAD_UNAVAILABLE');
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('ARTIFACT_DOWNLOAD_UNAVAILABLE');
  return { url, sameOrigin: url.origin === base.origin };
}

export function readGatewayArtifact(url: URL, tlsFingerprint?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const options = {
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      ...(url.protocol === 'https:' && tlsFingerprint ? {
        checkServerIdentity: (host: string, cert: DetailedPeerCertificate) => {
          const error = checkServerIdentity(host, cert);
          if (error) return error;
          if (cert.fingerprint256?.replaceAll(':', '').toLowerCase() !== tlsFingerprint.toLowerCase()) return new Error('TLS_PIN_MISMATCH');
          return undefined;
        },
      } : {}),
    };
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(options, (response) => {
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.resume(); reject(new Error('ARTIFACT_DOWNLOAD_UNAVAILABLE')); return;
      }
      if (Number(response.headers['content-length']) > MAX_ARTIFACT_BYTES) {
        response.destroy(); reject(new Error('ARTIFACT_TOO_LARGE')); return;
      }
      response.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_ARTIFACT_BYTES) { response.destroy(new Error('ARTIFACT_TOO_LARGE')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks, total)));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(15000, () => request.destroy(new Error('ARTIFACT_DOWNLOAD_UNAVAILABLE')));
    request.end();
  });
}
