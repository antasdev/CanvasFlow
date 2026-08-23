import { Types } from "mongoose";
import { Socket } from "socket.io";
import type { UserRole } from "@/modules/user/user.types";
import type { ShapeResponseDto } from "@/modules/shape/shape.dto";
import type { CommentResponseDto } from "@/modules/comment/comment.dto";

export type { ShapeResponseDto, CommentResponseDto };

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
 * Conflict Resource Types & Conflict Payload (Slice 12)
 */
export type ConflictResourceType = "shape" | "comment";

export type CollaborationConflictPayload = {
  code: "CONFLICT";
  resourceType: ConflictResourceType;
  resourceId: string;
  currentVersion: number;
  message?: string;
};

/**
 * Structured socket acknowledgement error details.
 */
export type SocketAckError = {
  code?: string;
  message: string;
  resourceType?: ConflictResourceType;
  resourceId?: string;
  currentVersion?: number;
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
  expectedVersion?: number;
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
  expectedVersion?: number;
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

export type SelectionChangePayload = {
  boardId: string;
  shapeIds: string[];
};

export type SelectionChangedPayload = {
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

export type TransformingShapePayload = {
  boardId: string;
  shapeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type TransformEndPayload = {
  boardId: string;
  shapeId: string;
};

export type ShapeTransformingPayload = {
  boardId: string;
  shapeId: string;
  userId: string;
  fullName: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type ShapeTransformEndPayload = {
  boardId: string;
  shapeId: string;
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
 * Comment Event Payloads (Slice 9)
 */
export type CreateCommentPayload = {
  boardId: string;
  content: string;
  shapeId?: string | null;
  parentCommentId?: string | null;
};

export type UpdateCommentPayload = {
  boardId: string;
  commentId: string;
  expectedVersion?: number;
  content: string;
};

export type ResolveCommentPayload = {
  boardId: string;
  commentId: string;
  expectedVersion?: number;
  isResolved: boolean;
};

export type DeleteCommentPayload = {
  boardId: string;
  commentId: string;
  expectedVersion?: number;
};

export type CommentDeletedPayload = {
  boardId: string;
  commentId: string;
  comment?: CommentResponseDto;
  meta?: CollaborationEventMeta;
};

/**
 * Collaboration Event Metadata & Envelopes (Slice 11)
 */
export type CollaborationEventMeta = {
  eventId: string;
  boardId: string;
  actorId: string;
  socketId: string;
  revision: number;
  occurredAt: string;
};

export type ShapeCreatedPayload = {
  meta: CollaborationEventMeta;
  shape: ShapeResponseDto;
};

export type ShapeUpdatedPayload = {
  meta: CollaborationEventMeta;
  shape: ShapeResponseDto;
};

export type ShapeDeletedPayload = {
  meta: CollaborationEventMeta;
  shapeId: string;
};

export type CommentCreatedPayload = {
  meta: CollaborationEventMeta;
  comment: CommentResponseDto;
};

export type CommentUpdatedPayload = {
  meta: CollaborationEventMeta;
  comment: CommentResponseDto;
};

export type CommentResolvedPayload = {
  meta: CollaborationEventMeta;
  comment: CommentResponseDto;
};

/**
 * Board Recovery Payloads (Slice 10 & Slice 11)
 */
export type BoardRecoveryRequestPayload = {
  boardId: string;
};

export type BoardRecoveryStatePayload = {
  boardId: string;
  revision: number;
  recoveredAt: string;
  presence: {
    activeUsers: ActiveUser[];
  };
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

  "board:recovery-request": (
    payload: BoardRecoveryRequestPayload,
    callback?: (response: SocketAck<BoardRecoveryStatePayload>) => void
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

  "shape:transforming": (payload: TransformingShapePayload) => void;

  "shape:transform-end": (payload: TransformEndPayload) => void;

  "comment:create": (
    payload: CreateCommentPayload,
    callback?: (response: SocketAck<CommentResponseDto>) => void
  ) => void;

  "comment:update": (
    payload: UpdateCommentPayload,
    callback?: (response: SocketAck<CommentResponseDto>) => void
  ) => void;

  "comment:resolve": (
    payload: ResolveCommentPayload,
    callback?: (response: SocketAck<CommentResponseDto>) => void
  ) => void;

  "comment:delete": (
    payload: DeleteCommentPayload,
    callback?: (response: SocketAck<CommentResponseDto>) => void
  ) => void;
}

/**
 * Strongly typed Server-to-Client Event Contracts.
 */
export interface ServerToClientEvents {
  "canvas:sync": (payload: CanvasSyncPayload) => void;
  "board:recovery-state": (payload: BoardRecoveryStatePayload) => void;
  "shape:created": (payload: ShapeCreatedPayload | ShapeResponseDto) => void;
  "shape:updated": (payload: ShapeUpdatedPayload | ShapeResponseDto) => void;
  "shape:deleted": (payload: ShapeDeletedPayload | DeleteShapePayload) => void;
  "cursor:moved": (payload: CursorMovedPayload) => void;
  "selection:changed": (payload: SelectionChangedPayload) => void;
  "shape:locked": (payload: ShapeLockedPayload) => void;
  "shape:unlocked": (payload: ShapeUnlockedPayload) => void;
  "shape:transforming": (payload: ShapeTransformingPayload) => void;
  "shape:transform-end": (payload: ShapeTransformEndPayload) => void;
  "comment:created": (payload: CommentCreatedPayload | CommentResponseDto) => void;
  "comment:updated": (payload: CommentUpdatedPayload | CommentResponseDto) => void;
  "comment:resolved": (payload: CommentResolvedPayload | CommentResponseDto) => void;
  "comment:deleted": (payload: CommentDeletedPayload | { boardId: string; commentId: string }) => void;
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