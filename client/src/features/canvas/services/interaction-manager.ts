import { socketClientService } from "@/services/socket";
import type {
  CollaborativeInteraction,
  InteractionConflict,
  InteractionTarget,
  InteractionType,
} from "@/services/socket";
import { useInteractionStore } from "../store/interaction.store";
import { useAuthStore } from "@/store";

export interface StartInteractionResponse {
  success: boolean;
  interactionId?: string;
  conflict?: InteractionConflict;
  error?: string;
}

/**
 * Frontend Interaction Manager (Slice 16)
 *
 * Coordinates local interaction lifecycle, throttles high-frequency update packets,
 * manages active local interaction IDs, handles server conflict responses, and recovers
 * snapshots on reconnection without polluting canvas undo/redo history.
 */
export class FrontendInteractionManager {
  private activeLocalInteractions = new Map<string, CollaborativeInteraction>();
  private lastUpdateEmitTimes = new Map<string, number>();

  /**
   * Starts a collaborative interaction.
   * Performs an immediate local pre-check to prevent starting interactions on peer-locked targets.
   */
  public async startInteraction(
    boardId: string,
    type: InteractionType,
    targets: InteractionTarget[],
    data?: Record<string, unknown>
  ): Promise<StartInteractionResponse> {
    if (!boardId || !targets || targets.length === 0) {
      return { success: false, error: "Invalid boardId or empty targets." };
    }

    const currentUserId = useAuthStore.getState().user?.id;

    // 1. Fast local pre-check for exclusive target ownership
    for (const target of targets) {
      const owner = useInteractionStore.getState().getTargetOwner(target.type, target.id, currentUserId);
      if (owner) {
        return {
          success: false,
          conflict: {
            code: "INTERACTION_CONFLICT",
            resourceType: target.type,
            resourceId: target.id,
            ownerUserId: owner.userId,
            interactionType: owner.type,
          },
        };
      }
    }

    // 2. Request authoritative server start
    const result = await socketClientService.startInteraction(
      boardId,
      type,
      targets,
      data
    );

    if (!result.success || !result.interactionId) {
      if (result.error?.code === "INTERACTION_CONFLICT") {
        return {
          success: false,
          conflict: {
            code: "INTERACTION_CONFLICT",
            resourceType: (result.error.resourceType as any) ?? "shape",
            resourceId: result.error.resourceId ?? targets[0].id,
            ownerUserId: result.error.ownerUserId ?? "unknown",
            interactionType: (result.error.interactionType as any) ?? type,
          },
        };
      }

      return {
        success: false,
        error: result.error?.message ?? "Failed to start interaction.",
      };
    }

    const now = result.startedAt ?? new Date().toISOString();
    const interaction: CollaborativeInteraction = {
      interactionId: result.interactionId,
      socketId: socketClientService.getSocket()?.id ?? "local",
      userId: currentUserId ?? "anonymous",
      boardId,
      type,
      targets: [...targets],
      startedAt: now,
      updatedAt: now,
      data: data ? { ...data } : undefined,
    };

    // 3. Track locally and in interaction store
    this.activeLocalInteractions.set(result.interactionId, interaction);
    useInteractionStore.getState().setLocalInteraction(interaction);

    return {
      success: true,
      interactionId: result.interactionId,
    };
  }

  /**
   * Updates an active collaborative interaction with throttled socket emissions (~30 FPS).
   */
  public async updateInteraction(
    boardId: string,
    interactionId: string,
    data?: Record<string, unknown>,
    targets?: InteractionTarget[]
  ): Promise<boolean> {
    const local = this.activeLocalInteractions.get(interactionId);
    if (!local) {
      return false;
    }

    const now = Date.now();
    const lastEmit = this.lastUpdateEmitTimes.get(interactionId) ?? 0;

    // Update local store immediately for fluid UI
    useInteractionStore.getState().updateInteraction(interactionId, {
      data,
      targets,
      updatedAt: new Date().toISOString(),
    });

    if (now - lastEmit < 33) {
      // Throttle rapid updates to ~30 FPS
      return true;
    }

    this.lastUpdateEmitTimes.set(interactionId, now);
    return socketClientService.updateInteraction(boardId, interactionId, data, targets);
  }

  /**
   * Ends an active collaborative interaction, releasing locks.
   */
  public async endInteraction(
    boardId: string,
    interactionId: string
  ): Promise<boolean> {
    if (!this.activeLocalInteractions.has(interactionId)) {
      return false;
    }

    this.activeLocalInteractions.delete(interactionId);
    this.lastUpdateEmitTimes.delete(interactionId);

    // Remove from local store immediately
    useInteractionStore.getState().removeLocalInteraction(interactionId);

    return socketClientService.endInteraction(boardId, interactionId);
  }

  /**
   * Ends all active local interactions (e.g. on unmount or navigation).
   */
  public cleanup(boardId?: string): void {
    for (const [id, interaction] of this.activeLocalInteractions.entries()) {
      const targetBoardId = boardId ?? interaction.boardId;
      if (targetBoardId) {
        socketClientService.endInteraction(targetBoardId, id);
      }
    }

    this.activeLocalInteractions.clear();
    this.lastUpdateEmitTimes.clear();
  }

  /**
   * Hydrates authoritative interaction snapshot upon reconnection or initial mount.
   */
  public async recoverSnapshot(boardId: string): Promise<void> {
    this.activeLocalInteractions.clear();
    this.lastUpdateEmitTimes.clear();

    const snapshot = await socketClientService.getInteractionSnapshot(boardId);
    useInteractionStore.getState().setSnapshot(snapshot);
  }
}

export const interactionManagerService = new FrontendInteractionManager();
