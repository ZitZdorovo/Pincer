// OpenX message presentation; no ACP client, runtime or state store.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Download, Minus, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Streamdown, type Components } from 'streamdown';
import { streamdownAnimation, streamdownControls, streamdownLinkSafety, streamdownPlugins, streamdownRehypePlugins } from './streamdown-config';
import type { ChatMessage, ActivityBlock, ToolCall } from '../../shared/contract';
import { ToolActivity, CompactionActivity, ResponseStats } from './ToolActivity';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { MaterialFileIcon } from './MaterialFileIcon';
const safeAcpImageSource = (src: string) => /^data:image\/(png|jpeg|gif|webp);base64,/i.test(src);
const tLink = () => document.documentElement.lang === 'ru' ? 'Ссылка скопирована' : 'Link copied';


const chatRemend = { linkMode: 'text-only' } as const;

function AcpMarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const { t } = useTranslation('chat');
  const imageSource = typeof src === 'string' ? src : '';
  if (!imageSource || !safeAcpImageSource(imageSource)) return null;

  return (
    <img
      src={imageSource}
      alt={typeof alt === 'string' ? alt : t('acp.image')}
      className="max-w-full rounded-lg"
    />
  );
}

const chatMarkdownComponents: Components = {
  strong: ({ children }) => (
    <strong className="font-semibold" data-streamdown="strong">
      {children}
    </strong>
  ),
  a: ({ href, children }) => href ? (
    <button type="button" onClick={() => void navigator.clipboard.writeText(href).then(() => toast.info(tLink())).catch((error) => toast.error(String(error)))} className="break-all text-left text-primary hover:underline">
      {children}
    </button>
  ) : <>{children}</>,
  img: ({ src, alt }) => (
    <AcpMarkdownImage
      src={typeof src === 'string' ? src : undefined}
      alt={typeof alt === 'string' ? alt : undefined}
    />
  ),
  inlineCode: ({ children }) => (
    <code className="break-all font-mono text-[14px]">
      {children}
    </code>
  ),
};

function normalizeLatexDelimiters(input: string): string {
  if (!input || (input.indexOf('\\(') === -1 && input.indexOf('\\[') === -1)) return input;

  const parts = input.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part || part.startsWith('```') || part.startsWith('`')) continue;
    let next = part.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `\n$$\n${body.trim()}\n$$\n`);
    next = next.replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => `$${body}$`);
    parts[i] = next;
  }
  return parts.join('');
}

