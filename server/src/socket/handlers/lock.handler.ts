import { Types } from "mongoose";
import { UserModel } from "@/modules/user/user.model";
import { boardService } from "@/modules/board/board.service";
import { shapeService } from "@/modules/shape/shape.service";
import { ApiError } from "@/shared/utils";
import { HttpStatus } from "@/shared/constants";
import { shapeLockManager } from "../locks/shape-lock.manager";
import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";
import {
  AuthSocket,
  LockShapePayload,
  RefreshShapeLockPayload,
  ShapeLockedPayload,
  SocketAck,
  UnlockShapePayload,
} from "../socket.types";
import {
  lockShapeSchema,
  refreshShapeLockSchema,
  unlockShapeSchema,
} from "../validation/lock.validation";

/**
 * Registers real-time collaborator shape soft-lock event handlers on an authenticated socket.
 * Handles lock acquisition, release, activity refreshing, and peer notifications.
 */
export const registerLockHandlers = (socket: AuthSocket): void => {
  /**
   * Handle shape:lock (exclusive soft-lock request before transformation)
   */
  socket.on(
    SocketEvents.SHAPE_LOCK,
    async (
      payload: LockShapePayload,
      callback?: (response: SocketAck<ShapeLockedPayload>) => void
    ): Promise<void> => {
      try {
        const parsed = lockShapeSchema.safeParse(payload);

        if (!parsed.success) {
          callback?.({
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Invalid shape lock payload parameters.",
            },
          });
          return;
        }

        const { boardId, shapeId } = parsed.data;
        const boardRoom = getBoardRoom(boardId);

        // 1. Verify socket is inside the target board room
        if (!socket.rooms.has(boardRoom)) {
          callback?.({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Socket must join the board room before acquiring locks.",
            },
          });
          return;
        }

        // 2. Authorize canvas mutation (ensure user has EDIT_CANVAS permission)
        const boardObjectId = new Types.ObjectId(boardId);
        const shapeObjectId = new Types.ObjectId(shapeId);

        await boardService.authorizeCanvasMutation(
          boardObjectId,
          new Types.ObjectId(socket.data.user.userId)
        );

        // 3. Verify shape belongs to this board
        const shapeBelongs = await shapeService.verifyShapesBelongToBoard(
          boardObjectId,
          [shapeObjectId]
        );

        if (!shapeBelongs) {
          callback?.({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Target shape does not exist on this board.",
            },
          });
          return;
        }

        const userId = socket.data.user.userId.toString();

        // 4. Resolve display name
        let fullName = `User ${userId.slice(-4)}`;
        try {
          const userDoc = await UserModel.findById(socket.data.user.userId).select(
            "fullName"
          );
          if (userDoc?.fullName) {
            fullName = userDoc.fullName;
          }
        } catch {
          // Fallback to short identifier
        }

        // 5. Attempt atomic lock acquisition
        const result = shapeLockManager.acquireLock(
          boardId,
          shapeId,
          socket.id,
          userId,
          fullName
        );

        if (!result.success) {
          callback?.({
            success: false,
            error: {
              code: "SHAPE_LOCKED",
              message: "Shape is currently being edited by another collaborator.",
            },
          });
          return;
        }

        const lockPayload: ShapeLockedPayload = {
          boardId,
          shapeId,
          userId,
          fullName: result.lock.fullName,
          color: result.lock.color,
        };

        // Broadcast to other collaborators in room (sender excluded)
        socket.to(boardRoom).emit(SocketEvents.SHAPE_LOCKED, lockPayload);

        // Acknowledge acquiring socket
        callback?.({
          success: true,
          data: lockPayload,
        });
      } catch (error) {
        if (error instanceof ApiError) {
          const code =
            error.statusCode === HttpStatus.FORBIDDEN
              ? "FORBIDDEN"
              : error.statusCode === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : "BAD_REQUEST";
          callback?.({
            success: false,
            error: {
              code,
              message: error.message,
            },
          });
          return;
        }

        callback?.({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "Failed to process shape lock request.",
          },
        });
      }
    }
  );

  /**
   * Handle shape:unlock (release soft-lock on transformation end)
   */
  socket.on(
    SocketEvents.SHAPE_UNLOCK,
    (
      payload: UnlockShapePayload,
      callback?: (response: SocketAck<void>) => void
    ): void => {
      try {
        const parsed = unlockShapeSchema.safeParse(payload);

        if (!parsed.success) {
          callback?.({
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Invalid shape unlock payload parameters.",
            },
          });
          return;
        }

        const { boardId, shapeId } = parsed.data;
        const boardRoom = getBoardRoom(boardId);

        if (!socket.rooms.has(boardRoom)) {
          callback?.({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Socket must be in the board room to release locks.",
            },
          });
          return;
        }

        const releasedLock = shapeLockManager.releaseLock(
          boardId,
          shapeId,
          socket.id
        );

        if (releasedLock) {
          // Broadcast unlock to peer collaborators
          socket.to(boardRoom).emit(SocketEvents.SHAPE_UNLOCKED, {
            boardId,
            shapeId,
          });
        }

        callback?.({
          success: true,
        });
      } catch (error) {
        callback?.({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "Failed to release shape lock.",
          },
        });
      }
    }
  );

  /**
   * Handle shape:lock-refresh (extend timeout during ongoing active drag/transform)
   */
  socket.on(
    SocketEvents.SHAPE_LOCK_REFRESH,
    (
      payload: RefreshShapeLockPayload,
      callback?: (response: SocketAck<void>) => void
    ): void => {
      try {
        const parsed = refreshShapeLockSchema.safeParse(payload);

        if (!parsed.success) {
          callback?.({
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Invalid lock refresh payload parameters.",
            },
          });
          return;
        }

        const { boardId, shapeId } = parsed.data;
        const refreshed = shapeLockManager.refreshLock(
          boardId,
          shapeId,
          socket.id
        );

        callback?.({
          success: refreshed,
          error: refreshed
            ? undefined
            : {
                code: "NOT_FOUND",
                message: "Lock not found or not owned by requesting socket.",
              },
        });
      } catch (error) {
        callback?.({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "Failed to refresh shape lock.",
          },
        });
      }
    }
  );
};
