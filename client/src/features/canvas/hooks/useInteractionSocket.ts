import { useEffect, useCallback } from "react";
import { socketClientService } from "@/services/socket";
import type {
  InteractionBroadcastPayload,
  InteractionEndBroadcastPayload,
  InteractionTarget,
  InteractionType,
} from "@/services/socket";
import { useInteractionStore, useCollaborationStore } from "../store";
import { interactionManagerService } from "../services/interaction-manager";
import type { StartInteractionResponse } from "../services/interaction-manager";
import { useAuthStore } from "@/store";

export interface UseInteractionSocketReturn {
  startInteraction: (
    type: InteractionType,
    targets: InteractionTarget[],
    data?: Record<string, unknown>
  ) => Promise<StartInteractionResponse>;

  updateInteraction: (
    interactionId: string,
    data?: Record<string, unknown>,
    targets?: InteractionTarget[]
  ) => Promise<boolean>;

  endInteraction: (interactionId: string) => Promise<boolean>;

  isTargetLockedByPeer: (targetType: string, targetId: string) => boolean;

  getTargetOwner: (targetType: string, targetId: string) => string | null;
}

/**
 * Hook managing collaborative interaction lifecycle, remote gesture coordination,
 * conflict prevention, and recovery snapshot synchronization (Slice 16).
 */
export function useInteractionSocket(boardId?: string): UseInteractionSocketReturn {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const connectionEpoch = useCollaborationStore((state) => state.connectionEpoch);

  // -------------------------------------------------------------
  // Subscription Lifecycle & Reconnection Epoch Sync
  // -------------------------------------------------------------
  useEffect(() => {
    if (!boardId) return;

    // 1. Initial snapshot hydration on connect / epoch increment
    interactionManagerService.recoverSnapshot(boardId);

    // 2. Subscribe to remote interaction events
    const unsubStart = socketClientService.onInteractionStart(
      (payload: InteractionBroadcastPayload) => {
        if (payload.boardId === boardId) {
          useInteractionStore.getState().addInteraction(payload.interaction);
        }
      }
    );

    const unsubUpdate = socketClientService.onInteractionUpdate(
      (payload: InteractionBroadcastPayload) => {
        if (payload.boardId === boardId) {
          useInteractionStore.getState().updateInteraction(
            payload.interaction.interactionId,
            payload.interaction
          );
        }
      }
    );

    const unsubEnd = socketClientService.onInteractionEnd(
      (payload: InteractionEndBroadcastPayload) => {
        if (payload.boardId === boardId) {
          useInteractionStore.getState().removeInteraction(payload.interactionId);
        }
      }
    );

    const unsubSnapshot = socketClientService.onInteractionSnapshot(
      (payload: { boardId: string; interactions: any[] }) => {
        if (payload.boardId === boardId) {
          useInteractionStore.getState().setSnapshot(payload.interactions);
        }
      }
    );

    return () => {
      unsubStart();
      unsubUpdate();
      unsubEnd();
      unsubSnapshot();
      interactionManagerService.cleanup(boardId);
      useInteractionStore.getState().reset();
    };
  }, [boardId, connectionEpoch]);

  // -------------------------------------------------------------
  // Action Handlers
  // -------------------------------------------------------------
  const startInteraction = useCallback(
    async (
      type: InteractionType,
      targets: InteractionTarget[],
      data?: Record<string, unknown>
    ): Promise<StartInteractionResponse> => {
      if (!boardId) {
        return { success: false, error: "Board ID is required." };
      }

      return interactionManagerService.startInteraction(boardId, type, targets, data);
    },
    [boardId]
  );

  const updateInteraction = useCallback(
    async (
      interactionId: string,
      data?: Record<string, unknown>,
      targets?: InteractionTarget[]
    ): Promise<boolean> => {
      if (!boardId) return false;
      return interactionManagerService.updateInteraction(boardId, interactionId, data, targets);
    },
    [boardId]
  );

  const endInteraction = useCallback(
    async (interactionId: string): Promise<boolean> => {
      if (!boardId) return false;
      return interactionManagerService.endInteraction(boardId, interactionId);
    },
    [boardId]
  );

  const isTargetLockedByPeer = useCallback(
    (targetType: string, targetId: string): boolean => {
      const owner = useInteractionStore.getState().getTargetOwner(targetType, targetId, currentUserId);
      return owner !== null;
    },
    [currentUserId]
  );

  const getTargetOwner = useCallback(
    (targetType: string, targetId: string): string | null => {
      const owner = useInteractionStore.getState().getTargetOwner(targetType, targetId, currentUserId);
      return owner ? owner.userId : null;
    },
    [currentUserId]
  );

  return {
    startInteraction,
    updateInteraction,
    endInteraction,
    isTargetLockedByPeer,
    getTargetOwner,
  };
}
