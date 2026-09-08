import { useState } from "react";
import { toast } from "sonner";

import { socketClientService } from "@/services/socket";
import { useAuthStore } from "@/store";

import { commentApi, mapCommentResponseToComment } from "../api";
import { useCommentStore } from "../store";
import type { Comment, CreateCommentInput, UpdateCommentInput } from "../types";

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
   * Create a new comment or reply with optimistic UI and rollback.
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
      let authoritative: Comment;
      if (socketClientService.isConnected()) {
        const dto = await socketClientService.createComment({
          boardId,
          canvasId: input.canvasId,
          content: input.content,
          shapeId: input.shapeId,
          parentCommentId: input.parentCommentId,
          position: input.position,
        });
        authoritative = mapCommentResponseToComment(dto);
      } else {
        authoritative = await commentApi.createComment(boardId, input);
      }

      replaceOptimisticComment(tempId, authoritative);
      return authoritative;
    } catch (error) {
      removeOptimisticComment(tempId);
      const message =
        error instanceof Error ? error.message : "Failed to post comment.";
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
    content: string
  ): Promise<Comment | null> => {
    const parent = useCommentStore.getState().comments[parentCommentId];
    return createComment({
      content,
      parentCommentId,
      canvasId: parent?.canvasId,
      shapeId: parent?.shapeId ?? null,
    });
  };

  /**
   * Update comment content with optimistic UI and rollback.
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
      isEdited: true,
      updatedAt: new Date().toISOString(),
    });

    setIsSubmitting(true);

    try {
      let authoritative: Comment;
      if (socketClientService.isConnected()) {
        const dto = await socketClientService.updateComment({
          boardId,
          commentId,
          content: input.content,
        });
        authoritative = mapCommentResponseToComment(dto);
      } else {
        authoritative = await commentApi.updateComment(boardId, commentId, input);
      }

      updateStoreComment(authoritative);
      return authoritative;
    } catch (error) {
      updateStoreComment(previousComment);
      const errObj = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : null;
      const isConflict =
        errObj?.code === "CONFLICT" ||
        errObj?.statusCode === 409 ||
        (error as Error)?.message?.toLowerCase().includes("conflict") ||
        (error as Error)?.message?.toLowerCase().includes("modified by another");

      const message = isConflict
        ? "Comment was modified by another collaborator. Please refresh."
        : error instanceof Error
        ? error.message
        : "Failed to update comment.";

      toast.error(message);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Resolve or unresolve a comment thread with optimistic UI and rollback.
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
      let authoritative: Comment;
      if (socketClientService.isConnected()) {
        const dto = await socketClientService.resolveComment({
          boardId,
          commentId,
          isResolved,
        });
        authoritative = mapCommentResponseToComment(dto);
      } else {
        authoritative = await commentApi.resolveComment(
          boardId,
          commentId,
          isResolved
        );
      }

      updateStoreComment(authoritative);
      toast.success(
        isResolved ? "Thread marked as resolved" : "Thread reopened"
      );
      return authoritative;
    } catch (error) {
      resolveStoreComment(commentId, previousComment.isResolved);
      const message =
        error instanceof Error ? error.message : "Failed to resolve comment.";
      toast.error(message);
      return null;
    }
  };

  /**
   * Soft-delete a comment with optimistic UI and rollback.
   */
  const deleteComment = async (
    commentId: string
  ): Promise<Comment | null> => {
    if (!boardId) return null;

    const previousComment = useCommentStore.getState().comments[commentId];
    if (!previousComment) return null;

    removeStoreComment(commentId);

    try {
      let authoritative: Comment;
      if (socketClientService.isConnected()) {
        const dto = await socketClientService.deleteComment({
          boardId,
          commentId,
        });
        authoritative = mapCommentResponseToComment(dto);
      } else {
        authoritative = await commentApi.deleteComment(boardId, commentId);
      }

      updateStoreComment(authoritative);
      toast.success("Comment deleted");
      return authoritative;
    } catch (error) {
      updateStoreComment(previousComment);
      const message =
        error instanceof Error ? error.message : "Failed to delete comment.";
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
