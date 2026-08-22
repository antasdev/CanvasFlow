import { shapeLockManager } from "../locks/shape-lock.manager";
import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";
import {
  AuthSocket,
  ShapeTransformEndPayload,
  ShapeTransformingPayload,
  TransformEndPayload,
  TransformingShapePayload,
} from "../socket.types";
import {
  transformEndSchema,
  transformingShapeSchema,
} from "../validation/transform.validation";

/**
 * Registers real-time shape transformation event handlers on an authenticated socket.
 * Enables live ephemeral 30-60 FPS transformation streaming with zero MongoDB write amplification.
 */
export const registerTransformHandlers = (socket: AuthSocket): void => {
  /**
   * Handle shape:transforming (live ephemeral drag/resize/rotation frames)
   */
  socket.on(
    SocketEvents.SHAPE_TRANSFORMING,
    (payload: TransformingShapePayload): void => {
      try {
        const parsed = transformingShapeSchema.safeParse(payload);
        if (!parsed.success) {
          return;
        }

        const { boardId, shapeId, x, y, width, height, rotation } = parsed.data;
        const boardRoom = getBoardRoom(boardId);

        // 1. Verify socket is inside the target board room
        if (!socket.rooms.has(boardRoom)) {
          return;
        }

        // 2. Verify socket owns the active soft-lock on this shape
        const lock = shapeLockManager.getLock(boardId, shapeId);
        if (!lock || lock.socketId !== socket.id) {
          return;
        }

        // 3. Refresh soft-lock activity timestamp
        shapeLockManager.refreshLock(boardId, shapeId, socket.id);

        const transformPayload: ShapeTransformingPayload = {
          boardId,
          shapeId,
          userId: lock.userId,
          fullName: lock.fullName,
          color: lock.color,
          x,
          y,
          width,
          height,
          rotation,
        };

        // 4. Broadcast to other collaborators in the board room (sender excluded)
        socket
          .to(boardRoom)
          .emit(SocketEvents.SHAPE_TRANSFORMING, transformPayload);
      } catch (error) {
        console.warn("[TransformHandler] Error processing transform frame:", error);
      }
    }
  );

  /**
   * Handle shape:transform-end (notifies peers that active manipulation has finished)
   */
  socket.on(
    SocketEvents.SHAPE_TRANSFORM_END,
    (payload: TransformEndPayload): void => {
      try {
        const parsed = transformEndSchema.safeParse(payload);
        if (!parsed.success) {
          return;
        }

        const { boardId, shapeId } = parsed.data;
        const boardRoom = getBoardRoom(boardId);

        if (!socket.rooms.has(boardRoom)) {
          return;
        }

        const endPayload: ShapeTransformEndPayload = {
          boardId,
          shapeId,
        };

        // Broadcast transform completion to peer collaborators
        socket
          .to(boardRoom)
          .emit(SocketEvents.SHAPE_TRANSFORM_END, endPayload);
      } catch (error) {
        console.warn("[TransformHandler] Error processing transform end:", error);
      }
    }
  );
};
