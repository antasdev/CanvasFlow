import { useState } from "react";
import { toast } from "sonner";

import { mutationManager } from "@/features/canvas/services/mutation-manager";
import { useAuthStore } from "@/store";

import { mapCommentResponseToComment } from "../api";
import { useCommentStore } from "../store";
import type { Comment, CreateCommentInput, UpdateCommentInput } from "../types";

function isForbiddenError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    return (
      e.code === "FORBIDDEN" ||
      e.statusCode === 403 ||
      (typeof e.message === "string" &&
        (e.message.toLowerCase().includes("forbidden") ||
          e.message.toLowerCase().includes("permission") ||
          e.message.toLowerCase().includes("must be a member")))
    );
  }
  return false;
}

function isConflictError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    return (
      e.code === "CONFLICT" ||
      e.statusCode === 409 ||
      (typeof e.message === "string" &&
        (e.message.toLowerCase().includes("conflict") ||
          e.message.toLowerCase().includes("modified by another") ||
          e.message.toLowerCase().includes("version mismatch")))
    );
  }
  return false;
}

export function useCommentMutations(boardId?: string) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const user = useAuthStore((state) => state.user);

  const addOptimisticComment = useCommentStore(
    (state) => state.addOptimisticComment
  );
  const replaceOptimisticComment = useCommentStore(
    (state) => state.replaceOptimisticComment
  );
  const removeOptimisticComment = useCommentStore(
    (state) => state.removeOptimisticComment
  );
  const updateStoreComment = useCommentStore(
    (state) => state.updateComment
  );
  const removeStoreComment = useCommentStore(
    (state) => state.removeComment
  );
  const resolveStoreComment = useCommentStore(
    (state) => state.resolveComment
  );

  /**
   * Create a new comment or reply with optimistic UI and mutation journal tracking.
   */
  const createComment = async (
    input: CreateCommentInput
  ): Promise<Comment | null> => {
    if (!boardId) return null;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tempComment: Comment = {
      id: tempId,
      boardId,
      canvasId: input.canvasId ?? "",
      shapeId: input.shapeId ?? null,
      authorId: user?.id ?? "me",
      author: {
        id: user?.id ?? "me",
        fullName: user?.fullName ?? "You",
        email: user?.email,
      },
      parentCommentId: input.parentCommentId ?? null,
      position: input.position ?? null,
      content: input.content,
      mentions: input.mentions || [],
      isResolved: false,
      isEdited: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isOptimistic: true,
    };

    addOptimisticComment(tempComment);
    setIsSubmitting(true);

    try {
      const responseDto = await mutationManager.executeCommentCreate(
        boardId,
        {
          canvasId: input.canvasId,
          content: input.content,
          mentions: input.mentions,
          shapeId: input.shapeId,
          parentCommentId: input.parentCommentId,
          position: input.position,
        },
        tempId
      );

      const authoritative = mapCommentResponseToComment(responseDto);
      replaceOptimisticComment(tempId, authoritative);
      return authoritative;
    } catch (error) {
      removeOptimisticComment(tempId);

      let message = "Failed to post comment.";
      if (isForbiddenError(error)) {
        message = "You do not have permission to post comments in this workspace.";
      } else if (isConflictError(error)) {
        message = "Conflict occurred while creating comment.";
      } else if (error instanceof Error) {
        message = error.message;
      }

      toast.error(message);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Create a reply specifically attached to a parent comment thread.
   */
  const createReply = async (
    parentCommentId: string,
    content: string,
    mentions?: import("../types").CommentMention[]
  ): Promise<Comment | null> => {
    const parent = useCommentStore.getState().comments[parentCommentId];
    return createComment({
      content,
      mentions,
      parentCommentId,
      canvasId: parent?.canvasId,
      shapeId: parent?.shapeId ?? null,
    });
  };

  /**
   * Update comment content with optimistic UI and OCC journal tracking.
   */
  const updateComment = async (
    commentId: string,
    input: UpdateCommentInput
  ): Promise<Comment | null> => {
    if (!boardId) return null;

    const previousComment = useCommentStore.getState().comments[commentId];
    if (!previousComment) return null;

    updateStoreComment({
      ...previousComment,
      content: input.content,
      mentions: input.mentions || previousComment.mentions || [],
      isEdited: true,
      updatedAt: new Date().toISOString(),
    });

    setIsSubmitting(true);

    try {
      const responseDto = await mutationManager.executeCommentUpdate(
        boardId,
        commentId,
        {
          content: input.content,
          mentions: input.mentions,
        },
        previousComment.version
      );

      const authoritative = mapCommentResponseToComment(responseDto);
      updateStoreComment(authoritative);
      return authoritative;
    } catch (error) {
      // Rollback optimistic update
      updateStoreComment(previousComment);

      let message = "Failed to update comment.";
      if (isForbiddenError(error)) {
        message = "You do not have permission to edit this comment.";
      } else if (isConflictError(error)) {
        message = "Comment was modified by another collaborator (conflict). Please refresh.";
      } else if (error instanceof Error) {
        message = error.message;
      }

      toast.error(message);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Resolve or unresolve a comment thread with optimistic UI and OCC journal tracking.
   */
  const resolveComment = async (
    commentId: string,
    isResolved: boolean
  ): Promise<Comment | null> => {
    if (!boardId) return null;

    const previousComment = useCommentStore.getState().comments[commentId];
    if (!previousComment) return null;

    resolveStoreComment(commentId, isResolved);

    try {
      const responseDto = await mutationManager.executeCommentResolve(
        boardId,
        commentId,
        isResolved,
        previousComment.version
      );

      const authoritative = mapCommentResponseToComment(responseDto);
      updateStoreComment(authoritative);
      toast.success(
        isResolved ? "Thread marked as resolved" : "Thread reopened"
      );
      return authoritative;
    } catch (error) {
      // Rollback optimistic resolution
      updateStoreComment(previousComment);

      let message = "Failed to resolve comment.";
      if (isForbiddenError(error)) {
        message = "You do not have permission to resolve comments in this workspace.";
      } else if (isConflictError(error)) {
        message = "Comment was modified by another collaborator (conflict). Please refresh.";
      } else if (error instanceof Error) {
        message = error.message;
      }

      toast.error(message);
      return null;
    }
  };

  /**
   * Soft-delete a comment with optimistic UI and OCC journal tracking.
   */
  const deleteComment = async (
    commentId: string
  ): Promise<Comment | null> => {
    if (!boardId) return null;

    const previousComment = useCommentStore.getState().comments[commentId];
    if (!previousComment) return null;

    removeStoreComment(commentId);

    try {
      await mutationManager.executeCommentDelete(
        boardId,
        commentId,
        previousComment.version
      );

      toast.success("Comment deleted");
      return null;
    } catch (error) {
      // Rollback optimistic delete
      updateStoreComment(previousComment);

      let message = "Failed to delete comment.";
      if (isForbiddenError(error)) {
        message = "You do not have permission to delete this comment.";
      } else if (isConflictError(error)) {
        message = "Comment was modified by another collaborator (conflict). Please refresh.";
      } else if (error instanceof Error) {
        message = error.message;
      }

      toast.error(message);
      return null;
    }
  };

  return {
    isSubmitting,
    createComment,
    createReply,
    updateComment,
    resolveComment,
    deleteComment,
  };
}
