import type { PendingApprovalSnapshot } from '@openclaw/gateway-protocol';
export function pendingApproval(id = 'test-approval'): PendingApprovalSnapshot {
  return { id, urlPath: `/approve/${id}`, createdAtMs: Date.now(), expiresAtMs: Date.now() + 60000, status: 'pending', presentation: { kind: 'exec', commandText: 'node --version', host: 'node', agentId: 'main', allowedDecisions: ['allow-once', 'allow-always', 'deny'] } };
}
