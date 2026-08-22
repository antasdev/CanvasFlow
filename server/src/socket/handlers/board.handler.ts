import { Types } from "mongoose";

import { boardService } from "@/modules/board";
import { canvasRepository } from "@/modules/canvas";
import { shapeService, ShapeMapper } from "@/modules/shape";
import { ApiError } from "@/shared/utils";
import { HttpStatus, Messages } from "@/shared/constants";

import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";
import { presenceManager } from "../presence/presence.manager";
import {
  AuthSocket,
  BoardJoinAckData,
  JoinBoardPayload,
  LeaveBoardPayload,
  SocketAck,
} from "../socket.types";

/**
 * Registers board room lifecycle event handlers on an authenticated socket.
 */
export const registerBoardHandlers = (socket: AuthSocket): void => {
  /**
   * Handle board:join
   */
  socket.on(
    SocketEvents.BOARD_JOIN,
    async (
      payload: JoinBoardPayload,
      callback?: (response: SocketAck<BoardJoinAckData>) => void
    ) => {
      try {
        if (!payload || !payload.boardId || typeof payload.boardId !== "string") {
          const errorMsg = "boardId is required.";
          socket.emit(SocketEvents.ERROR, errorMsg);
          callback?.({
            success: false,
            error: { code: "BAD_REQUEST", message: errorMsg },
          });
          return;
        }

        if (!Types.ObjectId.isValid(payload.boardId)) {
          const errorMsg = "Invalid boardId format.";
          socket.emit(SocketEvents.ERROR, errorMsg);
          callback?.({
            success: false,
            error: { code: "BAD_REQUEST", message: errorMsg },
          });
          return;
        }

        if (payload.canvasId && !Types.ObjectId.isValid(payload.canvasId)) {
          const errorMsg = "Invalid canvasId format.";
          socket.emit(SocketEvents.ERROR, errorMsg);
          callback?.({
            success: false,
            error: { code: "BAD_REQUEST", message: errorMsg },
          });
          return;
        }

        const userId = socket.data.user.userId;
        const boardObjectId = new Types.ObjectId(payload.boardId);

        // 1. Authorize Board Access
        const board = await boardService.authorizeBoardAccess(
          boardObjectId,
          userId
        );

        // 2. Resolve Canvas
        let resolvedCanvasId: Types.ObjectId;

        if (payload.canvasId) {
          const canvasObjectId = new Types.ObjectId(payload.canvasId);
          const canvas = await canvasRepository.findById(canvasObjectId);

          if (!canvas) {
            throw new ApiError(
              HttpStatus.NOT_FOUND,
              Messages.CANVAS_NOT_FOUND
            );
          }

          if (!canvas.boardId.equals(board._id)) {
            throw new ApiError(
              HttpStatus.BAD_REQUEST,
              "Canvas does not belong to the specified board."
            );
          }

          resolvedCanvasId = canvas._id;
        } else {
          const canvases = await canvasRepository.findByBoardId(board._id);

          if (!canvases || canvases.length === 0) {
            throw new ApiError(
              HttpStatus.NOT_FOUND,
              "No canvas found for this board."
            );
          }

          resolvedCanvasId = canvases[0]._id;
        }

        // 3. Fetch Shapes & Map to Response DTOs
        const rawShapes = await shapeService.getCanvasShapes(resolvedCanvasId);
        const shapes = rawShapes.map((shapeDoc) =>
          ShapeMapper.toResponseDto(shapeDoc)
        );

        // 4. Join Socket.IO Room & Track Presence
        const room = getBoardRoom(payload.boardId);
        socket.join(room);

        const { activeUsers } = presenceManager.joinBoard(
          payload.boardId,
          socket.id,
          socket.data.user
        );

        // 5. Send initial canvas state ONLY to the joining socket
        socket.emit(SocketEvents.CANVAS_SYNC, {
          boardId: payload.boardId,
          canvasId: resolvedCanvasId.toString(),
          shapes,
        });

        // 6. Broadcast user:joined to OTHER clients in the room
        socket.to(room).emit(SocketEvents.USER_JOINED, {
          userId: userId.toString(),
          activeUsers,
        });

        // 7. Structured acknowledgement
        callback?.({
          success: true,
          data: {
            boardId: payload.boardId,
            canvasId: resolvedCanvasId.toString(),
            activeUsers,
          },
        });
      } catch (error) {
        if (error instanceof ApiError) {
          const code =
            error.statusCode === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : error.statusCode === HttpStatus.FORBIDDEN
              ? "FORBIDDEN"
              : "BAD_REQUEST";

          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            error: { code, message: error.message },
          });
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.";

        socket.emit(SocketEvents.ERROR, message);
        callback?.({
          success: false,
          error: { code: "INTERNAL_ERROR", message },
        });
      }
    }
  );

  /**
   * Handle board:leave
   */
  socket.on(
    SocketEvents.BOARD_LEAVE,
    (
      payload: LeaveBoardPayload,
      callback?: (response: SocketAck) => void
    ) => {
      try {
        if (!payload || !payload.boardId || typeof payload.boardId !== "string") {
          callback?.({
            success: false,
            error: { code: "BAD_REQUEST", message: "boardId is required." },
          });
          return;
        }

        const room = getBoardRoom(payload.boardId);
        socket.leave(room);

        const { isLastSocketForUser, activeUsers } =
          presenceManager.leaveBoard(payload.boardId, socket.id);

        if (isLastSocketForUser) {
          socket.to(room).emit(SocketEvents.USER_LEFT, {
            userId: socket.data.user.userId.toString(),
            activeUsers,
          });
        }

        callback?.({ success: true });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to leave board room.";

        callback?.({
          success: false,
          error: { code: "INTERNAL_ERROR", message },
        });
      }
    }
  );
};