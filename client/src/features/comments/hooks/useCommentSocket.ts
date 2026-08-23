import { useEffect } from "react";

import { socketClientService } from "@/services/socket";
import type { CommentResponseDto } from "@/services/socket";
import { useCollaborationStore } from "@/features/canvas/store";
import { mapCommentResponseToComment } from "../api";
import { useCommentStore } from "../store";

/**
 * Real-time hook subscribing to collaborative comment events over Socket.IO.
 * Updates the dedicated comment store cleanly without mutating canvas undo/redo history,
 * and validates monotonic revision freshness.
 */
export function useCommentSocket(
  boardId?: string,
  onGapDetected?: () => void
): void {
  const addComment = useCommentStore((state) => state.addComment);
  const updateComment = useCommentStore((state) => state.updateComment);
  const removeComment = useCommentStore((state) => state.removeComment);

  useEffect(() => {
    if (!boardId) {
      return;
    }

    const unsubCreated = socketClientService.onCommentCreated((payload) => {
      const meta = "meta" in payload ? payload.meta : undefined;
      const dto = "comment" in payload ? payload.comment : (payload as CommentResponseDto);

      if (dto.boardId !== boardId) return;

      if (meta && boardId) {
        const freshness = useCollaborationStore.getState().checkEventFreshness(boardId, meta.revision);
        if (freshness.action === "ignore") {
          return;
        }
        if (freshness.action === "gap") {
          onGapDetected?.();
          return;
        }
      }

      const comment = mapCommentResponseToComment(dto);
      addComment(comment);
    });

    const unsubUpdated = socketClientService.onCommentUpdated((payload) => {
      const meta = "meta" in payload ? payload.meta : undefined;
      const dto = "comment" in payload ? payload.comment : (payload as CommentResponseDto);

      if (dto.boardId !== boardId) return;

      if (meta && boardId) {
        const freshness = useCollaborationStore.getState().checkEventFreshness(boardId, meta.revision);
        if (freshness.action === "ignore") {
          return;
        }
        if (freshness.action === "gap") {
          onGapDetected?.();
          return;
        }
      }

      const comment = mapCommentResponseToComment(dto);
      updateComment(comment);
    });

    const unsubResolved = socketClientService.onCommentResolved((payload) => {
      const meta = "meta" in payload ? payload.meta : undefined;
      const dto = "comment" in payload ? payload.comment : (payload as CommentResponseDto);

      if (dto.boardId !== boardId) return;

      if (meta && boardId) {
        const freshness = useCollaborationStore.getState().checkEventFreshness(boardId, meta.revision);
        if (freshness.action === "ignore") {
          return;
        }
        if (freshness.action === "gap") {
          onGapDetected?.();
          return;
        }
      }

      const comment = mapCommentResponseToComment(dto);
      updateComment(comment);
    });

    const unsubDeleted = socketClientService.onCommentDeleted((payload) => {
      const meta = "meta" in payload ? payload.meta : undefined;
      const commentId = "commentId" in payload ? payload.commentId : (payload as any).commentId;

      if (payload.boardId !== boardId) return;

      if (meta && boardId) {
        const freshness = useCollaborationStore.getState().checkEventFreshness(boardId, meta.revision);
        if (freshness.action === "ignore") {
          return;
        }
        if (freshness.action === "gap") {
          onGapDetected?.();
          return;
        }
      }

      removeComment(commentId);
    });

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubResolved();
      unsubDeleted();
    };
  }, [boardId, addComment, updateComment, removeComment, onGapDetected]);
}
