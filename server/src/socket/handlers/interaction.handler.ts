import { Server } from "socket.io";
import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";
import { interactionManager } from "../presence/interaction.manager";
import {
  AuthSocket,
  ClientToServerEvents,
  InterServerEvents,
  InteractionEndPayload,
  InteractionSnapshotPayload,
  InteractionStartPayload,
  InteractionUpdatePayload,
  ServerToClientEvents,
  SocketData,
} from "../socket.types";
import {
  interactionEndSchema,
  interactionSnapshotSchema,
  interactionStartSchema,
  interactionUpdateSchema,
} from "../validation/interaction.validation";

/**
 * Registers real-time collaborative interaction state event handlers on an authenticated socket.
 *
 * Invariant: Ephemeral interaction state ONLY. ZERO database writes, ZERO revision increments.
 */
export function registerInteractionHandlers(
  _io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  socket: AuthSocket
): void {
  // -------------------------------------------------------------
  // interaction:start
  // -------------------------------------------------------------
  socket.on("interaction:start", (payload: InteractionStartPayload, callback) => {
    try {
      const parsed = interactionStartSchema.safeParse(payload);
      if (!parsed.success) {
        callback?.({
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: parsed.error.issues[0]?.message ?? "Invalid interaction:start payload.",
          },
        });
        return;
      }

      const room = getBoardRoom(parsed.data.boardId);
      if (!socket.rooms.has(room)) {
        callback?.({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You must join the board room before starting an interaction.",
          },
        });
        return;
      }

      const userId = socket.data.user.userId.toString();
      const result = interactionManager.startInteraction(
        parsed.data.boardId,
        socket.id,
        userId,
        parsed.data.type,
        parsed.data.targets,
        parsed.data.data
      );

      if (!result.success || !result.interaction) {
        callback?.({
          success: false,
          error: {
            code: "INTERACTION_CONFLICT",
            message: "Target resource is currently locked by another collaborator.",
            resourceType: result.conflict?.resourceType,
            resourceId: result.conflict?.resourceId,
            ownerUserId: result.conflict?.ownerUserId,
            interactionType: result.conflict?.interactionType,
          },
        });
        return;
      }

      // Broadcast to other room members (sender excluded)
      socket.to(room).emit(SocketEvents.INTERACTION_START, {
        boardId: parsed.data.boardId,
        interaction: result.interaction,
      });

      callback?.({
        success: true,
        data: {
          interactionId: result.interaction.interactionId,
          startedAt: result.interaction.startedAt,
        },
      });
    } catch (error) {
      callback?.({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to start interaction.",
        },
      });
    }
  });

  // -------------------------------------------------------------
  // interaction:update
  // -------------------------------------------------------------
  socket.on("interaction:update", (payload: InteractionUpdatePayload, callback) => {
    try {
      const parsed = interactionUpdateSchema.safeParse(payload);
      if (!parsed.success) {
        callback?.({
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: parsed.error.issues[0]?.message ?? "Invalid interaction:update payload.",
          },
        });
        return;
      }

      const room = getBoardRoom(parsed.data.boardId);
      if (!socket.rooms.has(room)) {
        callback?.({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You must join the board room before updating an interaction.",
          },
        });
        return;
      }

      const result = interactionManager.updateInteraction(
        socket.id,
        parsed.data.interactionId,
        parsed.data.data,
        parsed.data.targets
      );

      if (!result.success || !result.interaction) {
        callback?.({
          success: false,
          error: {
            code: result.error?.code ?? "BAD_REQUEST",
            message: result.error?.message ?? "Failed to update interaction.",
          },
        });
        return;
      }

      // Broadcast to other room members (sender excluded)
      socket.to(room).emit(SocketEvents.INTERACTION_UPDATE, {
        boardId: parsed.data.boardId,
        interaction: result.interaction,
      });

      callback?.({ success: true });
    } catch (error) {
      callback?.({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to update interaction.",
        },
      });
    }
  });

  // -------------------------------------------------------------
  // interaction:end
  // -------------------------------------------------------------
  socket.on("interaction:end", (payload: InteractionEndPayload, callback) => {
    try {
      const parsed = interactionEndSchema.safeParse(payload);
      if (!parsed.success) {
        callback?.({
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: parsed.error.issues[0]?.message ?? "Invalid interaction:end payload.",
          },
        });
        return;
      }

      const room = getBoardRoom(parsed.data.boardId);
      if (!socket.rooms.has(room)) {
        callback?.({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You must join the board room before ending an interaction.",
          },
        });
        return;
      }

      const result = interactionManager.endInteraction(
        socket.id,
        parsed.data.interactionId
      );

      if (!result.success || !result.interaction) {
        callback?.({
          success: false,
          error: {
            code: result.error?.code ?? "BAD_REQUEST",
            message: result.error?.message ?? "Failed to end interaction.",
          },
        });
        return;
      }

      // Broadcast end event to other room members (sender excluded)
      socket.to(room).emit(SocketEvents.INTERACTION_END, {
        boardId: parsed.data.boardId,
        interactionId: result.interaction.interactionId,
        userId: result.interaction.userId,
        type: result.interaction.type,
        targets: result.interaction.targets,
      });

      callback?.({ success: true });
    } catch (error) {
      callback?.({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to end interaction.",
        },
      });
    }
  });

  // -------------------------------------------------------------
  // interaction:snapshot
  // -------------------------------------------------------------
  socket.on("interaction:snapshot", (payload: InteractionSnapshotPayload, callback) => {
    try {
      const parsed = interactionSnapshotSchema.safeParse(payload);
      if (!parsed.success) {
        callback?.({
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: parsed.error.issues[0]?.message ?? "Invalid interaction:snapshot payload.",
          },
        });
        return;
      }

      const room = getBoardRoom(parsed.data.boardId);
      if (!socket.rooms.has(room)) {
        callback?.({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You must join the board room before requesting an interaction snapshot.",
          },
        });
        return;
      }

      const interactions = interactionManager.getBoardInteractions(parsed.data.boardId);

      const snapshotData = {
        boardId: parsed.data.boardId,
        interactions,
      };

      socket.emit(SocketEvents.INTERACTION_SNAPSHOT, snapshotData);

      callback?.({
        success: true,
        data: snapshotData,
      });
    } catch (error) {
      callback?.({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to retrieve interaction snapshot.",
        },
      });
    }
  });
}
