import { SocketUser } from "../socket.types";

export class PresenceManager {
  /**
   * boardId -> socketId -> user
   */
  private readonly boards = new Map<
    string,
    Map<string, SocketUser>
  >();

  /**
   * socketId -> boardId
   */
  private readonly socketBoards = new Map<
    string,
    string
  >();

  /**
   * Join a board
   */
  joinBoard(
    boardId: string,
    socketId: string,
    user: SocketUser
  ): void {
    let board = this.boards.get(boardId);

    if (!board) {
      board = new Map();

      this.boards.set(
        boardId,
        board
      );
    }

    board.set(
      socketId,
      user
    );

    this.socketBoards.set(
      socketId,
      boardId
    );
  }

  /**
   * Leave a board
   */
  leaveBoard(
    boardId: string,
    socketId: string
  ): void {
    const board =
      this.boards.get(boardId);

    if (!board) {
      return;
    }

    board.delete(socketId);

    this.socketBoards.delete(
      socketId
    );

    if (board.size === 0) {
      this.boards.delete(boardId);
    }
  }

  /**
   * Remove socket
   */
  removeSocket(
    socketId: string
  ): void {
    const boardId =
      this.socketBoards.get(socketId);

    if (!boardId) {
      return;
    }

    this.leaveBoard(
      boardId,
      socketId
    );
  }

  /**
   * Active users
   */
  getUsers(
    boardId: string
  ): SocketUser[] {
    const board =
      this.boards.get(boardId);

    if (!board) {
      return [];
    }

    return [...board.values()];
  }

  /**
   * Board lookup
   */
  getBoardId(
    socketId: string
  ): string | undefined {
    return this.socketBoards.get(
      socketId
    );
  }
}

export const presenceManager =
  new PresenceManager();