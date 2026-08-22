/**
 * Authoritative Socket.IO event constants on frontend.
 * Kept strictly synchronized with backend SocketEvents.
 */
export const SocketEvents = {
  CONNECT: "connect",
  DISCONNECT: "disconnect",
  CONNECT_ERROR: "connect_error",

  BOARD_JOIN: "board:join",
  BOARD_LEAVE: "board:leave",

  CANVAS_SYNC: "canvas:sync",

  SHAPE_CREATE: "shape:create",
  SHAPE_CREATED: "shape:created",

  SHAPE_UPDATE: "shape:update",
  SHAPE_UPDATED: "shape:updated",

  SHAPE_DELETE: "shape:delete",
  SHAPE_DELETED: "shape:deleted",

  CURSOR_MOVE: "cursor:move",
  CURSOR_MOVED: "cursor:moved",

  SELECTION_CHANGE: "selection:change",
  SELECTION_CHANGED: "selection:changed",

  SHAPE_LOCK: "shape:lock",
  SHAPE_UNLOCK: "shape:unlock",
  SHAPE_LOCK_REFRESH: "shape:lock-refresh",
  SHAPE_LOCKED: "shape:locked",
  SHAPE_UNLOCKED: "shape:unlocked",

  USER_JOINED: "user:joined",
  USER_LEFT: "user:left",

  ERROR: "error",
} as const;

export type SocketEventType = (typeof SocketEvents)[keyof typeof SocketEvents];
