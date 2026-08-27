import type { Socket } from "socket.io-client";

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

export type SocketAckErrorCode =
  | "CONFLICT"
  | "BAD_REQUEST"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INTERNAL_ERROR"
  | "IDEMPOTENCY_KEY_REUSED"
  | "MUTATION_IN_PROGRESS"
  | "INTERACTION_CONFLICT";

/**
 * Structured socket acknowledgement error details.
 */
export type SocketAckError = {
  code?: SocketAckErrorCode | string;
  message: string;
  resourceType?: ConflictResourceType | InteractionTargetType;
  resourceId?: string;
  currentVersion?: number;
  ownerUserId?: string;
  interactionType?: InteractionType;
};

/**
 * Generic socket acknowledgement callback payload.
 */
export type SocketAck<T = void> = {
  success: boolean;
  data?: T;
  mutationId?: string;
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
  version: number;
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
  text?: string;
  style: {
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string | number;
    fontStyle?: "normal" | "italic";
    textDecoration?: "none" | "underline";
    textAlign?: "left" | "center" | "right";
    verticalAlign?: "top" | "middle" | "bottom";
    fill?: string;
    opacity?: number;
    padding?: number;
    lineHeight?: number;
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

export type FreehandShapeResponseDto = BaseShapeResponseDto & {
  type: "freehand";
  points: number[];
  style: {
    stroke: string;
    strokeWidth: number;
    opacity: number;
    points?: number[];
  };
};

/**
 * Shape response data transfer object matching API & socket broadcasts.
 */
export type ShapeResponseDto =
  | RectangleShapeResponseDto
  | TextShapeResponseDto
  | StickyNoteShapeResponseDto
  | FreehandShapeResponseDto;

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
  strokeStyle?: "solid" | "dashed";
  arrowHeadEnd?: boolean;
  arrowHeadStart?: boolean;
  pointerLength?: number;
  pointerWidth?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  padding?: number;
  lineHeight?: number;
  backgroundColor?: string;
  textColor?: string;
  points?: number[];
};

export type ShapeConnectorPayload = {
  sourceShapeId?: string | null;
  sourceAnchor?: "top" | "right" | "bottom" | "left" | "center" | null;
  targetShapeId?: string | null;
  targetAnchor?: "top" | "right" | "bottom" | "left" | "center" | null;
  routing?: "straight" | "orthogonal" | "curved";
};

export type CreateShapePayload = {
  canvasId: string;
  mutationId?: string;
  type: "rectangle" | "text" | "sticky_note" | "freehand" | "line" | "arrow" | "connector";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  text?: string;
  points?: number[];
  connector?: ShapeConnectorPayload;
  style?: ShapeStylePayload;
};

export type UpdateShapePayload = {
  shapeId: string;
  mutationId?: string;
  expectedVersion?: number;
  data: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    text?: string;
    points?: number[];
    connector?: ShapeConnectorPayload;
    style?: ShapeStylePayload;
  };
};

