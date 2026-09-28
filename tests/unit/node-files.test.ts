import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchNodeFile, listNodeFiles, statNodeFile } from '../../electron/gateway/node-files';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it('reads a local project file through node file commands with preflight identity binding', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pincer-node-files-')); roots.push(root);
  mkdirSync(join(root, 'src'));
  const file = join(root, 'src', 'note.txt'); writeFileSync(file, 'local project');
  const listing = await listNodeFiles({ path: join(root, 'src'), preflightOnly: true });
  expect(listing).toMatchObject({ ok: true, preflight: true, entries: [], binding: { kind: 'existing' } });
  const listed = await listNodeFiles({ path: join(root, 'src'), expectedBinding: listing.binding });
  expect(listed).toMatchObject({ ok: true, entries: [{ name: 'note.txt', isDir: false }] });
  const preflight = await fetchNodeFile({ path: file, preflightOnly: true, rootPath: root });
  expect(preflight).toMatchObject({ ok: true, preflightOnly: true, binding: { kind: 'existing' } });
  const content = await fetchNodeFile({ path: file, expectedCanonicalPath: preflight.path, expectedBinding: preflight.binding, rootPath: root });
  expect(content).toMatchObject({ ok: true, mimeType: 'text/plain', base64: Buffer.from('local project').toString('base64') });
  expect(await statNodeFile({ path: file, expectedBinding: preflight.binding })).toMatchObject({ ok: true, type: 'file', size: 13 });
  expect(await fetchNodeFile({ path: file, expectedBinding: { kind: 'existing', device: '0', inode: '0' } })).toMatchObject({ ok: false, code: 'CANONICAL_PATH_CHANGED' });
});

it('rejects a file outside the requested node project root', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pincer-node-root-')); roots.push(root);
  const other = mkdtempSync(join(tmpdir(), 'pincer-node-other-')); roots.push(other);
  const file = join(other, 'secret.txt'); writeFileSync(file, 'outside');
  expect(await fetchNodeFile({ path: file, rootPath: root })).toMatchObject({ ok: false, code: 'PATH_TRAVERSAL' });
});
