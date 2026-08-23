import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";
import { AuthSocket, CursorMovePayload } from "../socket.types";
import { cursorMoveSchema } from "../validation/cursor.validation";
import { presenceManager } from "../presence/presence.manager";

/**
 * Registers real-time collaborator cursor event handlers on an authenticated socket.
 * Cursor events are high-frequency, ephemeral, and bypass database persistence completely.
 */
export const registerCursorHandlers = (socket: AuthSocket): void => {
  /**
   * Handle cursor:move (fire-and-forget)
   */
  socket.on(SocketEvents.CURSOR_MOVE, (payload: CursorMovePayload): void => {
    try {
      const parsed = cursorMoveSchema.safeParse(payload);

      if (!parsed.success) {
        // Drop invalid ephemeral cursor payloads silently without disrupting collaboration
        return;
      }

      const boardRoom = getBoardRoom(parsed.data.boardId);

      // Verify the socket has joined the target board room
      if (!socket.rooms.has(boardRoom)) {
        return;
      }

      const userId = socket.data.user.userId.toString();

      // Update in-memory presence manager state
      presenceManager.updateCursor(
        parsed.data.boardId,
        userId,
        parsed.data.x,
        parsed.data.y
      );

      // Broadcast exclusively to other collaborators in the board room (excludes sender)
      socket.to(boardRoom).emit(SocketEvents.CURSOR_MOVED, {
        userId,
        boardId: parsed.data.boardId,
        x: parsed.data.x,
        y: parsed.data.y,
      });
    } catch {
      // Ephemeral error safety guarantee: never crash the socket server
    }
  });
};
