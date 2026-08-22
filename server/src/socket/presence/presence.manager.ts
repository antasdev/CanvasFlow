import { ActiveUser, SocketUser } from "../socket.types";

export type JoinBoardResult = {
  isFirstSocketForUser: boolean;
  activeUsers: ActiveUser[];
};

export type LeaveBoardResult = {
  isLastSocketForUser: boolean;
  removedUserId?: string;
  activeUsers: ActiveUser[];
};

export type RemoveSocketResult = LeaveBoardResult & {
  boardId?: string;
};

/**
 * In-memory manager tracking active user presence per board.
 * Supports multi-tab sessions per user and handles graceful disconnection.
 */
export class PresenceManager {
  /**
   * boardId -> socketId -> SocketUser
   */
  private readonly boards = new Map<string, Map<string, SocketUser>>();

  /**
   * socketId -> boardId
   */
  private readonly socketBoards = new Map<string, string>();

  /**
   * Registers a socket joining a board room.
   *
   * @param boardId - The target board identifier
   * @param socketId - The joining socket identifier
   * @param user - The authenticated user attached to the socket
   * @returns Whether this is the user's first socket and the updated active users list
   */
  joinBoard(
    boardId: string,
    socketId: string,
    user: SocketUser
  ): JoinBoardResult {
    let board = this.boards.get(boardId);

    if (!board) {
      board = new Map<string, SocketUser>();
      this.boards.set(boardId, board);
    }

    const userIdStr = user.userId.toString();
    const isFirstSocketForUser = !this.isUserPresentInBoard(board, userIdStr);

    board.set(socketId, user);
    this.socketBoards.set(socketId, boardId);

    return {
      isFirstSocketForUser,
      activeUsers: this.getActiveUsers(boardId),
    };
  }

  /**
   * Removes a socket from a board room.
   *
   * @param boardId - The target board identifier
   * @param socketId - The leaving socket identifier
   * @returns Departure status, removed user ID if last tab, and remaining active users
   */
  leaveBoard(
    boardId: string,
    socketId: string
  ): LeaveBoardResult {
    const board = this.boards.get(boardId);

    if (!board) {
      return {
        isLastSocketForUser: false,
        activeUsers: [],
      };
    }

    const user = board.get(socketId);

    if (!user) {
      return {
        isLastSocketForUser: false,
        activeUsers: this.getActiveUsers(boardId),
      };
    }

    const userIdStr = user.userId.toString();

    board.delete(socketId);
    this.socketBoards.delete(socketId);

    if (board.size === 0) {
      this.boards.delete(boardId);
    }

    const isLastSocketForUser = !this.isUserPresentInBoard(board, userIdStr);

    return {
      isLastSocketForUser,
      removedUserId: isLastSocketForUser ? userIdStr : undefined,
      activeUsers: this.getActiveUsers(boardId),
    };
  }

  /**
   * Removes a socket across all boards based on socketId (disconnect event).
   *
   * @param socketId - The disconnected socket identifier
   * @returns Complete departure result including the board ID
   */
  removeSocket(socketId: string): RemoveSocketResult {
    const boardId = this.socketBoards.get(socketId);

    if (!boardId) {
      return {
        isLastSocketForUser: false,
        activeUsers: [],
      };
    }

    const leaveResult = this.leaveBoard(boardId, socketId);

    return {
      boardId,
      ...leaveResult,
    };
  }

  /**
   * Retrieves unique active users currently present in a board.
   *
   * @param boardId - The board identifier
   * @returns Array of deduplicated safe ActiveUser objects
   */
  getActiveUsers(boardId: string): ActiveUser[] {
    const board = this.boards.get(boardId);

    if (!board) {
      return [];
    }

    const uniqueUsers = new Map<string, ActiveUser>();

    for (const socketUser of board.values()) {
      const idStr = socketUser.userId.toString();
      if (!uniqueUsers.has(idStr)) {
        uniqueUsers.set(idStr, {
          userId: idStr,
          role: socketUser.role,
        });
      }
    }

    return Array.from(uniqueUsers.values());
  }

  /**
   * Looks up the boardId associated with a socket.
   */
  getBoardId(socketId: string): string | undefined {
    return this.socketBoards.get(socketId);
  }

  /**
   * Clears internal state (primarily for test isolation).
   */
  clear(): void {
    this.boards.clear();
    this.socketBoards.clear();
  }

  private isUserPresentInBoard(
    board: Map<string, SocketUser>,
    userIdStr: string
  ): boolean {
    for (const socketUser of board.values()) {
      if (socketUser.userId.toString() === userIdStr) {
        return true;
      }
    }
    return false;
  }
}

export const presenceManager = new PresenceManager();