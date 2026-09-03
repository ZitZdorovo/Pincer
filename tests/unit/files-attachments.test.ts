import { expect, it, vi } from 'vitest';
import { WorkspaceFilesService } from '../../electron/workspace/files';
import { parseAttachments } from '../../electron/workspace/attachments';
it('enforces decoded image size and total encoded payload size', () => {
  const file = { fileName: 'file.png', mimeType: 'image/png', content: Buffer.alloc(12).toString('base64') };
  expect(() => parseAttachments([file], { maxBytes: 20, maxImageBytes: 10, maxPayload: 100 })).toThrow('ATTACHMENT_TOO_LARGE');
  expect(() => parseAttachments([{ ...file, mimeType: 'text/plain' }, { ...file, mimeType: 'text/plain' }], { maxBytes: 20, maxImageBytes: 10, maxPayload: 24 })).toThrow('ATTACHMENTS_TOO_LARGE');
});
it('rejects extra attachment fields, invalid base64 and forged sizes', () => {
  const limits = { maxBytes: 100, maxImageBytes: 100, maxPayload: 1000 };
  expect(() => parseAttachments([{ fileName: 'x', mimeType: 'text/plain', content: '!!' }], limits)).toThrow('INVALID_BASE64');
  expect(() => parseAttachments([{ fileName: 'x', mimeType: 'text/plain', content: 'YQ==', sizeBytes: 0 }], limits)).toThrow('INVALID_ATTACHMENT');
  expect(parseAttachments([{ fileName: 'x', mimeType: 'text/plain', content: 'YQ==' }], limits)[0].sizeBytes).toBe(1);
});
it('passes expectedHash to the Gateway and does not hide server save failures', async () => {
  const request = vi.fn(async (): Promise<unknown> => ({ ok: false })); const service = new WorkspaceFilesService({ operatorRequest: request });
  await expect(service.save('session', 'README.md', 'edit', 'a'.repeat(64))).rejects.toThrow('FILE_SAVE_FAILED');
  expect(request).toHaveBeenCalledWith('sessions.files.set', { sessionKey: 'session', path: 'README.md', content: 'edit', expectedHash: 'a'.repeat(64) });
  await expect(service.save('session', 'README.md', 'edit', 'invalid')).rejects.toThrow('INVALID_INPUT');
});
