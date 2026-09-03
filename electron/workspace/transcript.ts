import type { ChatMessage, TokenUsage, ToolCall } from '../../shared/contract';
import { messageFiles } from './messages';
import { createHash } from 'node:crypto';
const rec = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === 'string' ? v : '';
export const metric = (...values: unknown[]): number | undefined => values.find((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);
export function timestamp(value: unknown): number | undefined {
  if (typeof value === 'number') return metric(value);
  if (typeof value === 'string' && value.trim()) return metric(Date.parse(value));
}
export function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  const raw = rec(value);
  if (typeof raw.content === 'string') return raw.content;
  if (Array.isArray(raw.content)) return raw.content.map((p) => rec(p).type === 'text' ? str(rec(p).text) : '').filter(Boolean).join('\n');
  return str(raw.text);
}
export function tokenUsage(value: unknown): TokenUsage | undefined {
  const v = rec(value);
  const result = { input: metric(v.input, v.inputTokens, v.input_tokens, v.prompt_tokens), output: metric(v.output, v.outputTokens, v.output_tokens, v.completion_tokens), cacheRead: metric(v.cacheRead, v.cacheReadTokens, v.cache_read_input_tokens), cacheWrite: metric(v.cacheWrite, v.cacheWriteTokens, v.cache_creation_input_tokens), totalTokens: metric(v.totalTokens, v.total_tokens) };
  return Object.values(result).some((v) => v !== undefined) ? result : undefined;
}
export function toolInput(value: unknown): string {
  if (typeof value === 'string') return value;
  const raw = rec(value);
  return str(raw.command) || (value === undefined ? '' : JSON.stringify(value, null, 2));
}
/** Lossless user/assistant/tool projection; tool outputs never become assistant prose. */
export function projectTranscript(value: unknown): ChatMessage[] {
  const result: ChatMessage[] = []; let turn: ChatMessage | undefined; let turnKey: string | undefined;
  const calls = new Map<string, ToolCall>();
  const flush = () => { if (turn && (turn.text || turn.tools?.length || turn.files?.length || turn.activity?.length)) result.push(turn); turn = undefined; calls.clear(); };
  for (const entry of Array.isArray(value) ? value : []) {
    const row = rec(entry); const raw = typeof row.role === 'string' ? row : rec(row.message);
    const role = str(raw.role); const at = timestamp(raw.timestamp ?? row.timestamp);
    if (role === 'user') {
      flush();
      const files = messageFiles(raw); const text = contentText(raw);
      const id = str(row.id) || str(raw.id);
      turnKey = (id || at !== undefined) ? createHash('sha256').update(JSON.stringify([id, at, text, files])).digest('hex') : undefined;
      result.push({ role, text, ...(files.length ? { files } : {}), timestamp: at, turnKey }); continue;
    }
    const compaction = (role === 'custom' && raw.customType === 'openclaw.context-compaction') || rec(raw.__openclaw).runtimeActivityKind === 'context_compaction' || rec(raw.__openclaw).kind === 'compaction';
    if (!compaction && !['assistant', 'toolResult', 'tool', 'tool_result'].includes(role)) continue;
    turn ??= { role: 'assistant', text: '', turnKey, activity: [] };
    if (compaction) { turn.activity!.push({ kind: 'compaction', id: str(row.id) || str(raw.id) || `compaction-${result.length}-${turn.activity!.length}`, phase: 'completed' }); continue; }
    if (str(raw.runId ?? row.runId)) turn.runId = str(raw.runId ?? row.runId);
    if (role !== 'assistant') {
      const id = str(raw.toolCallId) || str(raw.tool_call_id) || str(raw.id) || `orphan-${result.length}-${calls.size}`;
      let call = calls.get(id);
      if (!call) { call = { id, name: str(raw.toolName) || str(raw.name) || 'Tool', input: '', output: '', status: 'completed' }; calls.set(id, call); (turn.tools ??= []).push(call); turn.activity!.push({ kind: 'tool', toolId: id }); }
      call.output = contentText(raw); call.status = raw.isError === true || rec(raw.details).isError === true ? 'failed' : 'completed'; continue;
    }
    const text = contentText(raw); if (text) turn.text += (turn.text ? '\n\n' : '') + text;
    const parts = Array.isArray(raw.content) ? raw.content : [{ type: 'text', text }];
    for (const part of parts) {
      const p = rec(part);
      if (p.type === 'text' && str(p.text)) { turn.activity!.push({ kind: 'text', text: str(p.text) }); continue; }
      if (!['toolCall', 'tool_use', 'toolcall'].includes(str(p.type))) continue;
      const id = str(p.id) || str(p.toolCallId); if (!id || calls.has(id)) continue;
      const call: ToolCall = { id, name: str(p.name) || 'Tool', input: toolInput(p.arguments ?? p.input), output: '', status: 'running' };
      calls.set(id, call); (turn.tools ??= []).push(call);
      turn.activity!.push({ kind: 'tool', toolId: id });
    }
    const usage = tokenUsage(raw.usage);
    if (usage) { turn.usage ??= {}; for (const key of Object.keys(usage) as (keyof TokenUsage)[]) if (usage[key] !== undefined) turn.usage[key] = (turn.usage[key] ?? 0) + usage[key]!; }
    const files = messageFiles(raw); if (files.length) (turn.files ??= []).push(...files);
    if (str(raw.model)) turn.model = [str(raw.provider), str(raw.model)].filter(Boolean).join('/');
    // A message timestamp is often allocated at model start, not completion.
    // Never present its difference from the user timestamp as elapsed run time.
    if (at !== undefined) turn.timestamp = at;
    const duration = metric(raw.durationMs, rec(raw.timing).durationMs); if (duration !== undefined) turn.durationMs = duration;
  }
  flush(); return result;
}
