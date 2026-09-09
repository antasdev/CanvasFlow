import { useEffect, useRef } from "react";

import { useCollaborationStore, useMutationStore } from "@/features/canvas/store";
import { socketClientService } from "@/services/socket";
import type { CommentResponseDto } from "@/services/socket";

import { mapCommentResponseToComment } from "../api";
import { useCommentStore } from "../store";

const MAX_SEEN_EVENTS = 200;

/**
 * Real-time hook subscribing to collaborative comment events over Socket.IO.
 * Updates the dedicated comment store cleanly without mutating canvas undo/redo history,
 * validates monotonic revision freshness, deduplicates duplicate event deliveries,
 * and confirms local pending mutations in the mutation journal.
 */
export function useCommentSocket(
  boardId?: string,
  onGapDetected?: () => void
): void {
  const addComment = useCommentStore((state) => state.addComment);
  const updateComment = useCommentStore((state) => state.updateComment);
  const removeComment = useCommentStore((state) => state.removeComment);
  const replaceOptimisticComment = useCommentStore(
    (state) => state.replaceOptimisticComment
  );

  const seenEventIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!boardId) {
      return;
    }

    const seenEventIds = seenEventIdsRef.current;

    const trackEventId = (eventId?: string): boolean => {
      if (!eventId) return true;
      if (seenEventIds.has(eventId)) {
        return false; // Duplicate delivery
      }
      if (seenEventIds.size >= MAX_SEEN_EVENTS) {
        const oldest = seenEventIds.values().next().value;
        if (oldest) seenEventIds.delete(oldest);
      }
      seenEventIds.add(eventId);
      return true;
    };

    const confirmPendingMutation = (
      mutationId?: string,
      revision?: number,
      eventId?: string
    ): void => {
      if (!mutationId) return;
      const mutationStore = useMutationStore.getState();
      const existing = mutationStore.mutations[mutationId];
      if (existing) {
        mutationStore.markConfirmed(mutationId, revision, eventId);
      }
    };

    const unsubCreated = socketClientService.onCommentCreated((payload) => {
      const meta = "meta" in payload ? payload.meta : undefined;
      const dto =
        "comment" in payload ? payload.comment : (payload as CommentResponseDto);

      if (dto.boardId !== boardId) return;

      if (meta && boardId) {
        if (!trackEventId(meta.eventId)) {
          return;
        }

        const freshness = useCollaborationStore
          .getState()
          .checkEventFreshness(boardId, meta.revision);
        if (freshness.action === "ignore") {
          return;
        }
        if (freshness.action === "gap") {
          onGapDetected?.();
          return;
        }

        confirmPendingMutation(meta.mutationId, meta.revision, meta.eventId);
      }

      const comment = mapCommentResponseToComment(dto);

      // If this mutation had a temporaryId in the mutation journal, replace it
      if (meta?.mutationId) {
        const mutation = useMutationStore.getState().mutations[meta.mutationId];
        const tempId = (mutation?.intent as { temporaryId?: string })?.temporaryId;
        if (tempId && tempId !== comment.id) {
          replaceOptimisticComment(tempId, comment);
          return;
        }
      }

      addComment(comment);
    });

    const unsubUpdated = socketClientService.onCommentUpdated((payload) => {
      const meta = "meta" in payload ? payload.meta : undefined;
      const dto =
        "comment" in payload ? payload.comment : (payload as CommentResponseDto);

      if (dto.boardId !== boardId) return;

      if (meta && boardId) {
        if (!trackEventId(meta.eventId)) {
          return;
        }

        const freshness = useCollaborationStore
          .getState()
          .checkEventFreshness(boardId, meta.revision);
        if (freshness.action === "ignore") {
          return;
        }
        if (freshness.action === "gap") {
          onGapDetected?.();
          return;
        }

        confirmPendingMutation(meta.mutationId, meta.revision, meta.eventId);
      }

      const comment = mapCommentResponseToComment(dto);
      updateComment(comment);
    });

    const unsubResolved = socketClientService.onCommentResolved((payload) => {
      const meta = "meta" in payload ? payload.meta : undefined;
      const dto =
        "comment" in payload ? payload.comment : (payload as CommentResponseDto);

      if (dto.boardId !== boardId) return;

      if (meta && boardId) {
        if (!trackEventId(meta.eventId)) {
          return;
        }

        const freshness = useCollaborationStore
          .getState()
          .checkEventFreshness(boardId, meta.revision);
        if (freshness.action === "ignore") {
          return;
        }
        if (freshness.action === "gap") {
          onGapDetected?.();
          return;
        }

        confirmPendingMutation(meta.mutationId, meta.revision, meta.eventId);
      }

      const comment = mapCommentResponseToComment(dto);
      updateComment(comment);
    });

    const unsubDeleted = socketClientService.onCommentDeleted((payload) => {
      const meta = "meta" in payload ? payload.meta : undefined;
      const commentId = payload.commentId;

      if (payload.boardId !== boardId) return;

      if (meta && boardId) {
        if (!trackEventId(meta.eventId)) {
          return;
        }

        const freshness = useCollaborationStore
          .getState()
          .checkEventFreshness(boardId, meta.revision);
        if (freshness.action === "ignore") {
          return;
        }
        if (freshness.action === "gap") {
          onGapDetected?.();
          return;
        }

        confirmPendingMutation(meta.mutationId, meta.revision, meta.eventId);
      }

      removeComment(commentId);
    });

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubResolved();
      unsubDeleted();
    };
  }, [
    boardId,
    addComment,
    updateComment,
    removeComment,
    replaceOptimisticComment,
    onGapDetected,
  ]);
}
