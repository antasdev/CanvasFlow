import { Types } from "mongoose";
import { shapeService } from "@/modules/shape/shape.service";
import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";
import { AuthSocket, SelectionChangePayload } from "../socket.types";
import { selectionChangeSchema } from "../validation/selection.validation";
import { socketRateLimiter } from "../services/socket-rate-limiter.service";

/**
 * Registers real-time collaborator selection event handlers on an authenticated socket.
 * Selection state is ephemeral, latency-sensitive, and never persisted to MongoDB.
 */
export const registerSelectionHandlers = (socket: AuthSocket): void => {
  /**
   * Handle selection:change (fire-and-forget)
   */
  socket.on(
    SocketEvents.SELECTION_CHANGE,
    async (payload: SelectionChangePayload): Promise<void> => {
      try {
        if (!socketRateLimiter.check(socket.id, "selection")) {
          return;
        }

        const parsed = selectionChangeSchema.safeParse(payload);

        if (!parsed.success) {
          // Drop invalid selection payloads silently without disrupting collaboration
          return;
        }

        const { boardId, shapeIds } = parsed.data;
        const boardRoom = getBoardRoom(boardId);

        // Verify the socket has joined the target board room
        if (!socket.rooms.has(boardRoom)) {
          return;
        }

        // Verify selected shapes belong to the board
        if (shapeIds.length > 0) {
          const boardObjectId = new Types.ObjectId(boardId);
          const shapeObjectIds = shapeIds.map((id) => new Types.ObjectId(id));

          const isValid = await shapeService.verifyShapesBelongToBoard(
            boardObjectId,
            shapeObjectIds
          );

          if (!isValid) {
            return;
          }
        }

        const userId = socket.data.user.userId.toString();

        // Broadcast exclusively to other collaborators in the board room (excludes sender)
        socket.to(boardRoom).emit(SocketEvents.SELECTION_CHANGED, {
          userId,
          boardId,
          shapeIds,
        });
      } catch (err) {
        console.error("[SelectionHandler] Error:", err);
      }
    }
  );
};
