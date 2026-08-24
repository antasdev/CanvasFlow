import { randomUUID } from "crypto";
import {
  CollaborativeInteraction,
  EndInteractionResult,
  InteractionConflict,
  InteractionTarget,
  InteractionType,
  StartInteractionResult,
  UpdateInteractionResult,
} from "./interaction.types";

/**
 * Checks whether an interaction type enforces exclusive single-owner target locks.
 */
function isExclusiveInteraction(type: InteractionType): boolean {
  return (
    type === "moving" ||
    type === "resizing" ||
    type === "rotating" ||
    type === "editing-text"
  );
}

interface TargetOwnerEntry {
  interactionId: string;
  userId: string;
  socketId: string;
  type: InteractionType;
}

/**
 * In-memory Domain Service for Collaborative Interaction State (Slice 16).
 *
 * Coordinates transient gesture ownership, active selections, live transforms,
 * text editing locks, and comment thread activities with O(1) multi-index lookups.
 *
 * Invariant: Transient memory only. ZERO persistence in MongoDB.
 */
export class InteractionManager {
  // Primary interaction map: interactionId -> CollaborativeInteraction
  private interactions = new Map<string, CollaborativeInteraction>();

  // Board index: boardId -> Set of interactionIds
  private boardInteractions = new Map<string, Set<string>>();

  // User index: userId -> Set of interactionIds
  private userInteractions = new Map<string, Set<string>>();

  // Socket index: socketId -> Set of interactionIds
  private socketInteractions = new Map<string, Set<string>>();

  // Target ownership index: `${boardId}:${target.type}:${target.id}` -> TargetOwnerEntry
  private targetOwners = new Map<string, TargetOwnerEntry>();

  /**
   * Generates a deterministic lookup key for a target on a board.
   */
  private getTargetKey(boardId: string, type: string, id: string): string {
    return `${boardId}:${type}:${id}`;
  }

  /**
   * Starts a new collaborative interaction.
   * Enforces exclusive single-owner rules for moving, resizing, rotating, and text editing.
   */
  startInteraction(
    boardId: string,
    socketId: string,
    userId: string,
    type: InteractionType,
    targets: InteractionTarget[],
    data?: Record<string, unknown>
  ): StartInteractionResult {
    const isExclusive = isExclusiveInteraction(type);

    // 1. Check exclusive target ownership rules
    if (isExclusive && targets && targets.length > 0) {
      for (const target of targets) {
        const targetKey = this.getTargetKey(boardId, target.type, target.id);
        const existingOwner = this.targetOwners.get(targetKey);

        if (existingOwner && existingOwner.socketId !== socketId) {
          const conflict: InteractionConflict = {
            code: "INTERACTION_CONFLICT",
            resourceType: target.type,
            resourceId: target.id,
            ownerUserId: existingOwner.userId,
            interactionType: existingOwner.type,
          };

          return {
            success: false,
            conflict,
          };
        }
      }
    }

    const now = new Date().toISOString();
    const interactionId = randomUUID();

    const interaction: CollaborativeInteraction = {
      interactionId,
      socketId,
      userId,
      boardId,
      type,
      targets: targets ? [...targets] : [],
      startedAt: now,
      updatedAt: now,
      data: data ? { ...data } : undefined,
    };

    // 2. Index interaction
    this.interactions.set(interactionId, interaction);

    // Board index
    let boardSet = this.boardInteractions.get(boardId);
    if (!boardSet) {
      boardSet = new Set<string>();
      this.boardInteractions.set(boardId, boardSet);
    }
    boardSet.add(interactionId);

    // User index
    let userSet = this.userInteractions.get(userId);
    if (!userSet) {
      userSet = new Set<string>();
      this.userInteractions.set(userId, userSet);
    }
    userSet.add(interactionId);

    // Socket index
    let socketSet = this.socketInteractions.get(socketId);
    if (!socketSet) {
      socketSet = new Set<string>();
      this.socketInteractions.set(socketId, socketSet);
    }
    socketSet.add(interactionId);

    // 3. Register exclusive target ownerships
    if (isExclusive && targets && targets.length > 0) {
      for (const target of targets) {
        const targetKey = this.getTargetKey(boardId, target.type, target.id);
        this.targetOwners.set(targetKey, {
          interactionId,
          userId,
          socketId,
          type,
        });
      }
    }

    return {
      success: true,
      interaction,
    };
  }

