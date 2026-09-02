import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NODE_VERSION } from '../../electron/gateway/service';

it('does not ship the OpenClaw runtime, ACP or the OpenX updater', () => {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as { packages: Record<string, unknown> };
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(pkg.dependencies['@openclaw/gateway-client']).toBe(NODE_VERSION);
  expect(pkg.dependencies['@openclaw/gateway-protocol']).toBe(NODE_VERSION);
  for (const name of Object.keys(lock.packages)) {
    expect(name).not.toMatch(/node_modules\/(openclaw|@agentclientprotocol\/sdk|acpx)$/);
  }
  const source = (path: string): string => readdirSync(path, { withFileTypes: true })
    .map((entry) => entry.isDirectory() ? source(join(path, entry.name)) : readFileSync(join(path, entry.name), 'utf8')).join('\n');
  const main = source('electron');
  expect(main).not.toMatch(/child_process|\.openclaw|getOpenClaw|OpenX[\\/]/);
  const renderer = source('src');
  expect(renderer).not.toMatch(/from ['"]node:|ipcRenderer|new WebSocket|\.openclaw/);
});
