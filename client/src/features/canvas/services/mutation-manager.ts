import type { Comment } from "@/features/comments/types/comment.types";
import { socketClientService } from "@/services/socket";
import type { ShapeResponseDto } from "@/services/socket";

import { useCanvasStore } from "../store/canvas.store";
import type { CollaborationConflict } from "../store/collaboration.store";
import { useMutationStore } from "../store/mutation.store";
import type {
  PendingMutation,
  ShapeMutationIntent,
  CommentMutationIntent,
} from "../store/mutation.store";
import type { Shape, ShapeStyle } from "../types/shape.types";

/**
 * Helper to safely extract error code and message from unknown socket errors.
 */
function extractSocketError(err: unknown): { code?: string; message?: string } {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      message: typeof e.message === "string" ? e.message : undefined,
    };
  }
  if (typeof err === "string") {
    return { message: err };
  }
  return {};
}

/**
 * Generates a standard RFC 4122 v4 UUID.
 */
export function generateMutationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class MutationManager {
  private activeTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private timeoutDurationMs: number = 6000; // 6-second bounded timeout

  public setTimeoutDuration(ms: number): void {
    this.timeoutDurationMs = ms;
  }

  public createMutationId(): string {
    return generateMutationId();
  }

  /**
   * Registers a pending mutation in the journal with an active uncertainty timeout.
   */
  public registerMutation(
    mutationData: Omit<PendingMutation, "status" | "createdAt" | "updatedAt" | "retryCount"> & {
      status?: PendingMutation["status"];
      retryCount?: number;
      attemptCount?: number;
      lastAttemptAt?: string;
    }
  ): PendingMutation {
    const existing = useMutationStore.getState().mutations[mutationData.mutationId];

    if (existing) {
      useMutationStore.getState().markAttempted(mutationData.mutationId);
      this.scheduleTimeout(mutationData.mutationId);
      return useMutationStore.getState().mutations[mutationData.mutationId];
    }

    const mutation: PendingMutation = {
      ...mutationData,
      status: mutationData.status ?? "pending",
      retryCount: mutationData.retryCount ?? 0,
      attemptCount: mutationData.attemptCount ?? 1,
      lastAttemptAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    useMutationStore.getState().addMutation(mutation);

    this.scheduleTimeout(mutation.mutationId);
    return mutation;
  }

  private scheduleTimeout(mutationId: string): void {
    this.clearTimeout(mutationId);

    const timer = setTimeout(() => {
      const current = useMutationStore.getState().mutations[mutationId];
      if (current && (current.status === "pending" || current.status === "reconciling")) {
        useMutationStore.getState().markUncertain(mutationId);
      }
      this.activeTimeouts.delete(mutationId);
    }, this.timeoutDurationMs);

    this.activeTimeouts.set(mutationId, timer);
  }

  private clearTimeout(mutationId: string): void {
    const timer = this.activeTimeouts.get(mutationId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimeouts.delete(mutationId);
    }
  }

  /**
   * Executes shape creation with optimistic tracking and temporary ID replacement.
   */
  public async executeShapeCreate(
    boardId: string,
    canvasId: string,
    shapeData: {
      type: "rectangle" | "text" | "sticky_note";
      x: number;
      y: number;
      width: number;
      height: number;
      rotation?: number;
      style?: ShapeStyle;
    },
    temporaryId?: string,
    existingMutationId?: string
  ): Promise<ShapeResponseDto> {
    const mutationId = existingMutationId ?? this.createMutationId();

    const intent: ShapeMutationIntent = {
      resourceType: "shape",
      resourceId: temporaryId ?? mutationId,
      operation: "create",
      temporaryId,
      payload: { canvasId, ...shapeData },
    };

    this.registerMutation({
      mutationId,
      boardId,
      resourceType: "shape",
      resourceId: temporaryId ?? mutationId,
      operation: "create",
      intent,
    });

    try {
      const response = await socketClientService.createShape({
        canvasId,
        mutationId,
        type: shapeData.type,
        x: shapeData.x,
        y: shapeData.y,
        width: shapeData.width,
        height: shapeData.height,
        rotation: shapeData.rotation,
        style: shapeData.style,
      });

      this.clearTimeout(mutationId);
      useMutationStore.getState().markConfirmed(mutationId);

      // Reconcile temporary ID across local canvas state if temporaryId was used
      if (temporaryId && temporaryId !== response.id) {
        this.replaceTemporaryShapeId(temporaryId, response.id);
      }

      return response;
    } catch (err: unknown) {
      this.clearTimeout(mutationId);
      const parsedErr = extractSocketError(err);
      if (parsedErr.code === "CONFLICT") {
        useMutationStore.getState().markConflicted(mutationId, err as CollaborationConflict);
      } else if (parsedErr.code === "MUTATION_IN_PROGRESS") {
        useMutationStore.getState().markUncertain(mutationId);
      } else if (parsedErr.code === "IDEMPOTENCY_KEY_REUSED") {
        useMutationStore.getState().markFailed(mutationId, "Idempotency key reused with different payload.");
      } else {
        useMutationStore.getState().markFailed(mutationId, parsedErr.message ?? "Creation failed");
      }
      throw err;
    }
  }

  /**
   * Replaces a temporary client shape ID with authoritative server ID.
   */
  public replaceTemporaryShapeId(tempId: string, serverId: string): void {
    const canvasStore = useCanvasStore.getState();
    const shapes = canvasStore.shapes.map((s) => {
      if (s.id === tempId) {
        return { ...s, id: serverId };
      }
      return s;
    });

    const selectedShapeIds = canvasStore.selectedShapeIds.map((id) =>
      id === tempId ? serverId : id
    );

    useCanvasStore.setState({
      shapes,
      selectedShapeIds,
    });
  }

  /**
   * Executes shape update with OCC expectedVersion and journal tracking.
   */
  public async executeShapeUpdate(
    boardId: string,
    shapeId: string,
    data: Record<string, unknown> | Partial<Shape>,
    expectedVersion?: number,
    existingMutationId?: string
  ): Promise<ShapeResponseDto> {
    const mutationId = existingMutationId ?? this.createMutationId();

    const intent: ShapeMutationIntent = {
      resourceType: "shape",
      resourceId: shapeId,
      operation: "update",
      expectedVersion,
      changes: data,
    };

    this.registerMutation({
      mutationId,
      boardId,
      resourceType: "shape",
      resourceId: shapeId,
      operation: "update",
      expectedVersion,
      intent,
    });

    try {
      const response = await socketClientService.updateShape(
        shapeId,
        data,
        expectedVersion,
        mutationId
      );

      this.clearTimeout(mutationId);
      useMutationStore.getState().markConfirmed(mutationId);
      return response;
    } catch (err: unknown) {
      this.clearTimeout(mutationId);
      const parsedErr = extractSocketError(err);
      if (parsedErr.code === "CONFLICT") {
        useMutationStore.getState().markConflicted(mutationId, err as CollaborationConflict);
      } else if (parsedErr.code === "MUTATION_IN_PROGRESS") {
        useMutationStore.getState().markUncertain(mutationId);
      } else if (parsedErr.code === "IDEMPOTENCY_KEY_REUSED") {
        useMutationStore.getState().markFailed(mutationId, "Idempotency key reused with different payload.");
      } else {
        useMutationStore.getState().markFailed(mutationId, parsedErr.message ?? "Update failed");
      }
      throw err;
    }
  }

  /**
   * Executes shape delete with OCC expectedVersion and journal tracking.
   */
  public async executeShapeDelete(
    boardId: string,
    shapeId: string,
    expectedVersion?: number,
    existingMutationId?: string
  ): Promise<void> {
    const mutationId = existingMutationId ?? this.createMutationId();

    const intent: ShapeMutationIntent = {
      resourceType: "shape",
      resourceId: shapeId,
      operation: "delete",
      expectedVersion,
    };

    this.registerMutation({
      mutationId,
      boardId,
      resourceType: "shape",
      resourceId: shapeId,
      operation: "delete",
      expectedVersion,
      intent,
    });

    try {
      await socketClientService.deleteShape(shapeId, expectedVersion, mutationId);
      this.clearTimeout(mutationId);
      useMutationStore.getState().markConfirmed(mutationId);
    } catch (err: unknown) {
      this.clearTimeout(mutationId);
      const parsedErr = extractSocketError(err);
      if (parsedErr.code === "CONFLICT") {
        useMutationStore.getState().markConflicted(mutationId, err as CollaborationConflict);
      } else if (parsedErr.code === "MUTATION_IN_PROGRESS") {
        useMutationStore.getState().markUncertain(mutationId);
      } else if (parsedErr.code === "IDEMPOTENCY_KEY_REUSED") {
        useMutationStore.getState().markFailed(mutationId, "Idempotency key reused with different payload.");
      } else {
        useMutationStore.getState().markFailed(mutationId, parsedErr.message ?? "Delete failed");
      }
      throw err;
    }
  }

  /**
   * Four-Case Reconciliation Algorithm (Slice 13)
   *
   * Reconciles all pending/uncertain mutations for a board against authoritative REST hydration.
   */
  public async reconcileBoard(
    boardId: string,
    authoritativeShapes: Shape[],
    authoritativeComments: Comment[] = []
  ): Promise<{
    reconciledCount: number;
    retriedCount: number;
    conflictCount: number;
  }> {
    const pendingMutations = useMutationStore.getState().getPendingMutations(boardId);

    let reconciledCount = 0;
    let retriedCount = 0;
    let conflictCount = 0;

    const shapesById = new Map<string, Shape>(authoritativeShapes.map((s) => [s.id, s]));
    const commentsById = new Map<string, Comment>(authoritativeComments.map((c) => [c.id, c]));

    for (const mutation of pendingMutations) {
      useMutationStore.getState().markReconciling(mutation.mutationId);

      try {
        if (mutation.resourceType === "shape") {
          const result = await this.reconcileShapeMutation(mutation, shapesById, boardId);
          if (result === "confirmed") reconciledCount++;
          else if (result === "retried") retriedCount++;
          else if (result === "conflicted") conflictCount++;
        } else if (mutation.resourceType === "comment") {
          const result = await this.reconcileCommentMutation(mutation, commentsById, boardId);
          if (result === "confirmed") reconciledCount++;
          else if (result === "retried") retriedCount++;
          else if (result === "conflicted") conflictCount++;
        }
      } catch (err) {
        useMutationStore.getState().markFailed(
          mutation.mutationId,
          err instanceof Error ? err.message : "Reconciliation error"
        );
      }
    }

    return { reconciledCount, retriedCount, conflictCount };
  }

  private async reconcileShapeMutation(
    mutation: PendingMutation,
    shapesById: Map<string, Shape>,
    boardId: string
  ): Promise<"confirmed" | "retried" | "conflicted"> {
    const intent = mutation.intent as ShapeMutationIntent | undefined;
    const targetShape = shapesById.get(mutation.resourceId);

    if (mutation.operation === "delete") {
      // Case A: Resource is already gone from server
      if (!targetShape) {
        useMutationStore.getState().markConfirmed(mutation.mutationId);
        return "confirmed";
      }

      // If shape still exists:
      const currentVersion = targetShape.version ?? 1;
      const expectedVersion = mutation.expectedVersion ?? 1;

      if (currentVersion === expectedVersion) {
        // Case B: Safe to retry with same mutationId
        try {
          await this.executeShapeDelete(
            boardId,
            mutation.resourceId,
            expectedVersion,
            mutation.mutationId
          );
          return "retried";
        } catch {
          return "conflicted";
        }
      } else {
        // Case C: Target modified by peer before delete
        useMutationStore.getState().markConflicted(mutation.mutationId, {
          code: "CONFLICT",
          resourceType: "shape",
          resourceId: mutation.resourceId,
          currentVersion,
          message: "Shape was modified by another collaborator before deletion.",
        });
        return "conflicted";
      }
    }

    if (mutation.operation === "update") {
      // Case D: Resource was deleted on server
      if (!targetShape) {
        useMutationStore.getState().markConflicted(mutation.mutationId, {
          code: "CONFLICT",
          resourceType: "shape",
          resourceId: mutation.resourceId,
          currentVersion: 0,
          message: "Shape was deleted by another collaborator.",
        });
        return "conflicted";
      }

      const currentVersion = targetShape.version ?? 1;
      const expectedVersion = mutation.expectedVersion ?? 1;
      const changes = intent?.changes ?? {};

      // Check if changes match target shape
      const changesMatch = this.shapeContainsChanges(targetShape, changes);

      if (currentVersion > expectedVersion) {
        if (changesMatch) {
          // Case A: Mutation already reflected on server
          useMutationStore.getState().markConfirmed(mutation.mutationId);
          return "confirmed";
        } else {
          // Case C: Version advanced and changes do not match -> Conflicted
          useMutationStore.getState().markConflicted(mutation.mutationId, {
            code: "CONFLICT",
            resourceType: "shape",
            resourceId: mutation.resourceId,
            currentVersion,
            message: "Shape was modified concurrently by another collaborator.",
          });
          return "conflicted";
        }
      } else if (currentVersion === expectedVersion) {
        // Case B: Server version is still expectedVersion -> Safe to retry
        try {
          await this.executeShapeUpdate(
            boardId,
            mutation.resourceId,
            changes,
            expectedVersion,
            mutation.mutationId
          );
          return "retried";
        } catch {
          return "conflicted";
        }
      } else {
        // Stale expectedVersion
        useMutationStore.getState().markConflicted(mutation.mutationId, {
          code: "CONFLICT",
          resourceType: "shape",
          resourceId: mutation.resourceId,
          currentVersion,
        });
        return "conflicted";
      }
    }

    if (mutation.operation === "create") {
      // Check if shape matching temporaryId or payload already exists
      const match = Array.from(shapesById.values()).find(
        (s) =>
          intent?.temporaryId === s.id ||
          (intent?.payload &&
            s.type === intent.payload.type &&
            s.x === intent.payload.x &&
            s.y === intent.payload.y)
      );

      if (match) {
        // Case A: Create already applied
        if (intent?.temporaryId && intent.temporaryId !== match.id) {
          this.replaceTemporaryShapeId(intent.temporaryId, match.id);
        }
        useMutationStore.getState().markConfirmed(mutation.mutationId);
        return "confirmed";
      } else if (intent?.payload) {
        // Case B: Safe to retry create
        try {
          const payload = intent.payload as {
            type: "rectangle" | "text" | "sticky_note";
            x: number;
            y: number;
            width: number;
            height: number;
            rotation?: number;
            style?: ShapeStyle;
            canvasId?: string;
          };
          await this.executeShapeCreate(
            boardId,
            typeof payload.canvasId === "string" ? payload.canvasId : "",
            payload,
            intent.temporaryId,
            mutation.mutationId
          );
          return "retried";
        } catch {
          return "conflicted";
        }
      }
    }

    return "conflicted";
  }

  private async reconcileCommentMutation(
    mutation: PendingMutation,
    commentsById: Map<string, Comment>,
    boardId: string
  ): Promise<"confirmed" | "retried" | "conflicted"> {
    const targetComment = commentsById.get(mutation.resourceId);
    const intent = mutation.intent as CommentMutationIntent | undefined;

    if (mutation.operation === "delete") {
      if (!targetComment || targetComment.isDeleted) {
        useMutationStore.getState().markConfirmed(mutation.mutationId);
        return "confirmed";
      }

      const currentVersion = targetComment.version ?? 1;
      const expectedVersion = mutation.expectedVersion ?? 1;

      if (currentVersion === expectedVersion) {
        try {
          await socketClientService.deleteComment({
            boardId,
            commentId: mutation.resourceId,
            mutationId: mutation.mutationId,
            expectedVersion,
          });
          useMutationStore.getState().markConfirmed(mutation.mutationId);
          return "retried";
        } catch {
          return "conflicted";
        }
      } else {
        useMutationStore.getState().markConflicted(mutation.mutationId, {
          code: "CONFLICT",
          resourceType: "comment",
          resourceId: mutation.resourceId,
          currentVersion,
          message: "Comment was modified by another collaborator before deletion.",
        });
        return "conflicted";
      }
    }

    if (mutation.operation === "update" || mutation.operation === "resolve") {
      if (!targetComment) {
        useMutationStore.getState().markConflicted(mutation.mutationId, {
          code: "CONFLICT",
          resourceType: "comment",
          resourceId: mutation.resourceId,
          currentVersion: 0,
          message: "Comment was deleted by another collaborator.",
        });
        return "conflicted";
      }

      const currentVersion = targetComment.version ?? 1;
      const expectedVersion = mutation.expectedVersion ?? 1;

      if (currentVersion > expectedVersion) {
        // If content or resolve status matches
        const matches =
          (mutation.operation === "update" && targetComment.content === intent?.payload?.content) ||
          (mutation.operation === "resolve" && targetComment.isResolved === intent?.payload?.isResolved);

        if (matches) {
          useMutationStore.getState().markConfirmed(mutation.mutationId);
          return "confirmed";
        } else {
          useMutationStore.getState().markConflicted(mutation.mutationId, {
            code: "CONFLICT",
            resourceType: "comment",
            resourceId: mutation.resourceId,
            currentVersion,
            message: "Comment was modified concurrently by another collaborator.",
          });
          return "conflicted";
        }
      } else if (currentVersion === expectedVersion) {
        try {
          if (mutation.operation === "update") {
            const content = typeof intent?.payload?.content === "string" ? intent.payload.content : "";
            await socketClientService.updateComment({
              boardId,
              commentId: mutation.resourceId,
              mutationId: mutation.mutationId,
              expectedVersion,
              content,
            });
          } else {
            const isResolved = typeof intent?.payload?.isResolved === "boolean" ? intent.payload.isResolved : true;
            await socketClientService.resolveComment({
              boardId,
              commentId: mutation.resourceId,
              mutationId: mutation.mutationId,
              expectedVersion,
              isResolved,
            });
          }
          useMutationStore.getState().markConfirmed(mutation.mutationId);
          return "retried";
        } catch {
          return "conflicted";
        }
      } else {
        useMutationStore.getState().markConflicted(mutation.mutationId, {
          code: "CONFLICT",
          resourceType: "comment",
          resourceId: mutation.resourceId,
          currentVersion,
        });
        return "conflicted";
      }
    }

    if (mutation.operation === "create") {
      const match = Array.from(commentsById.values()).find(
        (c) => intent?.payload && c.content === intent.payload.content
      );

      if (match) {
        useMutationStore.getState().markConfirmed(mutation.mutationId);
        return "confirmed";
      } else if (intent?.payload) {
        try {
          const commentPayload = intent.payload as {
            content?: string;
            shapeId?: string | null;
            parentCommentId?: string | null;
          };
          await socketClientService.createComment({
            boardId,
            mutationId: mutation.mutationId,
            content: typeof commentPayload.content === "string" ? commentPayload.content : "",
            shapeId: commentPayload.shapeId ?? null,
            parentCommentId: commentPayload.parentCommentId ?? null,
          });
          useMutationStore.getState().markConfirmed(mutation.mutationId);
          return "retried";
        } catch {
          return "conflicted";
        }
      }
    }

    return "conflicted";
  }

  private shapeContainsChanges(shape: Shape, changes: Partial<Shape> | Record<string, unknown>): boolean {
    const shapeRecord = shape as unknown as Record<string, unknown>;
    for (const [key, val] of Object.entries(changes)) {
      if (val === undefined) continue;
      if (key === "style" && typeof val === "object" && val !== null) {
        // Compare style sub-fields if present
        for (const [sKey, sVal] of Object.entries(val)) {
          if (sVal !== undefined && shapeRecord[sKey] !== sVal) {
            return false;
          }
        }
      } else if (shapeRecord[key] !== val) {
        return false;
      }
    }
    return true;
  }
}

export const mutationManager = new MutationManager();