  /**
   * Updates an existing interaction with new target items, transient data, or a heartbeat touch.
   * Only the socket that created the interaction can update it.
   */
  updateInteraction(
    socketId: string,
    interactionId: string,
    data?: Record<string, unknown>,
    targets?: InteractionTarget[]
  ): UpdateInteractionResult {
    const interaction = this.interactions.get(interactionId);
    if (!interaction) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Interaction ${interactionId} not found.`,
        },
      };
    }

    if (interaction.socketId !== socketId) {
      return {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "You cannot update an interaction owned by another socket session.",
        },
      };
    }

    const isExclusive = isExclusiveInteraction(interaction.type);

    // If new targets are provided for an exclusive interaction, verify ownership
    if (isExclusive && targets) {
      const currentTargetKeys = new Set(
        interaction.targets.map((t) => this.getTargetKey(interaction.boardId, t.type, t.id))
      );

      for (const target of targets) {
        const key = this.getTargetKey(interaction.boardId, target.type, target.id);
        if (!currentTargetKeys.has(key)) {
          const owner = this.targetOwners.get(key);
          if (owner && owner.socketId !== socketId) {
            return {
              success: false,
              error: {
                code: "INTERACTION_CONFLICT",
                message: `Target ${target.id} is locked by user ${owner.userId}.`,
              },
            };
          }
        }
      }

      // Clear old target keys
      for (const target of interaction.targets) {
        const key = this.getTargetKey(interaction.boardId, target.type, target.id);
        const owner = this.targetOwners.get(key);
        if (owner && owner.interactionId === interactionId) {
          this.targetOwners.delete(key);
        }
      }

      // Register new target keys
      for (const target of targets) {
        const key = this.getTargetKey(interaction.boardId, target.type, target.id);
        this.targetOwners.set(key, {
          interactionId,
          userId: interaction.userId,
          socketId,
          type: interaction.type,
        });
      }

      interaction.targets = [...targets];
    }

    interaction.updatedAt = new Date().toISOString();
    if (data !== undefined) {
      interaction.data = { ...interaction.data, ...data };
    }

    return {
      success: true,
      interaction,
    };
  }

  /**
   * Ends an active interaction and releases any exclusive target locks.
   * Only the owning socket can end it.
   */
  endInteraction(
    socketId: string,
    interactionId: string
  ): EndInteractionResult {
    const interaction = this.interactions.get(interactionId);
    if (!interaction) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Interaction ${interactionId} not found.`,
        },
      };
    }

    if (interaction.socketId !== socketId) {
      return {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "You cannot end an interaction owned by another socket session.",
        },
      };
    }

    this.deleteInteraction(interaction);

    return {
      success: true,
      interaction,
    };
  }

  /**
   * Internal helper to clean up an interaction from all internal indexes.
   */
  private deleteInteraction(interaction: CollaborativeInteraction): void {
    const { interactionId, boardId, userId, socketId, type, targets } = interaction;

    // 1. Remove from primary map
    this.interactions.delete(interactionId);

    // 2. Remove from board set
    const boardSet = this.boardInteractions.get(boardId);
    if (boardSet) {
      boardSet.delete(interactionId);
      if (boardSet.size === 0) {
        this.boardInteractions.delete(boardId);
      }
    }

    // 3. Remove from user set
    const userSet = this.userInteractions.get(userId);
    if (userSet) {
      userSet.delete(interactionId);
      if (userSet.size === 0) {
        this.userInteractions.delete(userId);
      }
    }

    // 4. Remove from socket set
    const socketSet = this.socketInteractions.get(socketId);
    if (socketSet) {
      socketSet.delete(interactionId);
      if (socketSet.size === 0) {
        this.socketInteractions.delete(socketId);
      }
    }

    // 5. Remove exclusive target ownership locks
    if (isExclusiveInteraction(type) && targets) {
      for (const target of targets) {
        const key = this.getTargetKey(boardId, target.type, target.id);
        const owner = this.targetOwners.get(key);
        if (owner && owner.interactionId === interactionId) {
          this.targetOwners.delete(key);
        }
      }
    }
  }

  /**
   * Retrieves all active interactions for a specific board.
   */
  getBoardInteractions(boardId: string): CollaborativeInteraction[] {
    const interactionIds = this.boardInteractions.get(boardId);
    if (!interactionIds || interactionIds.size === 0) {
      return [];
    }

    const result: CollaborativeInteraction[] = [];
    for (const id of interactionIds) {
      const interaction = this.interactions.get(id);
      if (interaction) {
        result.push(interaction);
      }
    }

    return result;
  }

  /**
   * Retrieves active interactions for a specific user on a board.
   */
  getUserInteractions(boardId: string, userId: string): CollaborativeInteraction[] {
    const userSet = this.userInteractions.get(userId);
    if (!userSet || userSet.size === 0) {
      return [];
    }

    const result: CollaborativeInteraction[] = [];
    for (const id of userSet) {
      const interaction = this.interactions.get(id);
      if (interaction && interaction.boardId === boardId) {
        result.push(interaction);
      }
    }

    return result;
  }

  /**
   * Retrieves the current exclusive owner of a target on a board, if any.
   */
  getTargetOwner(
    boardId: string,
    targetType: string,
    targetId: string,
    excludeSocketId?: string
  ): TargetOwnerEntry | null {
    const key = this.getTargetKey(boardId, targetType, targetId);
    const owner = this.targetOwners.get(key);
    if (!owner) {
      return null;
    }

    if (excludeSocketId && owner.socketId === excludeSocketId) {
      return null;
    }

    return owner;
  }

  /**
   * Removes and returns all active interactions registered to a specific socket connection.
   * Called on socket disconnect.
   */
  removeSocketInteractions(socketId: string): CollaborativeInteraction[] {
    const socketSet = this.socketInteractions.get(socketId);
    if (!socketSet || socketSet.size === 0) {
      return [];
    }

    const removed: CollaborativeInteraction[] = [];
    const interactionIds = Array.from(socketSet);

    for (const id of interactionIds) {
      const interaction = this.interactions.get(id);
      if (interaction) {
        this.deleteInteraction(interaction);
        removed.push(interaction);
      }
    }

    return removed;
  }

  /**
   * Purges interactions that have not received an update within `maxInactivityMs` (default: 10 seconds).
   * Called periodically by the background pruning interval.
   */
  removeExpiredInteractions(maxInactivityMs = 10000): CollaborativeInteraction[] {
    const now = Date.now();
    const expired: CollaborativeInteraction[] = [];

    for (const interaction of this.interactions.values()) {
      const lastUpdate = new Date(interaction.updatedAt).getTime();
      if (now - lastUpdate > maxInactivityMs) {
        expired.push(interaction);
      }
    }

    for (const interaction of expired) {
      this.deleteInteraction(interaction);
    }

    return expired;
  }

  /**
   * Clears all in-memory interactions (used during test teardowns).
   */
  clear(): void {
    this.interactions.clear();
    this.boardInteractions.clear();
    this.userInteractions.clear();
    this.socketInteractions.clear();
    this.targetOwners.clear();
  }
}

export const interactionManager = new InteractionManager();
