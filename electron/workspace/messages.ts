import type { MessageFile } from '../../shared/contract';
import { isRecord } from '../gateway/validation';
const raster = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']);
/** Only inline raster bytes may become a preview; never load URLs, SVG or local paths from a transcript. */
export function messageFiles(message: unknown): MessageFile[] {
  if (!isRecord(message)) return [];
  const parts = [...(Array.isArray(message.content) ? message.content : []), ...(Array.isArray(message.attachments) ? message.attachments : [])];
  const files: MessageFile[] = [];
  for (const part of parts) {
    if (!isRecord(part)) continue;
    const attachmentLike = typeof part.fileName === 'string' && typeof part.mimeType === 'string';
    if (!attachmentLike && !['image', 'file', 'document', 'input_image', 'input_file'].includes(String(part.type))) continue;
    const source = isRecord(part.source) ? part.source : {};
    const mimeType = typeof part.mimeType === 'string' ? part.mimeType : typeof source.media_type === 'string' ? source.media_type : '';
    const name = typeof part.fileName === 'string' ? part.fileName : typeof part.name === 'string' ? part.name : mimeType.startsWith('image/') || part.type === 'image' ? 'Image' : 'File';
    const data = typeof part.data === 'string' ? part.data : source.type === 'base64' && typeof source.data === 'string' ? source.data : typeof part.content === 'string' ? part.content : '';
    const validImage = raster.has(mimeType) && data.length > 0 && data.length <= 8 * 1024 * 1024 && data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(data);
    files.push({ name: name.slice(0, 256), mimeType: mimeType.slice(0, 128), ...(validImage ? { imageData: `data:${mimeType};base64,${data}` } : {}) });
  }
  return files;
}
