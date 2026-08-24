/**
 * Constructs a deterministic board room identifier.
 * Format: board:<boardId>
 *
 * @param boardId - The unique board identifier string
 * @returns Deterministic room string for Socket.IO
 */
export const getBoardRoom = (boardId: string): string => {
  return `board:${boardId}`;
};

/**
 * Constructs a deterministic canvas room identifier.
 * Format: canvas:<canvasId>
 *
 * @param canvasId - The unique canvas identifier string
 * @returns Deterministic canvas room string for Socket.IO
 */
export const getCanvasRoom = (canvasId: string): string => {
  return `canvas:${canvasId}`;
};

/**
 * Constructs a deterministic user room identifier.
 * Format: user:<userId>
 *
 * @param userId - The unique user identifier string
 * @returns Deterministic user room string for Socket.IO
 */
export const getUserRoom = (userId: string): string => {
  return `user:${userId}`;
};

/**
 * Constructs a deterministic workspace room identifier.
 * Format: workspace:<workspaceId>
 *
 * @param workspaceId - The unique workspace identifier string
 * @returns Deterministic workspace room string for Socket.IO
 */
export const getWorkspaceRoom = (workspaceId: string): string => {
  return `workspace:${workspaceId}`;
};