import { Types } from "mongoose";
import { MutationOperation } from "@/modules/mutation/mutation.types";
import { VersionChangeSummary, VersionTrigger } from "../history.types";

/**
 * Execution context for an authoritative document mutation.
 */
export type MutationContext = {
  boardId: Types.ObjectId;
  actorId: Types.ObjectId;
  operation: MutationOperation | string;
  mutationId?: string;
  collaborationRevision: number;
  isIdempotentReplay?: boolean;
  affectedShapeCount?: number;
  affectedCanvasCount?: number;
  description?: string;
};

/**
 * Result of evaluating a mutation context against the pure HistoryPolicy.
 */
export type PolicyDecision = {
  shouldCreate: boolean;
  trigger: VersionTrigger;
  reason: string;
  changeSummary?: VersionChangeSummary;
};
