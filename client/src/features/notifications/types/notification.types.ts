/**
 * Notification types matching server domain constants.
 */
export const NotificationType = {
  MENTION: "MENTION",
  COMMENT_REPLY: "COMMENT_REPLY",
  THREAD_ACTIVITY: "THREAD_ACTIVITY",
  BOARD_INVITATION: "BOARD_INVITATION",
  WORKSPACE_INVITATION: "WORKSPACE_INVITATION",
  ASSIGNMENT: "ASSIGNMENT",
  SYSTEM: "SYSTEM",
} as const;

export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export interface NotificationActor {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface NotificationMetadata {
  workspaceId?: string;
  boardId?: string;
  canvasId?: string;
  commentId?: string;
  rootCommentId?: string;
  parentCommentId?: string;
  resolved?: boolean;
  [key: string]: unknown;
}

export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  actorId: string;
  actor: NotificationActor | null;
  metadata: NotificationMetadata;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListResponse {
  items: Notification[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface UnreadCountResponse {
  unreadCount: number;
}

export interface NotificationQueryParams {
  limit?: number;
  cursor?: string;
  unreadOnly?: boolean;
}

export type NotificationFilterType = "all" | "unread";
