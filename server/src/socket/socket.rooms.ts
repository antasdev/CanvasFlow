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