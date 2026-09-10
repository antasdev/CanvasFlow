import { historyRepository, HistoryRepository } from "../history.repository";
import { BoardVersionDocument } from "../history.types";
import { MutationContext } from "./history-pipeline.types";
import { HistoryPolicy } from "./history.policy";
import { SnapshotBuilder } from "./history.snapshot";

/**
 * HistoryPipeline (Slice 37)
 *
 * Coordinates the evaluation of authoritative mutations against the HistoryPolicy,
 * constructs immutable snapshots via SnapshotBuilder from committed state,
 * and persists historical BoardVersion checkpoints.
 */
export class HistoryPipeline {
  constructor(private readonly historyRepo: HistoryRepository = historyRepository) {}

  /**
   * Processes an authoritative mutation execution context.
   * Runs post-commit as an auxiliary persistence layer.
   *
   * Invariant: Errors during automatic snapshot creation are logged diagnostically
   * and never bubble up to rollback the already committed live document edit.
   */
  async processMutation(context: MutationContext): Promise<BoardVersionDocument | null> {
    // 1. Replay Guard
    if (context.isIdempotentReplay) {
      return null;
    }

    // 2. Pure Policy Evaluation
    const decision = HistoryPolicy.shouldCreateVersion(context);
    if (!decision.shouldCreate) {
      return null;
    }

    // 3. Post-Commit Auxiliary Snapshot Persistence
    try {
      const snapshot = await SnapshotBuilder.buildBoardSnapshot(context.boardId);

      const version = await this.historyRepo.create({
        boardId: context.boardId,
        createdBy: context.actorId,
        collaborationRevision: context.collaborationRevision,
        trigger: decision.trigger,
        snapshot,
        changeSummary: decision.changeSummary,
        isNamed: false,
      });

      return version;
    } catch (error) {
      // Graceful error isolation for auxiliary history operations
      // Diagnostic logging preserves observability without failing the live canvas mutation
      console.error("[HistoryPipeline] Automatic history checkpoint creation failed:", {
        boardId: context.boardId.toString(),
        operation: context.operation,
        mutationId: context.mutationId,
        error: error instanceof Error ? error.message : String(error),
      });

      return null;
    }
  }
}

export const historyPipeline = new HistoryPipeline();
