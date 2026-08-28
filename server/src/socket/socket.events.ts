/**
 * Authoritative Socket.IO event name constants.
 * Kept consistent between backend and frontend.
 */
export const SocketEvents = {
  CONNECTION: "connection",
  DISCONNECT: "disconnect",

  BOARD_JOIN: "board:join",
  BOARD_LEAVE: "board:leave",
  BOARD_RECOVERY_REQUEST: "board:recovery-request",
  BOARD_RECOVERY_STATE: "board:recovery-state",

  CANVAS_SYNC: "canvas:sync",

  SHAPE_CREATE: "shape:create",
  SHAPE_CREATED: "shape:created",

  SHAPE_UPDATE: "shape:update",
  SHAPE_UPDATED: "shape:updated",

  SHAPE_DELETE: "shape:delete",
  SHAPE_DELETED: "shape:deleted",

  SHAPE_GROUP: "shape:group",
  SHAPE_GROUPED: "shape:grouped",

  SHAPE_UNGROUP: "shape:ungroup",
  SHAPE_UNGROUPED: "shape:ungrouped",

  SHAPE_ALIGN: "shape:align",
  SHAPE_ALIGNED: "shape:aligned",

  SHAPE_DISTRIBUTE: "shape:distribute",
  SHAPE_DISTRIBUTED: "shape:distributed",

  CURSOR_MOVE: "cursor:move",
  CURSOR_MOVED: "cursor:moved",

  SELECTION_CHANGE: "selection:change",
  SELECTION_CHANGED: "selection:changed",

  SHAPE_LOCK: "shape:lock",
  SHAPE_UNLOCK: "shape:unlock",
  SHAPE_LOCK_REFRESH: "shape:lock-refresh",
  SHAPE_LOCKED: "shape:locked",
  SHAPE_UNLOCKED: "shape:unlocked",

  SHAPE_TRANSFORMING: "shape:transforming",
  SHAPE_TRANSFORM_END: "shape:transform-end",

  COMMENT_CREATE: "comment:create",
  COMMENT_CREATED: "comment:created",

  COMMENT_UPDATE: "comment:update",
  COMMENT_UPDATED: "comment:updated",

  COMMENT_DELETE: "comment:delete",
  COMMENT_DELETED: "comment:deleted",

  COMMENT_RESOLVE: "comment:resolve",
  COMMENT_RESOLVED: "comment:resolved",

  USER_JOINED: "user:joined",
  USER_LEFT: "user:left",

  PRESENCE_SNAPSHOT: "presence:snapshot",
  PRESENCE_USER_JOINED: "presence:user-joined",
  PRESENCE_USER_LEFT: "presence:user-left",
  PRESENCE_CURSOR: "presence:cursor",
  PRESENCE_ACTIVITY: "presence:activity",
  PRESENCE_HEARTBEAT: "presence:heartbeat",

  INTERACTION_START: "interaction:start",
  INTERACTION_UPDATE: "interaction:update",
  INTERACTION_END: "interaction:end",
  INTERACTION_SNAPSHOT: "interaction:snapshot",

  WORKSPACE_MEMBER_ROLE_UPDATED: "workspace:member-role-updated",

  ERROR: "error",
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];