export function DonorMarkdown({ text, isAnimating = false }: { text: string; isAnimating?: boolean }) {
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const translations = useMemo(() => ({
    copyCode: t('markdown.copyCode'),
  }), [t]);

  useEffect(() => {
    if (isAnimating) return;

    for (const element of containerRef.current?.querySelectorAll<HTMLElement>('[data-sd-animate]') ?? []) {
      element.removeAttribute('data-sd-animate');
      element.style.removeProperty('--sd-animation');
      element.style.removeProperty('--sd-duration');
      element.style.removeProperty('--sd-easing');
      element.style.removeProperty('--sd-delay');
      if (!element.style.length) element.removeAttribute('style');
    }
  }, [isAnimating]);

  useEffect(() => {
    if (isAnimating) return;
    const root = containerRef.current;
    if (!root) return;
    const prepare = () => {
      for (const block of root.querySelectorAll<HTMLElement>('[data-streamdown="code-block"]')) {
        const body = block.querySelector<HTMLElement>('[data-streamdown="code-block-body"]');
        if (!body || body.scrollHeight <= 360 || block.querySelector('[data-testid="code-expand"]')) continue;
        block.classList.add('openx-code-collapsed');
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.testid = 'code-expand'; button.className = 'openx-code-expand';
        const update = () => { button.textContent = block.classList.contains('openx-code-collapsed') ? (document.documentElement.lang === 'ru' ? 'Развернуть код' : 'Expand code') : (document.documentElement.lang === 'ru' ? 'Свернуть код' : 'Collapse code'); };
        button.addEventListener('click', () => { block.classList.toggle('openx-code-collapsed'); update(); });
        update(); block.append(button);
      }
    };
    const frame = requestAnimationFrame(prepare);
    const observer = new MutationObserver(prepare); observer.observe(root, { childList: true, subtree: true });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [isAnimating, text]);

  return (
    <div ref={containerRef} className="contents">
      <Streamdown
        animated={isAnimating ? streamdownAnimation : false}
        className="openx-markdown openx-streamdown openx-readable-text prose prose-sm max-w-none break-words text-[14px] leading-[1.55] text-foreground dark:prose-invert"
        components={chatMarkdownComponents}
        controls={streamdownControls}
        isAnimating={isAnimating}
        lineNumbers={false}
        linkSafety={streamdownLinkSafety}
        mode="streaming"
        parseIncompleteMarkdown={isAnimating}
        plugins={streamdownPlugins}
        rehypePlugins={streamdownRehypePlugins}
        remend={isAnimating ? chatRemend : undefined}
        translations={translations}
      >
        {normalizeLatexDelimiters(text)}
      </Streamdown>
    </div>
  );
}


export function ActivityStream({ blocks, tools = [], live = false }: { blocks: ActivityBlock[]; tools?: ToolCall[]; live?: boolean }) {
 const firstToolIndex = blocks.findIndex((block) => block.kind === 'tool');
 const streamedTools = blocks
   .filter((block): block is Extract<ActivityBlock, { kind: 'tool' }> => block.kind === 'tool')
   .map((block) => tools.find((tool) => tool.id === block.toolId))
   .filter((tool): tool is ToolCall => Boolean(tool));
 return <div data-testid="activity-stream" className="w-full space-y-5">{blocks.map((block, i) => {
   if (block.kind === 'text') return <div key={i} data-activity-kind="text"><DonorMarkdown text={block.text} isAnimating={live && i === blocks.length - 1} /></div>;
   if (block.kind === 'compaction') return <CompactionActivity key={block.id} phase={block.phase} />;
   return i === firstToolIndex && streamedTools.length ? <ToolActivity key="tool-group" tools={streamedTools} live={live} /> : null;
 })}</div>;
}
function openInlineFile(file: NonNullable<ChatMessage['files']>[number]) {
 const bytes = Uint8Array.from(atob(file.data || ''), (character) => character.charCodeAt(0));
 const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType || 'application/octet-stream' }));
 const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
 window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
type Attachment = NonNullable<ChatMessage['files']>[number];
function canSave(file: Attachment) { return Boolean((file.artifactId && file.downloadMode !== 'unsupported') || file.data); }

