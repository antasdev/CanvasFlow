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
