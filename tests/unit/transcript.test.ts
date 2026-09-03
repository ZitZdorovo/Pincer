import { expect, it } from 'vitest';
import { projectTranscript, tokenUsage } from '../../electron/workspace/transcript';
import { resolveModelDisplayName, groupConfiguredModels, availableThinkingLevels, resolveGroupVariant } from '../../src/donor/model-display';
import { usageEntries, usageDayEntries } from '../../src/donor/usage-adapter';
import { elapsedLabel } from '../../src/donor/ToolActivity';

it('keeps tool results in expandable calls, sums actual usage and measures a turn', () => {
  const messages = projectTranscript([
    { role: 'user', content: 'Проверить', timestamp: 1000 },
    { role: 'assistant', timestamp: 2000, content: [{ type: 'thinking', thinking: 'private' }, { type: 'toolCall', id: 'cmd1', name: 'exec', arguments: { command: 'whoami' } }], usage: { input: 20, output: 30 } },
    { role: 'toolResult', toolCallId: 'cmd1', toolName: 'exec', content: [{ type: 'text', text: 'test-user' }], isError: false },
    { role: 'assistant', timestamp: 7000, durationMs: 6000, model: 'test', provider: 'provider', content: [{ type: 'text', text: 'Готово' }], usage: { input: 40, output: 151 } },
  ]);
  expect(messages).toHaveLength(2);
  expect(messages[1]).toMatchObject({ text: 'Готово', usage: { input: 60, output: 181 }, durationMs: 6000, model: 'provider/test', tools: [{ id: 'cmd1', name: 'exec', input: 'whoami', output: 'test-user', status: 'completed' }] });
  expect(messages[1].activity?.map(block => block.kind)).toEqual(['tool', 'text']);
  expect(JSON.stringify(messages)).not.toContain('private');
});
it('projects real OpenClaw context compaction as an activity divider', () => {
  const message = projectTranscript([{ role: 'custom', id: 'c1', customType: 'openclaw.context-compaction', __openclaw: { runtimeActivityKind: 'context_compaction' } }])[0];
  expect(message.activity).toEqual([{ kind: 'compaction', id: 'c1', phase: 'completed' }]);
});
it('supports orphan results, errors, envelopes and missing telemetry without fake zeros', () => {
  expect(projectTranscript([{ role: 'toolResult', toolCallId: 'orphan', toolName: 'session_status', isError: true, content: 'denied' }])[0]).toMatchObject({ text: '', tools: [{ name: 'session_status', status: 'failed', output: 'denied' }] });
  const m = projectTranscript([{ timestamp: '2026-09-03T00:00:00Z', message: { role: 'assistant', content: 'ok' } }])[0];
  expect(m.usage).toBeUndefined(); expect(m.durationMs).toBeUndefined(); expect(m.timestamp).toBe(Date.parse('2026-09-03T00:00:00Z'));
  expect(tokenUsage({ input: NaN, output: -1 })).toBeUndefined();
  expect(tokenUsage({ completion_tokens: 0 })).toMatchObject({ output: 0 });
});
it('restores donor names and sends the exact configured Thinking variant', () => {
  expect(resolveModelDisplayName('custom-customb3/agy/agy/gemini-3.7-flash-high', undefined, 'agy/agy/gemini-3.7-flash-high')).toBe('Gemini 3.7 Flash');
  expect(resolveModelDisplayName('codex/gpt-5.6-sol-high')).toBe('GPT 5.6 Sol');
  expect(resolveModelDisplayName('provider/id', 'Моя модель')).toBe('Моя модель');
  const [group] = groupConfiguredModels([{ modelRef: 'p/model-low', label: 'model-low' }, { modelRef: 'p/model-high', label: 'model-high' }]);
  expect(availableThinkingLevels(group)).toEqual(['low', 'high']);
  expect(resolveGroupVariant(group, 'high').modelRef).toBe('p/model-high');
  expect(elapsedLabel(59000, true)).toBe('59 с'); expect(elapsedLabel(61000, true)).toBe('1 мин 1 с');
});
it('attributes usage to each actual model, not the current session model', () => {
  const rows = usageEntries({ sessions: [{ key: 'session1', agentId: 'main', model: 'wrong', usage: { lastActivity: 1000, modelUsage: [{ model: 'gpt-5.6-sol-high', provider: 'codex', totals: { input: 10, output: 20, cacheRead: 3, cacheWrite: 4, totalTokens: 37, missingCostEntries: 1, totalCost: 0 } }] } }] });
  expect(rows[0]).toMatchObject({ model: 'GPT 5.6 Sol', inputTokens: 10, outputTokens: 20, totalTokens: 37 });
  expect(rows[0].costUsd).toBeUndefined(); expect(usageEntries({ sessions: [{ usage: null }] })).toEqual([]);
  const days = usageDayEntries({ sessions: [{ key: 's', updatedAt: 99999999999, usage: { utcQuarterHourTokenUsage: [{ date: '2026-09-01', quarterIndex: 40, input: 10, output: 20, cacheRead: 3, cacheWrite: 4, totalTokens: 37 }] } }] });
  expect(days[0].timestamp).toBe('2026-09-01T10:00:00.000Z'); expect(days[0].totalTokens).toBe(37);
});
