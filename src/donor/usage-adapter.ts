import type { UsageHistoryEntry } from './usage-history';
import { resolveModelDisplayName } from './model-display';
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
/** Session/model totals for the requested server-side period, not invented turns. */
export function usageEntries(value: Record<string, unknown>): UsageHistoryEntry[] {
  return (Array.isArray(value.sessions) ? value.sessions : []).flatMap((entry) => {
    const session = rec(entry); const usage = rec(session.usage);
    const models = Array.isArray(usage.modelUsage) ? usage.modelUsage : [];
    return models.flatMap((entry, index) => {
      const model = rec(entry); const totals = rec(model.totals);
      const fields = ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'];
      // Do not present missing usage as zero.
      if (!fields.every((key) => typeof totals[key] === 'number' && Number.isFinite(totals[key]) && Number(totals[key]) >= 0)) return [];
      const at = typeof usage.lastActivity === 'number' ? usage.lastActivity : typeof session.updatedAt === 'number' ? session.updatedAt : value.updatedAt;
      if (typeof at !== 'number' || !Number.isFinite(at) || Number.isNaN(new Date(at).getTime())) return [];
      return [{ timestamp: new Date(at).toISOString(), sessionId: `${String(session.key || session.sessionId || '')}:${index}`, agentId: String(session.agentId || ''), model: typeof model.model === 'string' ? resolveModelDisplayName(model.model) : undefined, provider: typeof model.provider === 'string' ? model.provider : undefined, content: String(session.label || session.key || ''), usageStatus: 'available' as const, inputTokens: Number(totals.input), outputTokens: Number(totals.output), cacheReadTokens: Number(totals.cacheRead), cacheWriteTokens: Number(totals.cacheWrite), totalTokens: Number(totals.totalTokens), costUsd: totals.missingCostEntries === 0 && typeof totals.totalCost === 'number' ? totals.totalCost : undefined }];
    });
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
/** True time buckets; never assign an entire session's usage to its last day. */
export function usageDayEntries(value: Record<string, unknown>): UsageHistoryEntry[] {
  return (Array.isArray(value.sessions) ? value.sessions : []).flatMap((entry) => {
    const session = rec(entry); const usage = rec(session.usage);
    return (Array.isArray(usage.utcQuarterHourTokenUsage) ? usage.utcQuarterHourTokenUsage : []).flatMap((item, index) => {
      const row = rec(item);
      if (!['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'].every((key) => typeof row[key] === 'number' && Number.isFinite(row[key]) && Number(row[key]) >= 0)) return [];
      const date = typeof row.date === 'string' ? Date.parse(row.date + 'T00:00:00Z') : NaN;
      if (!Number.isFinite(date) || typeof row.quarterIndex !== 'number' || !Number.isInteger(row.quarterIndex) || row.quarterIndex < 0 || row.quarterIndex > 95) return [];
      return [{ timestamp: new Date(date + row.quarterIndex * 15 * 60000).toISOString(), sessionId: `${String(session.key || '')}:quarter-${index}`, agentId: String(session.agentId || ''), inputTokens: Number(row.input), outputTokens: Number(row.output), cacheReadTokens: Number(row.cacheRead), cacheWriteTokens: Number(row.cacheWrite), totalTokens: Number(row.totalTokens) }];
    });
  });
}
