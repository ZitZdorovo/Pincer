import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SentFiles } from '../../electron/workspace/sent-files';
import { projectTranscript } from '../../electron/workspace/transcript';

describe('sent attachment recovery', () => {
  it('keeps a user turn identity when Gateway drops attachment metadata', () => {
    const withFiles = projectTranscript([{ role: 'user', text: 'hello', timestamp: 1234, attachments: [{ fileName: 'a.txt', mimeType: 'text/plain', content: 'aGk=' }] }]);
    const withoutFiles = projectTranscript([{ role: 'user', text: 'hello', timestamp: 1234 }]);
    expect(withFiles[0].turnKey).toBe(withoutFiles[0].turnKey);
  });
  it('restores uploaded bytes to the right history turn after encrypted reload', () => {
    const folder = mkdtempSync(join(tmpdir(), 'pincer-sent-'));
    const path = join(folder, 'sent-files.vault');
    const storage = { path, cipher: { encrypt: (text: string) => Buffer.from(text), decrypt: (data: Buffer) => data.toString('utf8') } };
    const scope = 'a'.repeat(64);
    try {
      const files = [{ name: 'pixel.png', mimeType: 'image/png', data: 'aGk=', imageData: 'data:image/png;base64,aGk=' }];
      new SentFiles(storage).remember(scope, 'chat-1', 'same text', files, 1);
      const history = [{ role: 'user', text: 'same text', turnKey: 'old' }, { role: 'user', text: 'same text', turnKey: 'new' }];
      const restored = new SentFiles(storage).restore(scope, 'chat-1', history);
      expect(restored[0].files).toBeUndefined();
      expect(restored[1].files).toEqual(files);
      expect(new SentFiles(storage).restore('b'.repeat(64), 'chat-1', [{ role: 'user', text: 'same text', turnKey: 'new' }])[0].files).toBeUndefined();
    } finally {
      unlinkSync(path);
      rmdirSync(folder);
    }
  });
});
