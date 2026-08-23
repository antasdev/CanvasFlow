import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { socketClientService, SocketEvents } from "@/services/socket";
import type { BoardRecoveryStatePayload } from "@/services/socket";
import { useCanvasStore, useCollaborationStore } from "../store";
import { useMutationStore } from "../store/mutation.store";
import { mutationManager } from "../services/mutation-manager";
import { shapeApi } from "../api/shape.api";
import { mapShapeResponseToShape } from "../api/shape.mapper";
import { commentApi } from "@/features/comments/api";
import { useCommentStore } from "@/features/comments/store";
import { COMMENT_QUERY_KEYS } from "@/features/comments/hooks/useComments";

export type RecoveryStatus =
  | "idle"
  | "reconnecting"
  | "recovering"
  | "reconciling"
  | "conflict"
  | "recovered"
  | "error";

export interface UseBoardRecoveryReturn {
  status: RecoveryStatus;
  error: string | null;
  recoveredAt: string | null;
  triggerRecovery: (targetBoardId?: string, targetCanvasId?: string) => Promise<boolean>;
  setStatus: (status: RecoveryStatus) => void;
}

/**
 * Hook managing authoritative board state recovery following network reconnects or tab wakes.
 * Coordinates single-flight mutex locks, generation counters, ephemeral cleanup,
 * authoritative REST hydration, and pending mutation reconciliation without mutating undo/redo history.
 */
export function useBoardRecovery(
  boardId?: string,
  canvasId?: string
): UseBoardRecoveryReturn {
  const [status, setStatus] = useState<RecoveryStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recoveredAt, setRecoveredAt] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const isRecoveringRef = useRef<boolean>(false);
  const recoveryGenerationRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const boardIdRef = useRef<string | undefined>(boardId);
  const canvasIdRef = useRef<string | undefined>(canvasId);

  useEffect(() => {
    boardIdRef.current = boardId;
    canvasIdRef.current = canvasId;
  }, [boardId, canvasId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const triggerRecovery = useCallback(
    async (
      targetBoardId?: string,
      targetCanvasId?: string
    ): Promise<boolean> => {
      const activeBoardId = targetBoardId ?? boardIdRef.current;
      const activeCanvasId = targetCanvasId ?? canvasIdRef.current;

      if (!activeBoardId || !activeCanvasId) {
        return false;
      }

      // 1. Single-Flight Mutex Guard
      if (isRecoveringRef.current) {
        return false;
      }

      isRecoveringRef.current = true;
      useCollaborationStore.getState().setRecovering(true);
      const currentGeneration = ++recoveryGenerationRef.current;

      setStatus("recovering");
      setError(null);

      // 2. Clear Ephemeral Collaboration State immediately
      const canvasStore = useCanvasStore.getState();
      canvasStore.clearRemoteCursors();
      canvasStore.clearRemoteSelections();
      canvasStore.clearRemoteShapeLocks();
      canvasStore.clearRemoteShapeTransforms();

      try {
        // 3. Socket Recovery (Presence & Room Membership Re-join)
        const recoverySocketPromise =
          socketClientService.recoverBoard(activeBoardId);

        // 4. Authoritative REST Data Hydration
        const shapesPromise = shapeApi.getShapes(activeCanvasId);
        const commentsPromise = commentApi.getComments(activeBoardId);

        const [recoveryState, rawShapes, comments] = await Promise.all([
          recoverySocketPromise,
          shapesPromise,
          commentsPromise,
        ]);

        // 5. Check Generation Token to discard stale concurrent responses
        if (currentGeneration !== recoveryGenerationRef.current) {
          isRecoveringRef.current = false;
          useCollaborationStore.getState().setRecovering(false);
          return false;
        }

        // 6. Map Authoritative Shapes & Replace in Store (preserving Undo/Redo)
        const authoritativeShapes = rawShapes.map(mapShapeResponseToShape);
        useCanvasStore.getState().replaceShapesFromRecovery(authoritativeShapes);

        // 7. Update Comments Store & Invalidate TanStack Query Cache
        useCommentStore.getState().setComments(comments);
        queryClient.invalidateQueries({
          queryKey: COMMENT_QUERY_KEYS.boardComments(activeBoardId),
        });

        // 8. Update Authoritative Collaboration Revision in Store
        if (typeof recoveryState.revision === "number") {
          useCollaborationStore.getState().setRevision(activeBoardId, recoveryState.revision);
        }

        // 9. Reconcile Pending Mutations (Slice 13)
        const pendingMutations = useMutationStore.getState().getPendingMutations(activeBoardId);
        let hasConflict = false;

        if (pendingMutations.length > 0) {
          setStatus("reconciling");
          const { conflictCount } = await mutationManager.reconcileBoard(
            activeBoardId,
            authoritativeShapes,
            comments
          );

          if (currentGeneration !== recoveryGenerationRef.current) {
            isRecoveringRef.current = false;
            useCollaborationStore.getState().setRecovering(false);
            return false;
          }

          if (conflictCount > 0) {
            hasConflict = true;
          }
        }

        setRecoveredAt(recoveryState.recoveredAt);
        setStatus(hasConflict ? "conflict" : "recovered");
        useCollaborationStore.getState().setRecovering(false);

        // Transition back to idle after 2.5s
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          if (recoveryGenerationRef.current === currentGeneration) {
            setStatus("idle");
          }
        }, 3000);

        isRecoveringRef.current = false;
        return true;
      } catch (err) {
        if (currentGeneration === recoveryGenerationRef.current) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to recover authoritative board state.";
          setError(message);
          setStatus("error");
        }
        isRecoveringRef.current = false;
        useCollaborationStore.getState().setRecovering(false);
        return false;
      }
    },
    [queryClient]
  );

  // Automatic Reconnection Lifecycle Listeners
  useEffect(() => {
    if (!boardId || !canvasId) {
      return;
    }

    const socket =
      socketClientService.getSocket() ?? socketClientService.connect();
    let hasConnectedOnce = socket.connected;

    const handleConnect = (): void => {
      if (hasConnectedOnce) {
        triggerRecovery(boardId, canvasId);
      } else {
        hasConnectedOnce = true;
      }
    };

    const handleDisconnect = (): void => {
      setStatus("reconnecting");
    };

    const handleRecoveryState = (payload: BoardRecoveryStatePayload): void => {
      if (payload.boardId === boardId) {
        setRecoveredAt(payload.recoveredAt);
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on(SocketEvents.BOARD_RECOVERY_STATE, handleRecoveryState);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off(SocketEvents.BOARD_RECOVERY_STATE, handleRecoveryState);
    };
  }, [boardId, canvasId, triggerRecovery]);

  return {
    status,
    error,
    recoveredAt,
    triggerRecovery,
    setStatus,
  };
}
