import { expect, it } from 'vitest';
import { messageFiles } from '../../electron/workspace/messages';
import { parseAttachments } from '../../electron/workspace/attachments';
it('preserves attachment-only messages and inline raster previews', () => {
  expect(messageFiles({ attachments: [{ type: 'file', fileName: 'notes.txt', mimeType: 'text/plain', content: 'aGk=' }] })).toEqual([{ name: 'notes.txt', mimeType: 'text/plain' }]);
  expect(messageFiles({ content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGk=' } }] })).toEqual([{ name: 'Image', mimeType: 'image/png', imageData: 'data:image/png;base64,aGk=' }]);
});
it('never promotes external URLs, executable SVG or filesystem references to image sources', () => {
  const items = messageFiles({ content: [{ type: 'image', mimeType: 'image/png', url: 'https://tracker.example/secret' }, { type: 'image', mimeType: 'image/svg+xml', data: 'aGk=' }, { type: 'file', fileName: 'local', path: 'C:/private.txt' }] });
  expect(items.every((item) => !item.imageData)).toBe(true);
  expect(JSON.stringify(items)).not.toContain('private.txt');
  expect(JSON.stringify(items)).not.toContain('tracker.example');
});
it('handles multi-megabyte base64 without recursive regular-expression backtracking', () => {
  const content = Buffer.alloc(4 * 1024 * 1024).toString('base64');
  const files = parseAttachments([{ fileName: 'image.png', mimeType: 'image/png', content }], { maxBytes: 6 * 1024 * 1024, maxImageBytes: 6 * 1024 * 1024, maxPayload: 8 * 1024 * 1024 });
  expect(messageFiles({ attachments: files })[0].imageData?.length).toBe(content.length + 'data:image/png;base64,'.length);
});
