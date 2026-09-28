import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceFilesService } from '../../electron/workspace/files';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it('opens and saves files in the bound local project while rejecting paths outside it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pincer-local-files-')); directories.push(root);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'note.txt'), 'original');
  const service = new WorkspaceFilesService({ operatorRequest: async () => { throw new Error('Gateway files should not be used'); } }, () => root);
  const listing = await service.list('session-1', 'src');
  expect(listing.entries).toMatchObject([{ name: 'note.txt', kind: 'file' }]);
  const file = await service.read('session-1', join('src', 'note.txt'));
  expect(file).toMatchObject({ content: 'original', previewKind: 'text' });
  await expect(service.save('session-1', file.path, 'changed', 'bad-hash')).rejects.toThrow('FILE_SAVE_FAILED');
  expect((await service.save('session-1', file.path, 'changed', file.hash)).content).toBe('changed');
  await expect(service.read('session-1', '../outside.txt')).rejects.toThrow();
});
