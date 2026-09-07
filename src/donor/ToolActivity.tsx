import { useEffect, useId, useState } from 'react';
import { CheckCircle2, ChevronDown, CircleX, FoldVertical, ListTree, Loader2, Puzzle, TerminalSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage, ToolCall, RunPhase } from '../../shared/contract';
export function elapsedLabel(milliseconds: number, ru: boolean): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds < 60 ? `${seconds} ${ru ? 'с' : 's'}` : `${Math.floor(seconds / 60)} ${ru ? 'мин' : 'min'} ${seconds % 60} ${ru ? 'с' : 's'}`;
}
export function RunStatus({ startedAt, phase = 'starting' }: { startedAt?: number; phase?: RunPhase }) {
  const { i18n } = useTranslation(); const ru = i18n.language.startsWith('ru'); const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <div role="status" data-testid="chat-run-status" data-phase={phase} className="mb-4 border-b border-border/60 pb-2 text-[13px] leading-5 text-muted-foreground">{ru ? 'Работает уже' : 'Working for'}{startedAt !== undefined ? ` ${elapsedLabel(now - startedAt, ru)}` : '…'}</div>;
}
export function ResponseStats({ message }: { message: ChatMessage }) {
  const { i18n } = useTranslation(); const ru = i18n.language.startsWith('ru'); const pieces: string[] = [];
  if (message.durationMs !== undefined) pieces.push(elapsedLabel(message.durationMs, ru));
  if (message.usage?.output !== undefined) pieces.push(`${message.usage.output.toLocaleString(ru ? 'ru-RU' : 'en-US')} ${ru ? 'выходных токенов' : 'output tokens'}`);
  if (!pieces.length) return null;
  return <div data-testid="response-stats" className="mt-1 text-[11px] text-muted-foreground">{pieces.join(' · ')}</div>;
}
const commandTool = (tool: ToolCall) => /^(exec|bash|shell|system\.run|terminal)$/.test(tool.name);
const toolLabel = (name: string) => name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
function inputSummary(input: string) {
  try { const raw = JSON.parse(input); const value = raw?.command || raw?.sessionKey || raw?.path || raw?.query || raw?.url; return typeof value === 'string' ? value : input.split('\n')[0]; } catch { return input.split('\n')[0]; }
}
function ToolStatusIcon({ status, ru }: { status: ToolCall['status']; ru: boolean }) {
  const label = status === 'running' ? ru ? 'Выполняется' : 'Running' : status === 'failed' ? ru ? 'Ошибка' : 'Failed' : ru ? 'Готово' : 'Completed';
  return <span role="status" aria-label={label} title={label} data-tool-status={status} className={`ml-auto inline-flex shrink-0 items-center justify-center ${status === 'failed' ? 'text-destructive' : status === 'completed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{status === 'running' ? <Loader2 size={13} className="animate-spin" /> : status === 'failed' ? <CircleX size={13} /> : <CheckCircle2 size={13} />}</span>;
}
export function CompactionActivity({ phase }: { phase: 'running' | 'completed' | 'failed' }) {
  const { i18n } = useTranslation(); const ru = i18n.language.startsWith('ru');
  return <div data-testid="compaction-activity" data-phase={phase} role="status" className="flex items-center gap-2 py-1 text-[13px] text-muted-foreground"><FoldVertical size={14} className={phase === 'running' ? 'animate-pulse' : ''} /><span>{phase === 'running' ? ru ? 'Сжатие контекста…' : 'Compacting context…' : phase === 'completed' ? ru ? 'Беседа оптимизирована' : 'Conversation optimized' : ru ? 'Не удалось сжать контекст' : 'Context compaction failed'}</span></div>;
}
export function ToolActivity({ tools, live = false }: { tools: ToolCall[]; live?: boolean }) {
  const { i18n } = useTranslation(); const ru = i18n.language.startsWith('ru');
  const disclosureId = useId(); const [activityOpen, setActivityOpen] = useState(false); const [openTools, setOpenTools] = useState<Set<string>>(() => new Set());
  const commands = tools.filter(commandTool).length;
  const others = new Map<string, number>(); for (const tool of tools.filter((t) => !commandTool(t))) others.set(tool.name, (others.get(tool.name) || 0) + 1);
  const summary = [commands ? `${ru ? 'Выполнено команд' : 'Commands'}: ${commands}` : '', ...[...others].map(([name, count]) => `${toolLabel(name)} ×${count}`)].filter(Boolean).join(', ');
  const toggleTool = (id: string) => setOpenTools((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <div data-live={live || undefined} data-testid="tool-activity" className="w-full text-xs text-muted-foreground">
    <button type="button" aria-expanded={activityOpen} aria-controls={`${disclosureId}-list`} onClick={() => setActivityOpen((open) => !open)} className="flex min-h-7 w-full cursor-pointer items-center gap-2 py-1 text-left hover:text-foreground"><ListTree size={14} className="shrink-0" /><span className="min-w-0 truncate">{summary}</span><ChevronDown size={12} className={`shrink-0 transition-transform ${activityOpen ? 'rotate-0' : '-rotate-90'}`} /></button>
    <div id={`${disclosureId}-list`} hidden={!activityOpen} className="relative isolate ml-[22px] mt-1 max-h-[440px] flex-col gap-0.5 overflow-y-auto pr-1 data-[open=true]:flex" data-open={activityOpen}>
      {tools.map((tool, index) => { const toolOpen = openTools.has(tool.id); const panelId = `${disclosureId}-tool-${index}`; return <div key={tool.id} data-testid="tool-call" className="relative block shrink-0">
        <button type="button" aria-expanded={toolOpen} aria-controls={panelId} onClick={() => toggleTool(tool.id)} className="flex min-h-7 w-full cursor-pointer items-center gap-2 py-1 text-left hover:text-foreground">{commandTool(tool) ? <TerminalSquare size={14} className="shrink-0" /> : <Puzzle size={14} className="shrink-0" />}<span className="min-w-0 truncate">{commandTool(tool) ? '$ ' : toolLabel(tool.name) + ' '}{inputSummary(tool.input)}</span><ToolStatusIcon status={tool.status} ru={ru} /><ChevronDown size={12} className={`shrink-0 transition-transform ${toolOpen ? 'rotate-0' : '-rotate-90'}`} /></button>
        <div id={panelId} hidden={!toolOpen} className="relative overflow-hidden rounded-2xl border border-border text-foreground">
          {!!tool.input && <pre className="openx-copy-surface whitespace-pre-wrap break-words border-b border-border !bg-transparent px-3 py-2 font-mono text-xs">{commandTool(tool) ? '$ ' : ''}{tool.input}</pre>}
          {!!tool.output && <pre data-testid="tool-result" className="openx-copy-surface max-h-96 overflow-auto whitespace-pre-wrap break-words !bg-transparent px-3 py-2 font-mono text-xs leading-relaxed">{tool.output}</pre>}
          <div className="border-t border-border px-3 py-2 text-right text-[10px] text-muted-foreground">{tool.status === 'running' ? ru ? 'Выполняется…' : 'Running…' : tool.status === 'failed' ? ru ? 'Ошибка' : 'Failed' : ru ? 'Завершено' : 'Completed'}</div>
        </div>
      </div>; })}
    </div>
  </div>;
}
