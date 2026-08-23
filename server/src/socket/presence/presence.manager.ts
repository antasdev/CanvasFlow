import { randomUUID } from "crypto";
import { ActiveUser, SocketUser } from "../socket.types";
import {
  PresenceActivity,
  PresenceCursor,
  PresenceSession,
  PresenceSnapshotPayload,
  PresenceUser,
} from "./presence.types";

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

export type RegisterSessionResult = {
  session: PresenceSession;
  isFirstSocketForUser: boolean;
  presenceUser: PresenceUser;
  snapshot: PresenceSnapshotPayload;
};

export type UnregisterSessionResult = {
  boardId?: string;
  userId?: string;
  sessionId?: string;
  isLastSocketForUser: boolean;
  remainingSessions: number;
  removedUserId?: string;
};

export type ExpiredSessionInfo = {
  boardId: string;
  userId: string;
  socketId: string;
  sessionId: string;
  isLastSocketForUser: boolean;
};

/**
 * In-memory manager tracking active collaborator presence and session lifecycles per board.
 * Maintains strict separation between User Identity (logical collaborator) and Socket Identity (individual connection).
 * Supports multi-tab sessions, heartbeats, stale session pruning, live cursors, and activity states.
 * Guarantees zero MongoDB writes, zero revision increments, and zero undo/redo pollution.
 */
export class PresenceManager {
  /**
   * socketId -> PresenceSession
   */
  private readonly sessions = new Map<string, PresenceSession>();

  /**
   * boardId -> Set<socketId>
   */
  private readonly boardSockets = new Map<string, Set<string>>();

  /**
   * userId -> Set<socketId>
   */
  private readonly userSockets = new Map<string, Set<string>>();

  /**
   * boardId -> Map<userId, PresenceUser>
   */
  private readonly boardUsers = new Map<string, Map<string, PresenceUser>>();

  /**
   * boardId -> Map<userId, PresenceCursor>
   */
  private readonly boardCursors = new Map<string, Map<string, PresenceCursor>>();

  /**
   * Legacy backward-compatibility storage: boardId -> socketId -> SocketUser
   */
  private readonly legacyBoards = new Map<string, Map<string, SocketUser>>();

  /**
   * Registers an authenticated socket session on a board room.
   * Generates a server-authoritative UUID v4 sessionId.
   */
  registerSession(
    boardId: string,
    socketId: string,
    user: {
      userId: string;
      fullName: string;
      avatar?: string;
    }
  ): RegisterSessionResult {
    const now = new Date().toISOString();
    const sessionId = randomUUID();

    // 1. Create or retrieve board users map
    let usersMap = this.boardUsers.get(boardId);
    if (!usersMap) {
      usersMap = new Map<string, PresenceUser>();
      this.boardUsers.set(boardId, usersMap);
    }

    // 2. Track user sockets
    let userSocketSet = this.userSockets.get(user.userId);
    if (!userSocketSet) {
      userSocketSet = new Set<string>();
      this.userSockets.set(user.userId, userSocketSet);
    }
    userSocketSet.add(socketId);

    // 3. Track board sockets
    let boardSocketSet = this.boardSockets.get(boardId);
    if (!boardSocketSet) {
      boardSocketSet = new Set<string>();
      this.boardSockets.set(boardId, boardSocketSet);
    }
    boardSocketSet.add(socketId);

    // 4. Create session model
    const session: PresenceSession = {
      sessionId,
      socketId,
      userId: user.userId,
      boardId,
      connectedAt: now,
      lastHeartbeatAt: now,
    };
    this.sessions.set(socketId, session);

    // Also update legacy board map for backward compatibility
    let legacyBoard = this.legacyBoards.get(boardId);
    if (!legacyBoard) {
      legacyBoard = new Map<string, SocketUser>();
      this.legacyBoards.set(boardId, legacyBoard);
    }
    legacyBoard.set(socketId, {
      userId: user.userId as any,
      role: "USER" as any,
    });

    // 5. Update or create PresenceUser
    const isFirstSocketForUser = !usersMap.has(user.userId);
    const existingUser = usersMap.get(user.userId);

    const sessionCount = userSocketSet.size;
    const presenceUser: PresenceUser = {
      userId: user.userId,
      fullName: user.fullName || existingUser?.fullName || `User ${user.userId.slice(-4)}`,
      avatar: user.avatar ?? existingUser?.avatar,
      status: "online",
      activity: existingUser?.activity ?? "idle",
      sessionCount,
      lastSeenAt: now,
    };
    usersMap.set(user.userId, presenceUser);

    return {
      session,
      isFirstSocketForUser,
      presenceUser,
      snapshot: this.getBoardSnapshot(boardId),
    };
  }

