import type { ApprovalDecision, ApprovalSnapshot } from '@openclaw/gateway-protocol';
import type { Result } from './contract';

export type ApprovalItem = { approval: ApprovalSnapshot; reviewToken: string };
export type ApprovalState = { revision: number; connected: boolean; items: ApprovalItem[]; error: string | null };
export type ApprovalsApi = {
  snapshot(): Promise<ApprovalState>;
  refresh(): Promise<Result<void>>;
  resolve(id: string, reviewToken: string, decision: ApprovalDecision): Promise<Result<void>>;
  onState(listener: (state: ApprovalState) => void): () => void;
};
