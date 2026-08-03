export const SocketEvents = {
  CONNECTION: "connection",
  DISCONNECT: "disconnect",

  BOARD_JOIN: "board:join",
  BOARD_LEAVE: "board:leave",

  CANVAS_JOIN: "canvas:join",
  CANVAS_LEAVE: "canvas:leave",
  
  CANVAS_SYNC: "canvas:sync",

  SHAPE_CREATE: "shape:create",
  SHAPE_CREATED: "shape:created",

  SHAPE_UPDATE: "shape:update",
  SHAPE_UPDATED: "shape:updated",

  SHAPE_DELETE: "shape:delete",
  SHAPE_DELETED: "shape:deleted",

  /**
   * Presence
   */
  CURSOR_MOVE: "cursor:move",
  CURSOR_MOVED: "cursor:moved",

  SELECTION_UPDATE: "selection:update",
  VIEWPORT_UPDATE: "viewport:update",

  USER_JOINED: "user:joined",
  USER_LEFT: "user:left",

  USER_ONLINE: "user:online",
  USER_OFFLINE: "user:offline",

  ERROR: "error",
} as const;