  /**
   * Unregisters a socket session by socketId.
   */
  unregisterSession(socketId: string): UnregisterSessionResult {
    const session = this.sessions.get(socketId);
    if (!session) {
      return {
        isLastSocketForUser: false,
        remainingSessions: 0,
      };
    }

    const { boardId, userId, sessionId } = session;

    // 1. Remove from sessions map
    this.sessions.delete(socketId);

    // 2. Remove from userSockets map
    const userSocketSet = this.userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socketId);
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    const remainingSessions = userSocketSet ? userSocketSet.size : 0;
    const isLastSocketForUser = remainingSessions === 0;

    // 3. Remove from boardSockets map
    const boardSocketSet = this.boardSockets.get(boardId);
    if (boardSocketSet) {
      boardSocketSet.delete(socketId);
      if (boardSocketSet.size === 0) {
        this.boardSockets.delete(boardId);
      }
    }

    // 4. Update board users
    const usersMap = this.boardUsers.get(boardId);
    if (usersMap) {
      if (isLastSocketForUser) {
        usersMap.delete(userId);
        if (usersMap.size === 0) {
          this.boardUsers.delete(boardId);
        }

        // Also clean cursor if user completely left
        const cursorMap = this.boardCursors.get(boardId);
        if (cursorMap) {
          cursorMap.delete(userId);
          if (cursorMap.size === 0) {
            this.boardCursors.delete(boardId);
          }
        }
      } else {
        const user = usersMap.get(userId);
        if (user) {
          user.sessionCount = remainingSessions;
          user.lastSeenAt = new Date().toISOString();
        }
      }
    }

