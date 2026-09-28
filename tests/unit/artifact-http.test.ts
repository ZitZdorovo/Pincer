import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { artifactUrl, readGatewayArtifact } from '../../electron/workspace/artifact-http';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

it('resolves Gateway root-relative media against its own HTTP origin', () => {
  expect(artifactUrl('wss://oc.example/gateway', '/media/signed?token=test')).toMatchObject({
    url: new URL('https://oc.example/media/signed?token=test'), sameOrigin: true,
  });
  expect(artifactUrl('ws://127.0.0.1:18789', '/media/signed').url.href).toBe('http://127.0.0.1:18789/media/signed');
  expect(artifactUrl('wss://oc.example', '//other.example/media').sameOrigin).toBe(false);
  expect(() => artifactUrl('wss://oc.example', 'file:///private')).toThrow('ARTIFACT_DOWNLOAD_UNAVAILABLE');
});

it('downloads Gateway media bytes and rejects redirects', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/redirect') { response.writeHead(302, { Location: 'https://other.example/' }); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'image/jpeg' }); response.end(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  expect(await readGatewayArtifact(new URL('/signed', origin))).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  await expect(readGatewayArtifact(new URL('/redirect', origin))).rejects.toThrow('ARTIFACT_DOWNLOAD_UNAVAILABLE');
});
