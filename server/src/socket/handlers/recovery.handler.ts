import { Types } from "mongoose";

import { boardService } from "@/modules/board";
import { ApiError } from "@/shared/utils";
import { HttpStatus } from "@/shared/constants";

import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";
import { presenceManager } from "../presence/presence.manager";
import {
  AuthSocket,
  BoardRecoveryRequestPayload,
  BoardRecoveryStatePayload,
  SocketAck,
} from "../socket.types";
import { boardRecoveryRequestSchema } from "../validation/recovery.validation";

import { collaborationVersionService } from "../services/collaboration-version.service";

/**
 * Registers board reconnection and state recovery handlers on an authenticated socket.
 * Provides idempotent room rejoining and authoritative presence synchronization.
 */
export const registerRecoveryHandlers = (socket: AuthSocket): void => {
  /**
   * Handle board:recovery-request
   */
  socket.on(
    SocketEvents.BOARD_RECOVERY_REQUEST,
    async (
      payload: BoardRecoveryRequestPayload,
      callback?: (response: SocketAck<BoardRecoveryStatePayload>) => void
    ) => {
      try {
        // 1. Zod payload validation
        const parsed = boardRecoveryRequestSchema.safeParse(payload);
        if (!parsed.success) {
          const firstError = parsed.error.issues[0]?.message ?? "Invalid recovery payload.";
          socket.emit(SocketEvents.ERROR, firstError);
          callback?.({
            success: false,
            error: { code: "BAD_REQUEST", message: firstError },
          });
          return;
        }

        const userId = socket.data.user.userId;
        const boardObjectId = new Types.ObjectId(parsed.data.boardId);

        // 2. Authorize Board Access
        await boardService.authorizeBoardAccess(boardObjectId, userId);

        // 3. Join Socket.IO Room Idempotently
        const room = getBoardRoom(parsed.data.boardId);
        socket.join(room);

        // 4. Update / Rebuild Presence State
        const { isFirstSocketForUser, activeUsers } = presenceManager.joinBoard(
          parsed.data.boardId,
          socket.id,
          socket.data.user
        );

        // 5. If this is a new or revived connection for this user, notify peers
        if (isFirstSocketForUser) {
          socket.to(room).emit(SocketEvents.USER_JOINED, {
            userId: userId.toString(),
            activeUsers,
          });
        }

        // 6. Query authoritative collaboration revision
        const revision = await collaborationVersionService.getBoardRevision(boardObjectId);

        // 7. Build recovery state response
        const recoveryData: BoardRecoveryStatePayload = {
          boardId: parsed.data.boardId,
          revision,
          recoveredAt: new Date().toISOString(),
          presence: {
            activeUsers,
          },
        };

        // 8. Push recovery state to reconnecting client and ack
        socket.emit(SocketEvents.BOARD_RECOVERY_STATE, recoveryData);

        callback?.({
          success: true,
          data: recoveryData,
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
            : "An unexpected error occurred during board recovery.";

        socket.emit(SocketEvents.ERROR, message);
        callback?.({
          success: false,
          error: { code: "INTERNAL_ERROR", message },
        });
      }
    }
  );
};
