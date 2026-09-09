import React, { useMemo } from "react";

import { CANVAS_TOOLS } from "@/features/canvas/constants";
import { useCanvasStore } from "@/features/canvas/store";
import type { CanvasPoint } from "@/features/canvas/utils/canvas.coordinates";
import { worldToScreen } from "@/features/canvas/utils/canvas.coordinates";

import { useCommentMutations } from "../hooks";
import { useCommentStore } from "../store";
import type { Comment } from "../types";

import CommentMarker from "./CommentMarker";
import FloatingCommentComposer from "./FloatingCommentComposer";

export type CanvasCommentOverlayProps = {
  boardId?: string;
  canvasId?: string;
  zoom: number;
  pan: CanvasPoint;
};

/**
 * Overlay layer managing world-space anchored comment markers and in-canvas composer.
 * Converts world coordinates to screen space dynamically via the viewport transform.
 */
export default function CanvasCommentOverlay({
  boardId,
  canvasId,
  zoom,
  pan,
}: CanvasCommentOverlayProps): React.JSX.Element {
  const comments = useCommentStore((state) => state.comments);
  const activeThreadId = useCommentStore((state) => state.activeThreadId);
  const setActiveThreadId = useCommentStore((state) => state.setActiveThreadId);
  const filter = useCommentStore((state) => state.filter);
  const togglePanel = useCommentStore((state) => state.togglePanel);
  const draftPosition = useCommentStore((state) => state.draftPosition);
  const clearDraftPosition = useCommentStore((state) => state.clearDraftPosition);
  const setActiveTool = useCanvasStore((state) => state.setActiveTool);

  const { createComment, isSubmitting } = useCommentMutations(boardId);

  // Group and sort world-anchored root comments
  const canvasComments = useMemo(() => {
    const list: Comment[] = [];
    const all = Object.values(comments).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    for (const c of all) {
      if (!c.parentCommentId && !c.isDeleted && c.position) {
        if (canvasId && c.canvasId && c.canvasId !== canvasId) {
          continue;
        }
        if (filter === "open" && c.isResolved) continue;
        if (filter === "resolved" && !c.isResolved) continue;
        list.push(c);
      }
    }

    return list;
  }, [comments, canvasId, filter]);

  const handleSelectComment = (commentId: string): void => {
    setActiveThreadId(commentId);
    togglePanel(true);
  };

  const handleComposerSubmit = async (
    content: string,
    mentions?: import("../types").CommentMention[]
  ): Promise<boolean> => {
    if (!draftPosition) return false;

    const result = await createComment({
      canvasId,
      content,
      mentions,
      position: draftPosition,
      parentCommentId: null,
      shapeId: null,
    });

    if (result) {
      clearDraftPosition();
      setActiveThreadId(result.id);
      togglePanel(true);
      setActiveTool(CANVAS_TOOLS.SELECT);
      return true;
    }
    return false;
  };

  const handleComposerCancel = (): void => {
    clearDraftPosition();
    setActiveTool(CANVAS_TOOLS.SELECT);
  };

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20 overflow-hidden"
      data-testid="canvas-comment-overlay"
    >
      {/* Canvas-anchored Comment Markers */}
      {canvasComments.map((comment, idx) => {
        if (!comment.position) return null;
        const screenPos = worldToScreen(comment.position, { zoom, pan });

        return (
          <CommentMarker
            key={`canvas-comment-${comment.id}`}
            comment={comment}
            screenX={screenPos.x}
            screenY={screenPos.y}
            index={idx + 1}
            isActive={activeThreadId === comment.id}
            onSelect={handleSelectComment}
          />
        );
      })}

      {/* Floating Draft Comment Composer */}
      {draftPosition && (
        (() => {
          const draftScreenPos = worldToScreen(draftPosition, { zoom, pan });
          return (
            <FloatingCommentComposer
              position={draftPosition}
              screenX={draftScreenPos.x}
              screenY={draftScreenPos.y}
              boardId={boardId}
              onSubmit={handleComposerSubmit}
              onCancel={handleComposerCancel}
              isSubmitting={isSubmitting}
            />
          );
        })()
      )}
    </div>
  );
}
