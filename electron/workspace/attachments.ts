import { bounded } from './service';
import { isRecord } from '../gateway/validation';
export function parseAttachments(value: unknown, limits: { maxBytes: number; maxImageBytes: number; maxPayload: number }) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('INVALID_ATTACHMENTS');
  let encodedSize = 0;
  return value.map((attachment: unknown) => {
    if (!isRecord(attachment) || Object.keys(attachment).some((key) => !['fileName', 'mimeType', 'content'].includes(key))) throw new Error('INVALID_ATTACHMENT');
    const fileName = bounded(attachment.fileName, 512); const mimeType = bounded(attachment.mimeType, 128);
    if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mimeType)) throw new Error('INVALID_MIME_TYPE');
    const content = bounded(attachment.content, limits.maxPayload, true);
    if (content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('INVALID_BASE64');
    encodedSize += content.length;
    if (encodedSize > limits.maxPayload) throw new Error('ATTACHMENTS_TOO_LARGE');
    const bytes = Buffer.byteLength(content, 'base64');
    if (bytes > (mimeType.startsWith('image/') ? limits.maxImageBytes : limits.maxBytes)) throw new Error('ATTACHMENT_TOO_LARGE');
    return { type: mimeType.startsWith('image/') ? 'image' : 'file', fileName, mimeType, content, sizeBytes: bytes };
  });
}
