import { expect, it } from 'vitest';
import { isTrustedRendererUrl } from '../../electron/renderer-origin';
const expected = 'file:///C:/Pincer/dist/index.html';
it('allows only fragment navigation within the exact trusted document', () => {
  for (const hash of ['', '#/', '#/settings?section=chat', '#/agents']) expect(isTrustedRendererUrl(expected + hash, expected)).toBe(true);
  for (const url of ['https://example.com/#/settings', 'file:///C:/Pincer/dist/other.html', expected + '?x=1', 'file:///C:/Pincer/dist/index.html.evil', 'not a URL']) expect(isTrustedRendererUrl(url, expected)).toBe(false);
});
