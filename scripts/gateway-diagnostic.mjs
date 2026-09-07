import { GatewayClient } from '@openclaw/gateway-client';
import { generateKeyPairSync, createHash, sign, createPublicKey } from 'node:crypto';

// Explicit, opt-in live diagnostics; credentials are never saved or printed.
export async function connectDiagnostic() {
  if (!process.env.PINCER_DIAGNOSTIC_PASSWORD) throw new Error('PINCER_DIAGNOSTIC_PASSWORD required');
  const pair = generateKeyPairSync('ed25519');
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const raw = pem => createPublicKey(pem).export({ format: 'jwk' }).x;
  let client;
  const hello = await new Promise((resolve, reject) => {
    client = new GatewayClient({
      url: 'ws://127.0.0.1:18789', password: process.env.PINCER_DIAGNOSTIC_PASSWORD,
      clientName: 'gateway-client', clientDisplayName: 'Pincer diagnostics', mode: 'ui', role: 'operator',
      scopes: ['operator.admin', 'operator.read', 'operator.write'],
      deviceIdentity: { deviceId: createHash('sha256').update(Buffer.from(raw(publicKeyPem), 'base64url')).digest('hex'), publicKeyPem, privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) },
      hostDeps: { signDevicePayload: (key, payload) => sign(null, Buffer.from(payload), key).toString('base64url'), publicKeyRawBase64UrlFromPem: raw, loadDeviceAuthToken: () => null, storeDeviceAuthToken: () => {}, clearDeviceAuthToken: () => {} },
      onHelloOk: resolve, onConnectError: error => { client.stop(); reject(error); },
    });
    client.start();
  });
  return { client, hello };
}
