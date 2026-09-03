// Original OpenX ChatToolbar presentation, with Pincer callbacks.
import { useEffect, useRef, useState } from 'react';
import { Bot, Check, ChevronDown, FolderTree } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';
export function ChatToolbar({ agents, currentAgentId, selectedAgentId, workspaceAvailable, openBrowser, onAgent, browserActive = false, disabled = false }: { agents: { id: string; name: string }[]; currentAgentId: string; selectedAgentId?: string; workspaceAvailable: boolean; openBrowser(): void; onAgent(id: string | null): void; browserActive?: boolean; disabled?: boolean }) {
 const { t, i18n } = useTranslation('chat'); const ru = i18n.language.startsWith('ru');
 const WORKSPACE_BROWSER_ENABLED = true;
 const closePanel = openBrowser;
 const [open, setOpen] = useState(false); const root = useRef<HTMLDivElement>(null);
 const effectiveId = selectedAgentId || currentAgentId; const effective = agents.find((agent) => agent.id === effectiveId); const label = effective?.name || effectiveId || 'main';
 useEffect(() => { const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); }; window.addEventListener('pointerdown', close); window.addEventListener('keydown', escape); return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape); }; }, []);
  return (
    <div className="flex items-center gap-2">
      <div ref={root} className="relative hidden sm:block">
        <button type="button" data-testid="chat-header-agent" aria-expanded={open} aria-label={ru ? `Действующий агент: ${label}` : `Active agent: ${label}`} disabled={disabled || agents.length < 2} onClick={() => setOpen((value) => !value)} className="flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-black/5 disabled:opacity-80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
          <Bot className="h-3.5 w-3.5 text-primary" /><span>{label}</span>{agents.length > 1 && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </button>
        {open && <div data-testid="chat-header-agent-menu" className="absolute right-0 top-full z-50 mt-1 min-w-56 rounded-xl border border-border bg-surface-modal p-1.5 shadow-xl"><p className="px-2.5 py-1.5 text-[11px] text-muted-foreground">{ru ? 'Действующий агент' : 'Active agent'}</p>{agents.map((agent) => <button key={agent.id} type="button" onClick={() => { onAgent(agent.id === currentAgentId ? null : agent.id); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"><Bot className="h-4 w-4 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{agent.name}</span>{agent.id === effectiveId && <Check className="h-4 w-4 text-primary" />}</button>)}</div>}
      </div>
      {WORKSPACE_BROWSER_ENABLED && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid="chat-toolbar-workspace"
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10',
                browserActive && 'bg-foreground/10 text-foreground',
              )}
              onClick={() => (browserActive ? closePanel() : openBrowser())}
              disabled={!workspaceAvailable}
              aria-label={t('toolbar.workspace')}
            >
              <FolderTree className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('toolbar.workspace')}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
