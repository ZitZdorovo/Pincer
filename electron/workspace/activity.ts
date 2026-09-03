import type { ActivityBlock } from '../../shared/contract';

/** Reconcile cumulative text snapshots from the two Gateway event streams. */
export function activityText(blocks: ActivityBlock[], text: string): void {
  if (!text) return;
  const last = blocks.at(-1);
  const previousText = blocks.findLast(block => block.kind === 'text');
  if (last?.kind === 'text') {
    if (last.text === text || last.text.endsWith(text)) return;
    // A chat snapshot can contain commentary already split by tool events.
    const prefix = blocks.slice(0, -1).filter(b => b.kind === 'text').map(b => b.text).join('\n\n');
    last.text = prefix && text.startsWith(prefix) ? text.slice(prefix.length).trimStart() : text;
  } else {
    if (previousText?.kind === 'text' && previousText.text === text) return;
    const prefix = blocks.filter(b => b.kind === 'text').map(b => b.text).join('\n\n');
    const next = prefix && text.startsWith(prefix) ? text.slice(prefix.length).trimStart() : text;
    if (next) blocks.push({ kind: 'text', text: next });
  }
}
