import { Types } from "mongoose";
import { Socket } from "socket.io";
import type { UserRole } from "@/modules/user/user.types";
import type { ShapeResponseDto } from "@/modules/shape/shape.dto";

export type { ShapeResponseDto };

/**
 * Authenticated user data attached to Socket.IO instances.
 */
export type SocketUser = {
  userId: Types.ObjectId;
  role: UserRole;
};

/**
 * Custom data payload persisted on each Socket instance.
 */
export type SocketData = {
  user: SocketUser;
};

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
 * Standard socket acknowledgement response payload.
 */
export type SocketAck<T = void> = {
  success: boolean;
  data?: T;
  error?: SocketAckError | string;
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
  activeUsers: ActiveUser[];
};

/**
 * Shape Event Payloads (Foundation Contracts)
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
  position: CursorPosition;
};

export type CursorMovedPayload = {
  boardId: string;
  position: CursorPosition;
  userId: string;
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
 * Inter-server event contracts for multi-instance communication.
 */
export interface InterServerEvents {}

/**
 * Authenticated Socket type alias with full generic event signatures.
 */
export type AuthSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;