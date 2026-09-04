import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../electron/workspace/projects';

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

it('persists arbitrary non-Git folders encrypted and isolated by Gateway scope', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pincer-projects-')); folders.push(folder);
  const path = join(folder, 'projects.vault');
  const cipher = {
    encrypt: (text: string) => Buffer.from(Buffer.from(text, 'utf8').toString('base64'), 'utf8'),
    decrypt: (data: Buffer) => Buffer.from(data.toString('utf8'), 'base64').toString('utf8'),
  };
  const scope = 'a'.repeat(64); const other = 'b'.repeat(64);
  const store = new ProjectStore({ path, cipher });
  store.add(scope, 'Far Cry 4', 'C:\\Users\\zdawn\\Documents\\My Games\\Far Cry 4');
  expect(readFileSync(path, 'utf8')).not.toContain('Far Cry 4');
  expect(new ProjectStore({ path, cipher }).list(scope)).toMatchObject([{ name: 'Far Cry 4', path: 'C:\\Users\\zdawn\\Documents\\My Games\\Far Cry 4' }]);
  expect(new ProjectStore({ path, cipher }).list(other)).toEqual([]);
});
