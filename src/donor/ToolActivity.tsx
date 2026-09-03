import { useEffect, useState } from 'react';
import { ChevronDown, ListTree, TerminalSquare, Puzzle, FoldVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage, ToolCall, RunPhase } from '../../shared/contract';
import { usePreferences } from '../preferences';
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
export function CompactionActivity({ phase }: { phase: 'running' | 'completed' | 'failed' }) {
  const { i18n } = useTranslation(); const ru = i18n.language.startsWith('ru');
  return <div data-testid="compaction-activity" data-phase={phase} role="status" className="flex items-center gap-2 py-1 text-[13px] text-muted-foreground"><FoldVertical size={14} className={phase === 'running' ? 'animate-pulse' : ''} /><span>{phase === 'running' ? ru ? 'Сжатие контекста…' : 'Compacting context…' : phase === 'completed' ? ru ? 'Беседа оптимизирована' : 'Conversation optimized' : ru ? 'Не удалось сжать контекст' : 'Context compaction failed'}</span></div>;
}
export function ToolActivity({ tools, live = false }: { tools: ToolCall[]; live?: boolean }) {
  const { i18n } = useTranslation(); const ru = i18n.language.startsWith('ru');
  const { collapseTools } = usePreferences();
  const commands = tools.filter(commandTool).length;
  const others = new Map<string, number>(); for (const tool of tools.filter((t) => !commandTool(t))) others.set(tool.name, (others.get(tool.name) || 0) + 1);
  const summary = [commands ? `${ru ? 'Выполнено команд' : 'Commands'}: ${commands}` : '', ...[...others].map(([name, count]) => `${toolLabel(name)} ×${count}`)].filter(Boolean).join(', ');
  return <details open={live && !collapseTools || undefined} data-testid="tool-activity" className="group/activity w-full text-xs text-muted-foreground">
    <summary className="flex cursor-pointer list-none items-center gap-2 py-1 hover:text-foreground"><ListTree size={14} /><span className="min-w-0 truncate">{summary}</span><ChevronDown size={12} className="-rotate-90 transition-transform group-open/activity:rotate-0" /></summary>
    <div className="mt-1 max-h-[440px] space-y-0.5 overflow-y-auto pr-1">
      {tools.map((tool) => <details key={tool.id} data-testid="tool-call" className="group/tool">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1 hover:text-foreground">{commandTool(tool) ? <TerminalSquare size={14} className="shrink-0" /> : <Puzzle size={14} className="shrink-0" />}<span className="min-w-0 truncate">{commandTool(tool) ? '$ ' : toolLabel(tool.name) + ' '}{inputSummary(tool.input)}</span><ChevronDown size={12} className="shrink-0 -rotate-90 transition-transform group-open/tool:rotate-0" /></summary>
        <div className="overflow-hidden rounded-2xl border border-border text-foreground">
          {!!tool.input && <pre className="openx-copy-surface whitespace-pre-wrap break-words border-b border-border px-3 py-2 font-mono text-xs">{commandTool(tool) ? '$ ' : ''}{tool.input}</pre>}
          {!!tool.output && <pre data-testid="tool-result" className="openx-copy-surface max-h-96 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-relaxed">{tool.output}</pre>}
          <div className="border-t border-border px-3 py-2 text-right text-[10px] text-muted-foreground">{tool.status === 'running' ? ru ? 'Выполняется…' : 'Running…' : tool.status === 'failed' ? ru ? 'Ошибка' : 'Failed' : ru ? 'Завершено' : 'Completed'}</div>
        </div>
      </details>)}
    </div>
  </details>;
}