export type DeleteShapePayload = {
  shapeId: string;
  mutationId?: string;
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

export type RemoteCursor = {
  userId: string;
  boardId: string;
  x: number;
  y: number;
};

/**
 * Presence Status enum/type
 */
export type PresenceStatus = "online" | "away" | "offline";

/**
 * Presence Activity enum/type representing the user's active interaction on canvas
 */
export type PresenceActivity =
  | "idle"
  | "cursor"
  | "selecting"
  | "moving"
  | "resizing"
  | "editing-text"
  | "commenting"
  | "drawing";

export const PRESENCE_ACTIVITIES: readonly PresenceActivity[] = [
  "idle",
  "cursor",
  "selecting",
  "moving",
  "resizing",
  "editing-text",
  "commenting",
  "drawing",
] as const;

/**
 * Rich presence representation of an active collaborator in a board
 */
export type PresenceUser = {
  userId: string;
  fullName: string;
  avatar?: string;
  status: PresenceStatus;
  activity: PresenceActivity;
  sessionCount: number;
  lastSeenAt: string;
};

/**
 * Ephemeral cursor position of an active collaborator
 */
export type PresenceCursor = {
  userId: string;
  x: number;
  y: number;
  updatedAt: string;
};

/**
 * Individual socket session model tracked in-memory by PresenceManager
 */
export type PresenceSession = {
  sessionId: string;
  socketId: string;
  userId: string;
  boardId: string;
  connectedAt: string;
  lastHeartbeatAt: string;
};

/**
 * Payload sent to client upon joining or requesting board presence snapshot
 */
export type PresenceSnapshotPayload = {
  boardId: string;
  users: PresenceUser[];
  cursors: PresenceCursor[];
  timestamp: string;
};

/**
 * Broadcast payload emitted when a new user joins or opens an additional session
 */
export type PresenceUserJoinedPayload = {
  boardId: string;
  user: PresenceUser;
  sessionId: string;
};

/**
 * Broadcast payload emitted when a user disconnects their final session
 */
export type PresenceUserLeftPayload = {
  boardId: string;
  userId: string;
  remainingSessions: number;
};

/**
 * Client emit payload for live cursor movement
 */
export type PresenceCursorPayload = {
  boardId: string;
  x: number;
  y: number;
};

/**
 * Broadcast payload emitted to room collaborators for cursor movement
 */
export type PresenceCursorBroadcastPayload = {
  boardId: string;
  userId: string;
  x: number;
  y: number;
  updatedAt: string;
};

/**
 * Client emit payload for user activity changes
 */
export type PresenceActivityPayload = {
  boardId: string;
  activity: PresenceActivity;
};

/**
 * Broadcast payload emitted to room collaborators for activity changes
 */
export type PresenceActivityBroadcastPayload = {
  boardId: string;
  userId: string;
  activity: PresenceActivity;
  updatedAt: string;
};

/**
 * Client emit payload for presence heartbeats
 */
export type PresenceHeartbeatPayload = {
  boardId: string;
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

export type RemoteShapeTransform = {
  shapeId: string;
  boardId: string;
  userId: string;
  fullName: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  lastUpdatedAt: number;
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
 * Comment Types & Payloads (Slice 9)
 */
export type CommentAuthorDto = {
  id: string;
  fullName: string;
  email?: string;
  avatar?: string;
};

export type CommentResponseDto = {
  id: string;
  boardId: string;
  shapeId: string | null;
  authorId: string;
  author?: CommentAuthorDto;
  parentCommentId: string | null;
  content: string;
  isResolved: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateCommentPayload = {
  boardId: string;
  mutationId?: string;
  content: string;
  shapeId?: string | null;
  parentCommentId?: string | null;
};

export type UpdateCommentPayload = {
  boardId: string;
  commentId: string;
  mutationId?: string;
  expectedVersion?: number;
  content: string;
};

export type ResolveCommentPayload = {
  boardId: string;
  commentId: string;
  mutationId?: string;
  expectedVersion?: number;
  isResolved: boolean;
};

export type DeleteCommentPayload = {
  boardId: string;
  commentId: string;
  mutationId?: string;
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
  mutationId?: string;
  boardId: string;
  actorId: string;
  socketId: string;
  revision: number;
  occurredAt: string;
  isIdempotentReplay?: boolean;
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

  "presence:heartbeat": (
    payload: PresenceHeartbeatPayload,
    callback?: (response: SocketAck) => void
  ) => void;

  "presence:cursor": (payload: PresenceCursorPayload) => void;

  "presence:activity": (
    payload: PresenceActivityPayload,
    callback?: (response: SocketAck) => void
  ) => void;

  "presence:snapshot": (
    payload: { boardId: string },
    callback?: (response: SocketAck<PresenceSnapshotPayload>) => void
  ) => void;

  "interaction:start": (
    payload: InteractionStartPayload,
    callback?: (response: SocketAck<InteractionStartAckData>) => void
  ) => void;

  "interaction:update": (
    payload: InteractionUpdatePayload,
    callback?: (response: SocketAck) => void
  ) => void;

  "interaction:end": (
    payload: InteractionEndPayload,
    callback?: (response: SocketAck) => void
  ) => void;

  "interaction:snapshot": (
    payload: InteractionSnapshotPayload,
    callback?: (
      response: SocketAck<{ boardId: string; interactions: CollaborativeInteraction[] }>
    ) => void
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

  "presence:snapshot": (payload: PresenceSnapshotPayload) => void;
  "presence:user-joined": (payload: PresenceUserJoinedPayload) => void;
  "presence:user-left": (payload: PresenceUserLeftPayload) => void;
  "presence:cursor": (payload: PresenceCursorBroadcastPayload) => void;
  "presence:activity": (payload: PresenceActivityBroadcastPayload) => void;

  "interaction:start": (payload: InteractionBroadcastPayload) => void;
  "interaction:update": (payload: InteractionBroadcastPayload) => void;
  "interaction:end": (payload: InteractionEndBroadcastPayload) => void;
  "interaction:snapshot": (payload: { boardId: string; interactions: CollaborativeInteraction[] }) => void;

  "workspace:member-role-updated": (payload: WorkspaceMemberRoleUpdatedPayload) => void;

  error: (message: string) => void;
}

export type WorkspaceMemberRoleUpdatedPayload = {
  workspaceId: string;
  userId: string;
  previousRole?: string;
  newRole: string;
};

/**
 * Collaborative Interaction Domain Types (Slice 16)
 */
export type InteractionType =
  | "selecting"
  | "moving"
  | "resizing"
  | "rotating"
  | "editing-text"
  | "commenting"
  | "drawing";

export type InteractionTargetType = "shape" | "comment";

export interface InteractionTarget {
  type: InteractionTargetType;
  id: string;
}

export interface CollaborativeInteraction {
  interactionId: string;
  socketId: string;
  userId: string;
  boardId: string;
  type: InteractionType;
  targets: InteractionTarget[];
  startedAt: string;
  updatedAt: string;
  data?: Record<string, unknown>;
}

export interface InteractionConflict {
  code: "INTERACTION_CONFLICT";
  resourceType: InteractionTargetType;
  resourceId: string;
  ownerUserId: string;
  interactionType: InteractionType;
}

export interface InteractionStartPayload {
  boardId: string;
  type: InteractionType;
  targets: InteractionTarget[];
  data?: Record<string, unknown>;
}

export interface InteractionStartAckData {
  interactionId: string;
  startedAt: string;
}

export interface InteractionUpdatePayload {
  boardId: string;
  interactionId: string;
  targets?: InteractionTarget[];
  data?: Record<string, unknown>;
}

export interface InteractionEndPayload {
  boardId: string;
  interactionId: string;
}

export interface InteractionSnapshotPayload {
  boardId: string;
}

export interface InteractionBroadcastPayload {
  boardId: string;
  interaction: CollaborativeInteraction;
}

export interface InteractionEndBroadcastPayload {
  boardId: string;
  interactionId: string;
  userId: string;
  type: InteractionType;
  targets: InteractionTarget[];
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
