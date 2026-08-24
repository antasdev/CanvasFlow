import { Server } from "socket.io";
import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";
import { presenceManager } from "../presence/presence.manager";
import {
  AuthSocket,
  ClientToServerEvents,
  InterServerEvents,
  PresenceActivity,
  PresenceActivityPayload,
  PresenceCursorPayload,
  PresenceHeartbeatPayload,
  PresenceSnapshotPayload,
  ServerToClientEvents,
  SocketAck,
  SocketData,
} from "../socket.types";
import {
  presenceActivitySchema,
  presenceCursorSchema,
  presenceHeartbeatSchema,
  presenceSnapshotSchema,
} from "../validation/presence.validation";

/**
 * Registers real-time collaborative presence and session lifecycle event handlers on an authenticated socket.
 * Handles heartbeats, cursor positions, activity states, and presence snapshots.
 * Presence is strictly ephemeral: ZERO MongoDB writes, ZERO revision increments, and ZERO mutation records.
 */
export const registerPresenceHandlers = (
  _io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >,
  socket: AuthSocket
): void => {
  /**
   * Handle presence:heartbeat
   */
  socket.on(
    SocketEvents.PRESENCE_HEARTBEAT,
    (
      payload: PresenceHeartbeatPayload,
      callback?: (response: SocketAck) => void
    ): void => {
      try {
        const parsed = presenceHeartbeatSchema.safeParse(payload);
        if (!parsed.success) {
          callback?.({
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: parsed.error.issues[0]?.message ?? "Invalid heartbeat payload.",
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
              message: "You must join the board room before sending presence heartbeats.",
            },
          });
          return;
        }

        presenceManager.touchSession(socket.id);
        callback?.({ success: true });
      } catch (error) {
        callback?.({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Failed to process heartbeat.",
          },
        });
      }
    }
  );

  /**
   * Handle presence:cursor (fire-and-forget, throttled stream)
   */
  socket.on(
    SocketEvents.PRESENCE_CURSOR,
    (payload: PresenceCursorPayload): void => {
      try {
        const parsed = presenceCursorSchema.safeParse(payload);
        if (!parsed.success) {
          return;
        }

        const room = getBoardRoom(parsed.data.boardId);
        if (!socket.rooms.has(room)) {
          return;
        }

        const userId = socket.data.user.userId.toString();
        const cursor = presenceManager.updateCursor(
          parsed.data.boardId,
          userId,
          parsed.data.x,
          parsed.data.y
        );

        // Broadcast to other collaborators in the room (excludes sender)
        socket.to(room).emit(SocketEvents.PRESENCE_CURSOR, {
          boardId: parsed.data.boardId,
          userId,
          x: cursor.x,
          y: cursor.y,
          updatedAt: cursor.updatedAt,
        });

        // Also emit legacy cursor:moved for backward compatibility
        socket.to(room).emit(SocketEvents.CURSOR_MOVED, {
          userId,
          boardId: parsed.data.boardId,
          x: cursor.x,
          y: cursor.y,
        });
      } catch {
        // Ephemeral safety guarantee: never crash on cursor transport errors
      }
    }
  );

  /**
   * Handle presence:activity
   */
  socket.on(
    SocketEvents.PRESENCE_ACTIVITY,
    (
      payload: PresenceActivityPayload,
      callback?: (response: SocketAck) => void
    ): void => {
      try {
        const parsed = presenceActivitySchema.safeParse(payload);
        if (!parsed.success) {
          callback?.({
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: parsed.error.issues[0]?.message ?? "Invalid activity payload.",
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
              message: "You must join the board room before updating presence activity.",
            },
          });
          return;
        }

        const userId = socket.data.user.userId.toString();
        const activity = parsed.data.activity as PresenceActivity;
        const updatedUser = presenceManager.updateActivity(
          parsed.data.boardId,
          userId,
          activity
        );

        const now = new Date().toISOString();

        // Broadcast to other room members
        socket.to(room).emit(SocketEvents.PRESENCE_ACTIVITY, {
          boardId: parsed.data.boardId,
          userId,
          activity,
          updatedAt: updatedUser?.lastSeenAt ?? now,
        });

        callback?.({ success: true });
      } catch (error) {
        callback?.({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Failed to update activity.",
          },
        });
      }
    }
  );

  /**
   * Handle presence:snapshot request
   */
  socket.on(
    SocketEvents.PRESENCE_SNAPSHOT,
    (
      payload: { boardId: string },
      callback?: (response: SocketAck<PresenceSnapshotPayload>) => void
    ): void => {
      try {
        const parsed = presenceSnapshotSchema.safeParse(payload);
        if (!parsed.success) {
          callback?.({
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: parsed.error.issues[0]?.message ?? "Invalid snapshot payload.",
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
              message: "You must join the board room before requesting presence snapshot.",
            },
          });
          return;
        }

        const snapshot = presenceManager.getBoardSnapshot(parsed.data.boardId);
        callback?.({
          success: true,
          data: snapshot,
        });
      } catch (error) {
        callback?.({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Failed to retrieve snapshot.",
          },
        });
      }
    }
  );
};