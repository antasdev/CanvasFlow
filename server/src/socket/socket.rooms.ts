/**
 * Board room
 */
export const getBoardRoom = (
  boardId: string
): string => {
  return `board:${boardId}`;
};

/**
 * Canvas room
 */
export const getCanvasRoom = (
  canvasId: string
): string => {
  return `canvas:${canvasId}`;
};