export function DonorMessage({ message, suppressStats = false }: { message: ChatMessage; suppressStats?: boolean }) {
 const { t } = useTranslation('chat'); const [copied, setCopied] = useState(false); const isUser = message.role === 'user';
 const [previewIndex, setPreviewIndex] = useState<number | null>(null);
 const [zoom, setZoom] = useState(100);
 const images = (message.files || []).filter((file) => file.imageData && safeAcpImageSource(file.imageData));
 const documents = (message.files || []).filter((file) => !file.imageData || !safeAcpImageSource(file.imageData));
 const previewFile = previewIndex === null ? undefined : images[previewIndex];
 const downloadFile = (file: Attachment) => {
   if (file.artifactId && file.downloadMode !== 'unsupported') {
     void window.pincer.chat.saveArtifact(file.artifactId).then((result) => { if (!result.ok) toast.error(result.error.message); }).catch((error) => toast.error(String(error)));
   } else if (file.data) openInlineFile(file);
 };
 const showImage = (index: number) => { setZoom(100); setPreviewIndex(index); };
 const moveImage = (step: number) => { setZoom(100); setPreviewIndex((index) => index === null ? null : (index + step + images.length) % images.length); };
 const userAttachments = isUser && message.files?.length ? <div className="flex w-full flex-wrap items-start justify-end gap-2" data-testid="message-attachments">{message.files.map((file, index) => {
   const imageIndex = images.indexOf(file);
   if (imageIndex >= 0) return <div key={file.artifactId || `${file.name}-${index}`} className="group/image relative h-20 w-20 shrink-0"><button type="button" data-testid="message-attachment" data-image-thumbnail="true" title={file.name} aria-label={t('attachments.preview', { name: file.name })} onClick={() => showImage(imageIndex)} className="h-full w-full overflow-hidden rounded-xl border border-border/70 bg-surface-input"><img src={file.imageData} alt={file.name} className="h-full w-full object-contain" /></button>{canSave(file) && <button type="button" data-testid="image-thumbnail-download" aria-label={t('attachments.downloadNamed', { name: file.name })} onClick={() => downloadFile(file)} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-black/65 text-white opacity-0 transition-opacity group-hover/image:opacity-100 group-focus-within/image:opacity-100"><Download className="h-4 w-4" /></button>}</div>;
   const extension = file.name.split('.').at(-1)?.toUpperCase() || t('attachments.file');
   const size = typeof file.sizeBytes === 'number' ? file.sizeBytes >= 1024 * 1024 ? t('attachments.sizeMb', { size: (file.sizeBytes / 1024 / 1024).toFixed(1) }) : t('attachments.sizeKb', { size: Math.max(1, Math.round(file.sizeBytes / 1024)) }) : '';
   return <div key={file.artifactId || `${file.name}-${index}`} data-testid="message-document" className="relative flex h-20 w-28 shrink-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-surface-input"><span className="flex min-h-0 flex-1 items-center justify-center bg-background/40"><MaterialFileIcon filename={file.name} className="h-8 w-8" /></span><span className="min-w-0 px-1.5 py-1 pr-6"><span className="block truncate text-2xs font-medium" title={file.name}>{file.name}</span><span className="block truncate text-2xs text-muted-foreground">{extension}{size ? ` · ${size}` : ''}</span></span><button type="button" data-testid="message-attachment" aria-label={t('attachments.downloadNamed', { name: file.name })} disabled={!canSave(file)} onClick={() => downloadFile(file)} className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"><Download className="h-3.5 w-3.5" /></button></div>;
 })}</div> : null;
 const attachments = message.files?.length ? <div className={`${isUser ? 'max-w-full' : 'w-full'} space-y-3`} data-testid="message-attachments">
   {images.length > 0 && <div className="flex max-w-full flex-wrap items-start gap-2.5" data-testid="message-image-gallery">{images.map((file, index) =>
     <div key={file.artifactId || `${file.name}-${index}`} className="group/image relative w-36 shrink-0 sm:w-40">
       <button type="button" data-testid="message-attachment" data-image-thumbnail="true" className="block w-full overflow-hidden rounded-xl border border-border/70 bg-surface-input transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" title={file.name} aria-label={t('attachments.preview', { name: file.name })} onClick={() => showImage(index)}>
         <img src={file.imageData} alt={file.name} className="block h-auto max-h-56 w-full object-contain transition-transform duration-200 group-hover/image:scale-[1.03]" />
       </button>
       {canSave(file) && <button type="button" data-testid="image-thumbnail-download" aria-label={t('attachments.downloadNamed', { name: file.name })} title={t('attachments.download')} onClick={() => downloadFile(file)} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-black/65 text-white shadow-sm transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Download className="h-4 w-4" /></button>}
     </div>)}</div>}
   {documents.length > 0 && <div className={`flex max-w-xl flex-col gap-2 ${isUser ? 'items-end' : 'w-full'}`} data-testid="message-document-list">{documents.map((file, index) => {
     const extension = file.name.split('.').at(-1)?.toUpperCase() || t('attachments.file');
     const size = typeof file.sizeBytes === 'number' ? file.sizeBytes >= 1024 * 1024 ? t('attachments.sizeMb', { size: (file.sizeBytes / 1024 / 1024).toFixed(1) }) : t('attachments.sizeKb', { size: Math.max(1, Math.round(file.sizeBytes / 1024)) }) : '';
     return <div key={file.artifactId || `${file.name}-${index}`} data-testid="message-document" className={`flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-surface-input px-3 py-2.5 ${isUser ? 'max-w-full w-fit' : 'w-full'}`}>
       <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-background/70"><MaterialFileIcon filename={file.name} className="h-7 w-7" /></span>
       <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground" title={file.name}>{file.name}</p><p className="text-xs text-muted-foreground">{extension}{size ? ` · ${size}` : ''}</p></div>
       <button type="button" data-testid="message-attachment" aria-label={t('attachments.downloadNamed', { name: file.name })} title={t('attachments.download')} disabled={!canSave(file)} onClick={() => downloadFile(file)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-4 w-4" /></button>
     </div>;
   })}</div>}
 </div> : null;
 return <><div data-testid={isUser ? 'acp-user-message' : 'acp-assistant-message'} className={`openx-copy-surface group flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
  <div className={`flex min-w-0 flex-col gap-2 ${isUser ? 'w-full max-w-[82%] items-end' : 'w-full items-start'}`}>
   {userAttachments}
   {!isUser && message.activity?.length ? <ActivityStream blocks={message.activity} tools={message.tools} /> : <>
   {!!message.tools?.length && <ToolActivity tools={message.tools} />}
   {message.text && (isUser ? <div data-testid="user-message-bubble" className="rounded-2xl bg-surface-input px-4 py-2.5 text-foreground"><p className="openx-readable-text whitespace-pre-wrap break-words">{message.text}</p></div> : <DonorMarkdown text={message.text} />)}
   </>}
   {!isUser && attachments}
   {!isUser && !suppressStats && <ResponseStats message={message} />}
   {!isUser && message.text && <div className="flex w-full justify-start px-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"><button type="button" data-testid="acp-assistant-copy" aria-label={copied ? t('acp.copied') : t('acp.copy')} onClick={() => void navigator.clipboard.writeText(message.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch((error) => toast.error(String(error)))} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-white/10">{copied ? <Check className="h-3.5 w-3.5 text-green-700 dark:text-green-400" /> : <Copy className="h-3.5 w-3.5" />}</button></div>}
  </div>
 </div><Dialog open={Boolean(previewFile)} onOpenChange={(open) => { if (!open) setPreviewIndex(null); }}><DialogContent className="pincer-image-lightbox" overlayClassName="pincer-image-lightbox-overlay" onClick={(event) => { if (event.target === event.currentTarget) setPreviewIndex(null); }} onWheel={(event) => { event.preventDefault(); setZoom((value) => Math.max(50, Math.min(300, value + (event.deltaY < 0 ? 25 : -25)))); }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' && images.length > 1) { event.preventDefault(); moveImage(-1); } else if (event.key === 'ArrowRight' && images.length > 1) { event.preventDefault(); moveImage(1); } }}>
   <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 bg-gradient-to-b from-black/70 to-transparent px-4 py-4 text-white sm:px-6">
     <div className="min-w-0"><DialogTitle className="truncate text-sm font-medium" title={previewFile?.name}>{previewFile?.name}</DialogTitle><p className="text-xs text-white/60">{t('attachments.position', { current: (previewIndex ?? 0) + 1, total: images.length })}</p></div>
     <div className="flex shrink-0 items-center gap-1"><button type="button" data-testid="image-download" aria-label={t('attachments.download')} title={t('attachments.download')} disabled={!previewFile || !canSave(previewFile)} onClick={() => { if (previewFile) downloadFile(previewFile); }} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40"><Download className="h-5 w-5" /></button><button type="button" aria-label={t('attachments.closePreview')} onClick={() => setPreviewIndex(null)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"><X className="h-5 w-5" /></button></div>
   </div>
   {images.length > 1 && <><button type="button" aria-label={t('attachments.previous')} onClick={() => moveImage(-1)} className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-white/20"><ChevronLeft className="h-6 w-6" /></button><button type="button" aria-label={t('attachments.next')} onClick={() => moveImage(1)} className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-white/20"><ChevronRight className="h-6 w-6" /></button></>}
   <div className="pointer-events-none flex h-full w-full items-center justify-center overflow-hidden px-14 pb-16 pt-20 sm:px-20" data-testid="image-preview">{previewFile?.imageData && <img src={previewFile.imageData} alt={previewFile.name} className="block max-h-full max-w-full object-contain" style={{ transform: `scale(${zoom / 100})` }} />}</div>
   <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/65 p-1 text-white shadow-lg"><button type="button" aria-label={t('attachments.zoomOut')} disabled={zoom <= 50} onClick={() => setZoom((value) => Math.max(50, value - 25))} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-40"><Minus className="h-4 w-4" /></button><span className="min-w-12 text-center text-xs tabular-nums">{zoom}%</span><button type="button" aria-label={t('attachments.zoomIn')} disabled={zoom >= 300} onClick={() => setZoom((value) => Math.min(300, value + 25))} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-40"><Plus className="h-4 w-4" /></button></div>
 </DialogContent></Dialog></>;
}
