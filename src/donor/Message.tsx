// OpenX message presentation; no ACP client, runtime or state store.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Streamdown, type Components } from 'streamdown';
import { streamdownAnimation, streamdownControls, streamdownLinkSafety, streamdownPlugins, streamdownRehypePlugins } from './streamdown-config';
import type { ChatMessage, ActivityBlock, ToolCall } from '../../shared/contract';
import { ToolActivity, CompactionActivity, ResponseStats } from './ToolActivity';
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
export function DonorMessage({ message }: { message: ChatMessage }) {
 const { t } = useTranslation('chat'); const [copied, setCopied] = useState(false); const isUser = message.role === 'user';
 return <div data-testid={isUser ? 'acp-user-message' : 'acp-assistant-message'} className={`openx-copy-surface group flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
  <div className={`flex min-w-0 flex-col gap-2 ${isUser ? 'w-fit max-w-[82%] items-end' : 'w-full items-start'}`}>
   {!isUser && message.activity?.length ? <ActivityStream blocks={message.activity} tools={message.tools} /> : <>
   {!!message.tools?.length && <ToolActivity tools={message.tools} />}
   {message.text && (isUser ? <div className="rounded-2xl bg-surface-input px-4 py-2.5 text-foreground"><p className="openx-readable-text whitespace-pre-wrap break-words">{message.text}</p></div> : <DonorMarkdown text={message.text} />)}
   </>}
   {message.files?.map((file, index) => <div key={index} className="max-w-full rounded-xl border border-border/60 bg-surface-input px-3 py-2">{file.imageData && safeAcpImageSource(file.imageData) && <img src={file.imageData} alt={file.name} className="max-h-64 max-w-full rounded-lg" />}<p className="break-all text-xs text-muted-foreground">{file.name}</p></div>)}
   {!isUser && <ResponseStats message={message} />}
   {!isUser && message.text && <div className="flex w-full justify-start px-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"><button type="button" data-testid="acp-assistant-copy" aria-label={copied ? t('acp.copied') : t('acp.copy')} onClick={() => void navigator.clipboard.writeText(message.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch((error) => toast.error(String(error)))} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-white/10">{copied ? <Check className="h-3.5 w-3.5 text-green-700 dark:text-green-400" /> : <Copy className="h-3.5 w-3.5" />}</button></div>}
  </div>
 </div>;
}
