import { MutationContext, PolicyDecision } from "./history-pipeline.types";

/**
 * Pure History Policy Engine (Slice 37)
 *
 * Deterministically classifies mutations into version-eligible milestones vs
 * non-checkpoint or ephemeral operations without process-local state.
 */
export class HistoryPolicy {
  /**
   * Evaluates an authoritative mutation context and determines whether
   * a historical snapshot version checkpoint should be created.
   */
  static shouldCreateVersion(context: MutationContext): PolicyDecision {
    // 1. Guard against idempotent replays
    if (context.isIdempotentReplay) {
      return {
        shouldCreate: false,
        trigger: "automatic",
        reason: "Idempotent mutation replay ignored",
      };
    }

    const op = String(context.operation).toLowerCase();

    // 2. Explicit manual checkpoints
    if (op === "manual" || op === "manual:checkpoint") {
      return {
        shouldCreate: true,
        trigger: "manual",
        reason: "Explicit manual checkpoint requested",
        changeSummary: {
          description: context.description ?? "Manual version checkpoint",
        },
      };
    }

    // 3. Structural version-eligible mutations
    switch (op) {
      case "shape:create":
        return {
          shouldCreate: true,
          trigger: "automatic",
          reason: "Shape creation committed",
          changeSummary: {
            shapesCreated: context.affectedShapeCount ?? 1,
            description: context.description ?? "Shape created",
          },
        };

      case "shape:delete":
        return {
          shouldCreate: true,
          trigger: "automatic",
          reason: "Shape deletion committed",
          changeSummary: {
            shapesDeleted: context.affectedShapeCount ?? 1,
            description: context.description ?? "Shape deleted",
          },
        };

      case "shape:group":
        return {
          shouldCreate: true,
          trigger: "automatic",
          reason: "Shapes grouped committed",
          changeSummary: {
            description: context.description ?? "Shapes grouped",
          },
        };

      case "shape:ungroup":
        return {
          shouldCreate: true,
          trigger: "automatic",
          reason: "Shape ungrouped committed",
          changeSummary: {
            description: context.description ?? "Shape ungrouped",
          },
        };

      case "shape:paste":
        return {
          shouldCreate: true,
          trigger: "automatic",
          reason: "Shapes pasted committed",
          changeSummary: {
            shapesCreated: context.affectedShapeCount ?? 1,
            description: context.description ?? "Shapes pasted",
          },
        };

      case "shape:align":
        return {
          shouldCreate: true,
          trigger: "automatic",
          reason: "Shapes aligned committed",
          changeSummary: {
            shapesUpdated: context.affectedShapeCount,
            description: context.description ?? "Shapes aligned",
          },
        };

      case "shape:distribute":
        return {
          shouldCreate: true,
          trigger: "automatic",
          reason: "Shapes distributed committed",
          changeSummary: {
            shapesUpdated: context.affectedShapeCount,
            description: context.description ?? "Shapes distributed",
          },
        };

      case "batch:operation":
      case "shape:batch":
        return {
          shouldCreate: true,
          trigger: "automatic",
          reason: "Batch mutation committed",
          changeSummary: {
            shapesUpdated: context.affectedShapeCount,
            description: context.description ?? "Batch mutation",
          },
        };

      // 4. Granular updates (non-checkpoint in Slice 37)
      case "shape:update":
        return {
          shouldCreate: false,
          trigger: "automatic",
          reason: "Granular shape property update (non-checkpoint)",
        };

      // 5. Ephemeral, presence, and non-document actions
      case "pointermove":
      case "pan":
      case "zoom":
      case "selection":
      case "marquee":
      case "lasso":
      case "presence":
      case "cursor":
      case "shape:transform-frame":
      case "comment:create":
      case "comment:update":
      case "comment:resolve":
      case "comment:delete":
      default:
        return {
          shouldCreate: false,
          trigger: "automatic",
          reason: "Operation is non-checkpoint or ephemeral",
        };
    }
  }
}
