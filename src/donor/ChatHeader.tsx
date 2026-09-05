// Original OpenX chat title/menu markup. Session operations use Pincer's typed API.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, MoreHorizontal, Pin, Pencil, Copy } from 'lucide-react';
import { Input } from '../components/ui/input';
import { cn } from '../lib/utils';
import { ChatToolbar } from './ChatToolbar';
import type { ChatSession } from '../../shared/contract';
import { toast } from 'sonner';
export function ChatHeader({ session, agents, agentId, targetAgentId, connected, filesOpen, openFiles, onAgent, children }: { session?: ChatSession; agents: { id: string; name: string }[]; agentId: string; targetAgentId?: string; connected: boolean; filesOpen: boolean; openFiles(): void; onAgent(id: string | null): void; children?: ReactNode }) {
 const { t } = useTranslation('chat');
 const currentSession = { createdLocally: !session }; const isWindows = window.pincer.platform === 'win32';
 const currentSessionKey = session?.key || ''; const currentSessionTitle = session?.title || ''; const currentChatPinned = Boolean(session?.pinned);
 const [inlineEditingSessionTitle, setInlineEditingSessionTitle] = useState(false);
 const [sessionTitleDraft, setSessionTitleDraft] = useState('');
 const [titleMenuOpen, setTitleMenuOpen] = useState(false);
 const titleMenuRef = useRef<HTMLDivElement>(null); const titleEditSessionKeyRef = useRef<string | null>(null); const titleEditCancelledRef = useRef(false);
 const setEditingSessionTitle = setInlineEditingSessionTitle;
 useEffect(() => { const close = (event: PointerEvent) => { if (!titleMenuRef.current?.contains(event.target as Node)) setTitleMenuOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setTitleMenuOpen(false); }; window.addEventListener('pointerdown', close); window.addEventListener('keydown', escape); return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape); }; }, []);
 useEffect(() => { setTitleMenuOpen(false); setInlineEditingSessionTitle(false); }, [currentSessionKey]);
 const commitSessionTitle = async () => {
   const key = titleEditSessionKeyRef.current; titleEditSessionKeyRef.current = null; setInlineEditingSessionTitle(false);
   if (!key || titleEditCancelledRef.current || !sessionTitleDraft.trim()) return;
   const result = await window.pincer.chat.rename(key, sessionTitleDraft.trim()); if (!result.ok) toast.error(result.error.message);
 };
 const pinChat = async (key: string, pinned: boolean) => { const result = await window.pincer.chat.pin(key, pinned); if (!result.ok) toast.error(result.error.message); };
 return (
        <div className={cn(
          'relative flex shrink-0 items-center border-b border-border/55 px-4 py-2',
          isWindows && !currentSession?.createdLocally ? 'gap-4' : 'justify-end',
        )}>
          <div data-testid="chat-toolbar-drag-region" className="drag-region absolute inset-0 z-0" aria-hidden="true" />
          {isWindows && !currentSession?.createdLocally && (
            <div className="drag-region relative z-10 flex min-w-0 flex-1 items-center gap-1" ref={titleMenuRef}>
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {inlineEditingSessionTitle ? (
                <Input
                  autoFocus
                  data-testid="chat-session-title-input"
                  value={sessionTitleDraft}
                  className="no-drag h-7 min-w-[140px] max-w-[min(32rem,70vw)] rounded-lg border-border bg-surface-input px-2 py-1 text-sm font-medium shadow-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary focus-visible:ring-offset-0"
                  style={{ width: `${Math.min(512, Math.max(140, sessionTitleDraft.length * 8 + 28))}px` }}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setSessionTitleDraft(event.target.value)}
                  onBlur={() => void commitSessionTitle()}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      titleEditSessionKeyRef.current = null;
                      titleEditCancelledRef.current = true;
                      setSessionTitleDraft(currentSessionTitle || '');
                      setInlineEditingSessionTitle(false);
                    }
                    if (event.key === 'Enter') void commitSessionTitle();
                  }}
                />
              ) : (
                <h1
                  data-testid="chat-session-title"
                  title={currentSessionTitle}
                  onClick={() => {
                    if (!currentSessionKey) return;
                    setSessionTitleDraft(currentSessionTitle || '');
                    titleEditSessionKeyRef.current = currentSessionKey;
                    titleEditCancelledRef.current = false;
                    setInlineEditingSessionTitle(true);
                  }}
                  className="no-drag inline-flex max-w-[min(32rem,70vw)] cursor-text truncate rounded px-1.5 py-1 text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                >
                  {currentSessionTitle}
                </h1>
              )}
              <button
                type="button"
                data-testid="chat-title-menu-button"
                className="no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                aria-label={t('titleMenu.open')}
                title={t('titleMenu.open')}
                onClick={() => setTitleMenuOpen((open) => !open)}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {titleMenuOpen && (
                <div className="no-drag absolute left-5 top-full z-50 mt-1 w-64 rounded-xl border border-black/10 bg-surface-modal p-1.5 text-sm shadow-xl dark:border-white/10" data-testid="chat-title-menu">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-foreground/85 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                    onClick={() => {
                      if (currentSessionKey) void pinChat(currentSessionKey, !currentChatPinned);
                      setTitleMenuOpen(false);
                    }}
                  >
                    <Pin className="h-4 w-4" />
                    {t(currentChatPinned ? 'titleMenu.unpin' : 'titleMenu.pin')}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-foreground/85 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                    onClick={() => {
                      setSessionTitleDraft(currentSessionTitle || '');
                      titleEditSessionKeyRef.current = currentSessionKey;
                      titleEditCancelledRef.current = false;
                      setEditingSessionTitle(true);
                      setTitleMenuOpen(false);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    {t('titleMenu.rename')}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-foreground/85 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                    onClick={() => {
                      void navigator.clipboard.writeText(currentSessionTitle || '').catch((error) => toast.error(String(error)));
                      toast.success(t('titleMenu.copied'));
                      setTitleMenuOpen(false);
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    {t('titleMenu.copy')}
                  </button>
                </div>
              )}
            </div>
          )}
          <div data-testid="chat-toolbar-actions" className="no-drag relative z-10 flex items-center">
            <ChatToolbar agents={agents} currentAgentId={agentId} selectedAgentId={targetAgentId} onAgent={onAgent} disabled={!connected || Boolean(session?.activeRunId)} workspaceAvailable={connected && Boolean(session)} openBrowser={openFiles} browserActive={filesOpen} />
          </div>
{children}
</div>
);
}
