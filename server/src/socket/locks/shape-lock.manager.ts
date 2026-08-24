export type ShapeLock = {
  boardId: string;
  shapeId: string;
  socketId: string;
  userId: string;
  fullName: string;
  color: string;
  acquiredAt: number;
  lastActivityAt: number;
};

export type AcquireLockResult =
  | { success: true; lock: ShapeLock }
  | { success: false; existingLock: ShapeLock };

export const LOCK_TIMEOUT_MS = 10_000;

export const COLLABORATOR_PALETTE = [
  "#EF4444", // Red
  "#F59E0B", // Amber
  "#10B981", // Emerald
  "#3B82F6", // Blue
  "#6366F1", // Indigo
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#14B8A6", // Teal
  "#F97316", // Orange
  "#06B6D4", // Cyan
] as const;

export function getCollaboratorColor(userId: string): string {
  if (!userId) {
    return COLLABORATOR_PALETTE[0];
  }

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }

  const index = Math.abs(hash) % COLLABORATOR_PALETTE.length;
  return COLLABORATOR_PALETTE[index];
}

/**
 * In-memory manager tracking active shape soft-locks per board.
 * Guarantees atomic single-owner acquisition, multi-tab isolation (socketId ownership),
 * safety timeouts for abandoned locks, and bulk release on socket disconnect.
 */
export class ShapeLockManager {
  /**
   * boardId -> shapeId -> ShapeLock
   */
  private readonly boards = new Map<string, Map<string, ShapeLock>>();

  /**
   * socketId -> Set of `${boardId}:${shapeId}`
   */
  private readonly socketLocks = new Map<string, Set<string>>();

  /**
   * Attempts to acquire an exclusive ephemeral soft-lock on a shape.
   *
   * @param boardId - Target board identifier
   * @param shapeId - Target shape identifier
   * @param socketId - Unique socket identifier of the acquiring connection
   * @param userId - Unique user identifier
   * @param fullName - Display name for peer collaborator badges
   * @param color - Deterministic collaborator color
   * @returns AcquireLockResult indicating success with lock or conflict with existing lock
   */
  acquireLock(
    boardId: string,
    shapeId: string,
    socketId: string,
    userId: string,
    fullName: string,
    color?: string
  ): AcquireLockResult {
    let boardLocks = this.boards.get(boardId);

    if (!boardLocks) {
      boardLocks = new Map<string, ShapeLock>();
      this.boards.set(boardId, boardLocks);
    }

    const now = Date.now();
    const existingLock = boardLocks.get(shapeId);

    if (existingLock) {
      // Check if existing lock has expired
      if (now - existingLock.lastActivityAt > LOCK_TIMEOUT_MS) {
        // Expire and clear old lock
        this.removeSocketLockEntry(existingLock.socketId, boardId, shapeId);
        boardLocks.delete(shapeId);
      } else if (existingLock.socketId === socketId) {
        // Same socket re-acquiring / refreshing its own lock
        existingLock.lastActivityAt = now;
        return { success: true, lock: existingLock };
      } else {
        // Another socket/user currently owns the active lock
        return { success: false, existingLock };
      }
    }

    const assignedColor = color || getCollaboratorColor(userId);

    const lock: ShapeLock = {
      boardId,
      shapeId,
      socketId,
      userId,
      fullName,
      color: assignedColor,
      acquiredAt: now,
      lastActivityAt: now,
    };

    boardLocks.set(shapeId, lock);

    let userSocketLocks = this.socketLocks.get(socketId);
    if (!userSocketLocks) {
      userSocketLocks = new Set<string>();
      this.socketLocks.set(socketId, userSocketLocks);
    }
    userSocketLocks.add(`${boardId}:${shapeId}`);

    return { success: true, lock };
  }

