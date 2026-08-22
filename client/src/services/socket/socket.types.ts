import type { Socket } from "socket.io-client";

/**
 * Safe representation of an active user exposed via presence.
 */
export type ActiveUser = {
  userId: string;
  role: string;
};

/**
 * Structured socket acknowledgement error details.
 */
export type SocketAckError = {
  code?: string;
  message: string;
};

/**
 * Generic socket acknowledgement callback payload.
 */
export type SocketAck<T = void> = {
  success: boolean;
  data?: T;
  error?: SocketAckError | string;
};

/**
 * Base Shape response DTO
 */
export type BaseShapeResponseDto = {
  id: string;
  canvasId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type RectangleShapeResponseDto = BaseShapeResponseDto & {
  type: "rectangle";
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
  };
};

export type TextShapeResponseDto = BaseShapeResponseDto & {
  type: "text";
  style: {
    text: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: string | number;
    fontStyle: string;
    textAlign: "left" | "center" | "right";
    fill: string;
    opacity: number;
  };
};

export type StickyNoteShapeResponseDto = BaseShapeResponseDto & {
  type: "sticky_note";
  style: {
    text: string;
    fontSize: number;
    backgroundColor: string;
    textColor: string;
    opacity: number;
  };
};

/**
 * Shape response data transfer object matching API & socket broadcasts.
 */
export type ShapeResponseDto =
  | RectangleShapeResponseDto
  | TextShapeResponseDto
  | StickyNoteShapeResponseDto;

/**
 * Board Room Lifecycle Payloads
 */
export type JoinBoardPayload = {
  boardId: string;
  canvasId?: string;
};

export type LeaveBoardPayload = {
  boardId: string;
};

export type BoardJoinAckData = {
  boardId: string;
  canvasId: string;
  activeUsers: ActiveUser[];
};

/**
 * Shape Event Payloads (Foundation Contracts)
 */
export type ShapeStylePayload = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  textAlign?: "left" | "center" | "right";
  backgroundColor?: string;
  textColor?: string;
};

export type CreateShapePayload = {
  canvasId: string;
  type: "rectangle" | "text" | "sticky_note";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  style?: ShapeStylePayload;
};

export type UpdateShapePayload = {
  shapeId: string;
  data: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    style?: ShapeStylePayload;
  };
};

export type DeleteShapePayload = {
  shapeId: string;
};

/**
 * Canvas Synchronization & Presence Payloads
 */
export type CanvasSyncPayload = {
  boardId: string;
  canvasId: string;
  shapes: ShapeResponseDto[];
};

export type CursorPosition = {
  x: number;
  y: number;
};

export type CursorMovePayload = {
  boardId: string;
  x: number;
  y: number;
};

export type CursorMovedPayload = {
  userId: string;
  boardId: string;
  x: number;
  y: number;
};

export type RemoteCursor = {
  userId: string;
  boardId: string;
  x: number;
  y: number;
};

export type SelectionChangePayload = {
  boardId: string;
  shapeIds: string[];
};

export type SelectionChangedPayload = {
  userId: string;
  boardId: string;
  shapeIds: string[];
};

export type RemoteSelection = {
  userId: string;
  boardId: string;
  shapeIds: string[];
};

export type LockShapePayload = {
  boardId: string;
  shapeId: string;
};

export type UnlockShapePayload = {
  boardId: string;
  shapeId: string;
};

export type RefreshShapeLockPayload = {
  boardId: string;
  shapeId: string;
};

export type ShapeLockedPayload = {
  boardId: string;
  shapeId: string;
  userId: string;
  fullName: string;
  color: string;
};

export type ShapeUnlockedPayload = {
  boardId: string;
  shapeId: string;
};

export type RemoteShapeLock = {
  shapeId: string;
  boardId: string;
  userId: string;
  fullName: string;
  color: string;
};

export type UserJoinedPayload = {
  userId: string;
  activeUsers: ActiveUser[];
};

export type UserLeftPayload = {
  userId: string;
  activeUsers: ActiveUser[];
};

/**
 * Strongly typed Client-to-Server Event Contracts.
 */
export interface ClientToServerEvents {
  "board:join": (
    payload: JoinBoardPayload,
    callback?: (response: SocketAck<BoardJoinAckData>) => void
  ) => void;

  "board:leave": (
    payload: LeaveBoardPayload,
    callback?: (response: SocketAck) => void
  ) => void;

  "shape:create": (
    payload: CreateShapePayload,
    callback?: (response: SocketAck<ShapeResponseDto>) => void
  ) => void;

  "shape:update": (
    payload: UpdateShapePayload,
    callback?: (response: SocketAck<ShapeResponseDto>) => void
  ) => void;

  "shape:delete": (
    payload: DeleteShapePayload,
    callback?: (response: SocketAck) => void
  ) => void;

  "cursor:move": (payload: CursorMovePayload) => void;

  "selection:change": (payload: SelectionChangePayload) => void;

  "shape:lock": (
    payload: LockShapePayload,
    callback?: (response: SocketAck<ShapeLockedPayload>) => void
  ) => void;

  "shape:unlock": (
    payload: UnlockShapePayload,
    callback?: (response: SocketAck) => void
  ) => void;

  "shape:lock-refresh": (
    payload: RefreshShapeLockPayload,
    callback?: (response: SocketAck) => void
  ) => void;
}

/**
 * Strongly typed Server-to-Client Event Contracts.
 */
export interface ServerToClientEvents {
  "canvas:sync": (payload: CanvasSyncPayload) => void;
  "shape:created": (shape: ShapeResponseDto) => void;
  "shape:updated": (shape: ShapeResponseDto) => void;
  "shape:deleted": (payload: DeleteShapePayload) => void;
  "cursor:moved": (payload: CursorMovedPayload) => void;
  "selection:changed": (payload: SelectionChangedPayload) => void;
  "shape:locked": (payload: ShapeLockedPayload) => void;
  "shape:unlocked": (payload: ShapeUnlockedPayload) => void;
  "user:joined": (payload: UserJoinedPayload) => void;
  "user:left": (payload: UserLeftPayload) => void;
  error: (message: string) => void;
}

/**
 * Fully typed frontend Socket instance.
 */
export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * High-level connection state representation.
 */
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";
