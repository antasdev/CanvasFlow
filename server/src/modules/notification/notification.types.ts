import { Types } from "mongoose";

/**
 * Authoritative notification type enumeration.
 * Designed generically to support future types without subsystem redesign.
 */
export enum NotificationType {
  MENTION = "MENTION",
  COMMENT_REPLY = "COMMENT_REPLY",
  THREAD_ACTIVITY = "THREAD_ACTIVITY",
  BOARD_INVITATION = "BOARD_INVITATION",
  WORKSPACE_INVITATION = "WORKSPACE_INVITATION",
  ASSIGNMENT = "ASSIGNMENT",
  SYSTEM = "SYSTEM",
}

/**
 * Structured notification metadata.
 * Enables client navigation and UI rendering without parsing unstructured message text.
 */
export interface NotificationMetadata {
  workspaceId?: Types.ObjectId | string;
  boardId?: Types.ObjectId | string;
  canvasId?: Types.ObjectId | string;
  commentId?: Types.ObjectId | string;
  parentCommentId?: Types.ObjectId | string;
  threadRootCommentId?: Types.ObjectId | string;
  commentContentSnippet?: string;
  action?: "RESOLVED" | "REOPENED" | string;
  extra?: Record<string, unknown>;
}

/**
 * Core Notification domain entity.
 */
export interface Notification {
  id: string;
  recipientId: Types.ObjectId;
  actorId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  metadata: NotificationMetadata;
  isRead: boolean;
  readAt: Date | null;
  idempotencyKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creation payload for Notification persistence.
 */
export interface CreateNotificationData {
  recipientId: Types.ObjectId;
  actorId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: NotificationMetadata;
  isRead?: boolean;
  readAt?: Date | null;
  idempotencyKey?: string | null;
}