    return {
      boardId,
      userId,
      sessionId,
      isLastSocketForUser,
      remainingSessions,
      removedUserId: isLastSocketForUser ? userId : undefined,
    };
  }

  /**
   * Retrieves active users and cursor positions for a board.
   */
  getBoardPresence(boardId: string): {
    users: PresenceUser[];
    cursors: PresenceCursor[];
  } {
    const usersMap = this.boardUsers.get(boardId);
    const cursorsMap = this.boardCursors.get(boardId);

    const users = usersMap ? Array.from(usersMap.values()) : [];
    const cursors = cursorsMap ? Array.from(cursorsMap.values()) : [];

    return { users, cursors };
  }

  /**
   * Returns a complete PresenceSnapshotPayload for a board.
   */
  getBoardSnapshot(boardId: string): PresenceSnapshotPayload {
    const { users, cursors } = this.getBoardPresence(boardId);
    return {
      boardId,
      users,
      cursors,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Retrieves all active sessions for a user.
   */
  getUserSessions(userId: string): PresenceSession[] {
    const socketSet = this.userSockets.get(userId);
    if (!socketSet) return [];

    const result: PresenceSession[] = [];
    for (const socketId of socketSet) {
      const session = this.sessions.get(socketId);
      if (session) {
        result.push(session);
      }
    }
    return result;
  }

  /**
   * Updates a user's cursor position on a board.
   */
  updateCursor(
    boardId: string,
    userId: string,
    x: number,
    y: number
  ): PresenceCursor {
    let cursorsMap = this.boardCursors.get(boardId);
    if (!cursorsMap) {
      cursorsMap = new Map<string, PresenceCursor>();
      this.boardCursors.set(boardId, cursorsMap);
    }

    const now = new Date().toISOString();
    const cursor: PresenceCursor = {
      userId,
      x,
      y,
      updatedAt: now,
    };
    cursorsMap.set(userId, cursor);

    // Also touch user's lastSeenAt
    const usersMap = this.boardUsers.get(boardId);
    const user = usersMap?.get(userId);
    if (user) {
      user.lastSeenAt = now;
      if (user.activity === "idle") {
        user.activity = "cursor";
      }
    }

    return cursor;
  }

  /**
   * Updates a user's active interaction state on a board.
   */
  updateActivity(
    boardId: string,
    userId: string,
    activity: PresenceActivity
  ): PresenceUser | null {
    const usersMap = this.boardUsers.get(boardId);
    if (!usersMap) return null;

    const user = usersMap.get(userId);
    if (!user) return null;

    user.activity = activity;
    user.lastSeenAt = new Date().toISOString();
    return user;
  }

  /**
   * Touches a session timestamp on heartbeat.
   */
  touchSession(socketId: string): boolean {
    const session = this.sessions.get(socketId);
    if (!session) return false;

    const now = new Date().toISOString();
    session.lastHeartbeatAt = now;

    const usersMap = this.boardUsers.get(session.boardId);
    const user = usersMap?.get(session.userId);
    if (user) {
      user.lastSeenAt = now;
      user.status = "online";
    }

    return true;
  }

  /**
   * Finds and unregisters sessions that have not sent a heartbeat within timeoutMs.
   */
  removeExpiredSessions(timeoutMs: number = 45000): ExpiredSessionInfo[] {
    const now = Date.now();
    const expired: ExpiredSessionInfo[] = [];

    for (const [socketId, session] of this.sessions.entries()) {
      const lastHeartbeat = new Date(session.lastHeartbeatAt).getTime();
      if (now - lastHeartbeat > timeoutMs) {
        const unregisterResult = this.unregisterSession(socketId);
        expired.push({
          boardId: session.boardId,
          userId: session.userId,
          socketId,
          sessionId: session.sessionId,
          isLastSocketForUser: unregisterResult.isLastSocketForUser,
        });
      }
    }

    return expired;
  }

  /**
   * Looks up the boardId associated with a socket session.
   */
  getBoardId(socketId: string): string | undefined {
    const session = this.sessions.get(socketId);
    if (session) return session.boardId;
    return this.getLegacyBoardId(socketId);
  }

  /**
   * Looks up session by socketId.
   */
  getSession(socketId: string): PresenceSession | undefined {
    return this.sessions.get(socketId);
  }

  // -------------------------------------------------------------
  // Backward-compatibility methods for Slices 2, 4, 10 integration
  // -------------------------------------------------------------

  /**
   * Legacy joinBoard implementation.
   */
  joinBoard(
    boardId: string,
    socketId: string,
    user: SocketUser
  ): JoinBoardResult {
    let board = this.legacyBoards.get(boardId);
    if (!board) {
      board = new Map<string, SocketUser>();
      this.legacyBoards.set(boardId, board);
    }

    const userIdStr = user.userId.toString();
    const isFirstSocketForUser = !this.isUserPresentInLegacyBoard(board, userIdStr);

    board.set(socketId, user);

    // Also register in rich presence manager
    this.registerSession(boardId, socketId, {
      userId: userIdStr,
      fullName: `User ${userIdStr.slice(-4)}`,
    });

    return {
      isFirstSocketForUser,
      activeUsers: this.getActiveUsers(boardId),
    };
  }

  /**
   * Legacy leaveBoard implementation.
   */
  leaveBoard(
    boardId: string,
    socketId: string
  ): LeaveBoardResult {
    // 1. Clean legacy boards map if present
    const board = this.legacyBoards.get(boardId);
    let legacyUserId: string | undefined;
    if (board) {
      const user = board.get(socketId);
      if (user) {
        legacyUserId = user.userId.toString();
        board.delete(socketId);
        if (board.size === 0) {
          this.legacyBoards.delete(boardId);
        }
      }
    }

    // 2. Unregister rich presence session
    const unregResult = this.unregisterSession(socketId);
    const isLastSocketForUser = unregResult.isLastSocketForUser;
    const removedUserId = unregResult.removedUserId ?? (isLastSocketForUser ? legacyUserId : undefined);

    return {
      isLastSocketForUser,
      removedUserId,
      activeUsers: this.getActiveUsers(boardId),
    };
  }

  /**
   * Legacy removeSocket implementation.
   */
  removeSocket(socketId: string): RemoveSocketResult {
    const session = this.sessions.get(socketId);
    let targetBoardId: string | undefined = session?.boardId;

    if (!targetBoardId) {
      for (const [boardId, board] of this.legacyBoards.entries()) {
        if (board.has(socketId)) {
          targetBoardId = boardId;
          break;
        }
      }
    }

    if (!targetBoardId) {
      return {
        isLastSocketForUser: false,
        activeUsers: [],
      };
    }

    const leaveResult = this.leaveBoard(targetBoardId, socketId);

    return {
      boardId: targetBoardId,
      ...leaveResult,
    };
  }

  /**
   * Legacy getActiveUsers implementation.
   */
  getActiveUsers(boardId: string): ActiveUser[] {
    const richUsers = this.boardUsers.get(boardId);
    if (richUsers && richUsers.size > 0) {
      return Array.from(richUsers.values()).map((u) => ({
        userId: u.userId,
        role: "MEMBER",
      }));
    }

    const board = this.legacyBoards.get(boardId);
    if (!board) return [];

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

  private getLegacyBoardId(socketId: string): string | undefined {
    for (const [boardId, board] of this.legacyBoards.entries()) {
      if (board.has(socketId)) return boardId;
    }
    return undefined;
  }

  private isUserPresentInLegacyBoard(
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

  /**
   * Clears internal state across all boards (for unit/integration testing).
   */
  clear(): void {
    this.sessions.clear();
    this.boardSockets.clear();
    this.userSockets.clear();
    this.boardUsers.clear();
    this.boardCursors.clear();
    this.legacyBoards.clear();
  }
}

export const presenceManager = new PresenceManager();