import type { Socket } from "socket.io-client";

/**
 * Generic socket acknowledgement callback payload.
 */
export type SocketAck<T = void> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Shape response data transfer object matching API & socket broadcasts.
 */
export type ShapeResponseDto = {
  id: string;
  canvasId: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

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
};

/**
 * Shape Event Payloads
 */
export type CreateShapePayload = {
  canvasId: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
  };
};

export type UpdateShapePayload = {
  shapeId: string;
  data: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    style?: {
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
    };
  };
};

export type DeleteShapePayload = {
  shapeId: string;
};

/**
 * Canvas Synchronization & Presence Payloads
 */
export type CanvasSyncPayload = {
  canvasId: string;
  shapes: ShapeResponseDto[];
};

export type CursorPosition = {
  x: number;
  y: number;
};

export type CursorMovePayload = {
  boardId: string;
  position: CursorPosition;
};

export type CursorMovedPayload = {
  boardId: string;
  position: CursorPosition;
  userId: string;
};

export type UserJoinedPayload = {
  userId: string;
};

export type UserLeftPayload = {
  userId: string;
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
