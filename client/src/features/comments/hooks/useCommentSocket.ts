import { useEffect } from "react";

import { socketClientService } from "@/services/socket";
import { mapCommentResponseToComment } from "../api";
import { useCommentStore } from "../store";

/**
 * Real-time hook subscribing to collaborative comment events over Socket.IO.
 * Updates the dedicated comment store cleanly without mutating canvas undo/redo history.
 */
export function useCommentSocket(boardId?: string): void {
  const addComment = useCommentStore((state) => state.addComment);
  const updateComment = useCommentStore((state) => state.updateComment);
  const removeComment = useCommentStore((state) => state.removeComment);

  useEffect(() => {
    if (!boardId) {
      return;
    }

    const unsubCreated = socketClientService.onCommentCreated((dto) => {
      if (dto.boardId !== boardId) return;
      const comment = mapCommentResponseToComment(dto);
      addComment(comment);
    });

    const unsubUpdated = socketClientService.onCommentUpdated((dto) => {
      if (dto.boardId !== boardId) return;
      const comment = mapCommentResponseToComment(dto);
      updateComment(comment);
    });

    const unsubResolved = socketClientService.onCommentResolved((dto) => {
      if (dto.boardId !== boardId) return;
      const comment = mapCommentResponseToComment(dto);
      updateComment(comment);
    });

    const unsubDeleted = socketClientService.onCommentDeleted((payload) => {
      if (payload.boardId !== boardId) return;
      removeComment(payload.commentId);
    });

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubResolved();
      unsubDeleted();
    };
  }, [boardId, addComment, updateComment, removeComment]);
}