  /**
   * Releases a shape lock if owned by the requesting socket.
   *
   * @param boardId - Target board identifier
   * @param shapeId - Target shape identifier
   * @param socketId - Socket identifier attempting release
   * @returns Released ShapeLock if successful, or null if not found/not owned
   */
  releaseLock(
    boardId: string,
    shapeId: string,
    socketId: string
  ): ShapeLock | null {
    const boardLocks = this.boards.get(boardId);
    if (!boardLocks) {
      return null;
    }

    const lock = boardLocks.get(shapeId);
    if (!lock || lock.socketId !== socketId) {
      return null;
    }

    boardLocks.delete(shapeId);
    if (boardLocks.size === 0) {
      this.boards.delete(boardId);
    }

    this.removeSocketLockEntry(socketId, boardId, shapeId);

    return lock;
  }

  /**
   * Releases all shape locks held by a disconnected or departing socket.
   *
   * @param socketId - Disconnected socket identifier
   * @returns Array of released ShapeLock records to broadcast unlock events
   */
  releaseSocketLocks(socketId: string): ShapeLock[] {
    const lockKeys = this.socketLocks.get(socketId);
    if (!lockKeys || lockKeys.size === 0) {
      this.socketLocks.delete(socketId);
      return [];
    }

    const releasedLocks: ShapeLock[] = [];

    for (const lockKey of lockKeys) {
      const [boardId, shapeId] = lockKey.split(":");
      const boardLocks = this.boards.get(boardId);
      if (boardLocks) {
        const lock = boardLocks.get(shapeId);
        if (lock && lock.socketId === socketId) {
          boardLocks.delete(shapeId);
          releasedLocks.push(lock);
          if (boardLocks.size === 0) {
            this.boards.delete(boardId);
          }
        }
      }
    }

    this.socketLocks.delete(socketId);
    return releasedLocks;
  }

  /**
   * Refreshes the activity timestamp on an active lock to prevent timeout during long transforms.
   *
   * @param boardId - Target board identifier
   * @param shapeId - Target shape identifier
   * @param socketId - Socket identifier attempting refresh
   * @returns True if refreshed, false if lock missing or not owned
   */
  refreshLock(boardId: string, shapeId: string, socketId: string): boolean {
    const boardLocks = this.boards.get(boardId);
    if (!boardLocks) {
      return false;
    }

    const lock = boardLocks.get(shapeId);
    if (!lock || lock.socketId !== socketId) {
      return false;
    }

    lock.lastActivityAt = Date.now();
    return true;
  }

  /**
   * Retrieves an active, unexpired lock for a shape.
   *
   * @param boardId - Target board identifier
   * @param shapeId - Target shape identifier
   * @returns ShapeLock or null if not locked/expired
   */
  getLock(boardId: string, shapeId: string): ShapeLock | null {
    const boardLocks = this.boards.get(boardId);
    if (!boardLocks) {
      return null;
    }

    const lock = boardLocks.get(shapeId);
    if (!lock) {
      return null;
    }

    if (Date.now() - lock.lastActivityAt > LOCK_TIMEOUT_MS) {
      this.releaseLock(boardId, shapeId, lock.socketId);
      return null;
    }

    return lock;
  }

  /**
   * Retrieves all active, unexpired locks for a board.
   *
   * @param boardId - Target board identifier
   * @returns Array of active ShapeLock records
   */
  getBoardLocks(boardId: string): ShapeLock[] {
    const boardLocks = this.boards.get(boardId);
    if (!boardLocks) {
      return [];
    }

    const activeLocks: ShapeLock[] = [];
    const now = Date.now();

    for (const [shapeId, lock] of boardLocks.entries()) {
      if (now - lock.lastActivityAt > LOCK_TIMEOUT_MS) {
        this.removeSocketLockEntry(lock.socketId, boardId, shapeId);
        boardLocks.delete(shapeId);
      } else {
        activeLocks.push(lock);
      }
    }

    return activeLocks;
  }

  /**
   * Resets all internal state (for test isolation).
   */
  clear(): void {
    this.boards.clear();
    this.socketLocks.clear();
  }

  private removeSocketLockEntry(
    socketId: string,
    boardId: string,
    shapeId: string
  ): void {
    const userSocketLocks = this.socketLocks.get(socketId);
    if (userSocketLocks) {
      userSocketLocks.delete(`${boardId}:${shapeId}`);
      if (userSocketLocks.size === 0) {
        this.socketLocks.delete(socketId);
      }
    }
  }
}

export const shapeLockManager = new ShapeLockManager();
