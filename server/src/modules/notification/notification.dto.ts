import { NotificationType } from "./notification.types";

export interface NotificationActorDto {
  id: string;
  fullName: string;
  email?: string;
  avatar?: string;
}

export interface NotificationResponseDto {
  id: string;
  recipientId: string;
  actorId: string;
  actor?: NotificationActorDto;
  type: NotificationType;
  title: string;
  message: string;
  metadata: {
    workspaceId?: string;
    boardId?: string;
    canvasId?: string;
    commentId?: string;
    parentCommentId?: string;
    threadRootCommentId?: string;
    commentContentSnippet?: string;
    action?: string;
    extra?: Record<string, unknown>;
  };
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListResponseDto {
  items: NotificationResponseDto[];
  nextCursor: string | null;
  hasMore: boolean;
  unreadCount: number;
}

export interface NotificationUnreadCountResponseDto {
  unreadCount: number;
}

export interface GetNotificationsQueryDto {
  cursor?: string;
  limit?: number;
  unreadOnly?: boolean;
}
