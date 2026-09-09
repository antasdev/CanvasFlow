import { ClientSession, Types } from "mongoose";

import { UserModel } from "@/modules/user/user.model";
import { commentRepository } from "@/modules/comment/comment.repository";
import { CommentMention } from "@/modules/comment/comment.types";
import { getIO, getUserRoom, SocketEvents } from "@/socket";
import { ApiError } from "@/shared/utils";
import { HttpStatus } from "@/shared/constants";

import {
  CreateNotificationData,
  NotificationMetadata,
  NotificationType,
} from "./notification.types";
import {
  GetNotificationsQueryDto,
  NotificationListResponseDto,
  NotificationResponseDto,
  NotificationUnreadCountResponseDto,
} from "./notification.dto";
import { notificationMapper } from "./notification.mapper";
import { notificationRepository } from "./notification.repository";

export class NotificationService {
  /**
   * Helper to safely broadcast to user's private socket room across all their active sessions/devices.
   */
  private safeEmitToUser<T>(
    userId: string | Types.ObjectId,
    event: string,
    payload: T
  ): void {
    try {
      const io = getIO();
      const room = getUserRoom(userId.toString());
      io.to(room).emit(event as any, payload as any);
    } catch {
      // Socket server may not be initialized in isolated unit tests
    }
  }

  /**
   * Creates a single notification, saves to MongoDB, and emits real-time events.
   */
  async createNotification(
    data: CreateNotificationData,
    session?: ClientSession
  ): Promise<NotificationResponseDto> {
    const created = await notificationRepository.create(data, session);
    const populated = await notificationRepository.findById(
      created._id,
      created.recipientId
    );
    const responseDto = notificationMapper.toResponseDto(populated ?? created);

    // Real-time delivery
    this.safeEmitToUser(
      created.recipientId,
      SocketEvents.NOTIFICATION_NEW,
      responseDto
    );

    const unreadCount = await notificationRepository.countUnreadByRecipient(
      created.recipientId
    );
    this.safeEmitToUser(
      created.recipientId,
      SocketEvents.NOTIFICATION_COUNT_UPDATED,
      { unreadCount }
    );

    return responseDto;
  }

  /**
   * Batch creates notifications in MongoDB and emits real-time events to all unique recipients.
   */
  async createNotificationsBatch(
    items: CreateNotificationData[],
    session?: ClientSession
  ): Promise<NotificationResponseDto[]> {
    if (items.length === 0) return [];

    const createdDocs = await notificationRepository.createMany(items, session);
    const resultDtos: NotificationResponseDto[] = [];

    // Distinct recipients for unread count updates
    const recipientIds = new Set<string>();

    for (const doc of createdDocs) {
      recipientIds.add(doc.recipientId.toString());
      const populated = await notificationRepository.findById(
        doc._id,
        doc.recipientId
      );
      const dto = notificationMapper.toResponseDto(populated ?? doc);
      resultDtos.push(dto);

      this.safeEmitToUser(doc.recipientId, SocketEvents.NOTIFICATION_NEW, dto);
    }

    // Refresh unread count for each affected recipient
    for (const recipientIdStr of recipientIds) {
      const recipientObjectId = new Types.ObjectId(recipientIdStr);
      const unreadCount =
        await notificationRepository.countUnreadByRecipient(recipientObjectId);
      this.safeEmitToUser(
        recipientObjectId,
        SocketEvents.NOTIFICATION_COUNT_UPDATED,
        { unreadCount }
      );
    }

    return resultDtos;
  }

  /**
   * Domain Dispatcher: Mentions
   * Extracts mentioned user IDs, deduplicates, excludes the author, diffs edit mentions,
   * creates notifications in MongoDB, and delivers them in real time.
   */
  async dispatchMentionNotifications(params: {
    workspaceId: Types.ObjectId;
    boardId: Types.ObjectId;
    canvasId: Types.ObjectId;
    commentId: Types.ObjectId;
    authorId: Types.ObjectId;
    mentions?: CommentMention[];
    content: string;
    parentCommentId?: Types.ObjectId | null;
    previousMentions?: CommentMention[];
    session?: ClientSession;
  }): Promise<NotificationResponseDto[]> {
    const {
      workspaceId,
      boardId,
      canvasId,
      commentId,
      authorId,
      mentions = [],
      content,
      parentCommentId,
      previousMentions = [],
      session,
    } = params;

    if (!mentions || mentions.length === 0) {
      return [];
    }

    // Extract unique new mention user IDs
    const currentMentionUserIds = Array.from(
      new Set(mentions.map((m) => m.userId.toString()))
    );

    const previousMentionUserIds = new Set(
      previousMentions.map((m) => m.userId.toString())
    );

    // Diff: Only notify users newly introduced in this mutation
    const newTargetUserIds = currentMentionUserIds.filter(
      (userId) =>
        !previousMentionUserIds.has(userId) && userId !== authorId.toString()
    );

    if (newTargetUserIds.length === 0) {
      return [];
    }

    const actor = await UserModel.findById(authorId, null, { session });
    const actorName = actor?.fullName || "A collaborator";
    const snippet =
      content.length > 120 ? `${content.slice(0, 117)}...` : content;

    const notificationItems: CreateNotificationData[] = newTargetUserIds.map(
      (recipientUserId) => {
        const metadata: NotificationMetadata = {
          workspaceId,
          boardId,
          canvasId,
          commentId,
          parentCommentId: parentCommentId ?? undefined,
          threadRootCommentId: parentCommentId ?? commentId,
          commentContentSnippet: snippet,
        };

        return {
          recipientId: new Types.ObjectId(recipientUserId),
          actorId: authorId,
          type: NotificationType.MENTION,
          title: `${actorName} mentioned you`,
          message: `${actorName} mentioned you: "${snippet}"`,
          metadata,
          idempotencyKey: `mention:${commentId}:${recipientUserId}`,
        };
      }
    );

    return this.createNotificationsBatch(notificationItems, session);
  }

  /**
   * Domain Dispatcher: Thread Replies
   * Identifies root comment author and distinct thread participants, excludes reply author,
   * excludes users who already received a mention notification for this reply,
   * persists notifications, and emits real-time events.
   */
  async dispatchReplyNotification(params: {
    workspaceId: Types.ObjectId;
    boardId: Types.ObjectId;
    canvasId: Types.ObjectId;
    replyCommentId: Types.ObjectId;
    parentCommentId: Types.ObjectId;
    authorId: Types.ObjectId;
    content: string;
    mentionedUserIds?: string[];
    session?: ClientSession;
  }): Promise<NotificationResponseDto[]> {
    const {
      workspaceId,
      boardId,
      canvasId,
      replyCommentId,
      parentCommentId,
      authorId,
      content,
      mentionedUserIds = [],
      session,
    } = params;

    const parent = await commentRepository.findById(parentCommentId, session);
    if (!parent) return [];

    const threadReplies = await commentRepository.findByParentCommentId(
      parentCommentId,
      session
    );

    const participantIds = new Set<string>();

    // 1. Root comment author
    const parentAuthorIdStr = (
      typeof parent.authorId === "object" && "_id" in (parent.authorId as any)
        ? (parent.authorId as any)._id
        : parent.authorId
    ).toString();
    participantIds.add(parentAuthorIdStr);

    // 2. Thread participants
    for (const reply of threadReplies) {
      const replyAuthorIdStr = (
        typeof reply.authorId === "object" && "_id" in (reply.authorId as any)
          ? (reply.authorId as any)._id
          : reply.authorId
      ).toString();
      participantIds.add(replyAuthorIdStr);
    }

    // 3. Exclude reply author (no self notification)
    participantIds.delete(authorId.toString());

    // 4. Exclude users who were explicitly mentioned in this reply (mention notification takes precedence)
    for (const mentionedId of mentionedUserIds) {
      participantIds.delete(mentionedId);
    }

    if (participantIds.size === 0) {
      return [];
    }

    const actor = await UserModel.findById(authorId, null, { session });
    const actorName = actor?.fullName || "A collaborator";
    const snippet =
      content.length > 120 ? `${content.slice(0, 117)}...` : content;

    const notificationItems: CreateNotificationData[] = Array.from(
      participantIds
    ).map((recipientUserId) => {
      const metadata: NotificationMetadata = {
        workspaceId,
        boardId,
        canvasId,
        commentId: replyCommentId,
        parentCommentId,
        threadRootCommentId: parentCommentId,
        commentContentSnippet: snippet,
      };

      return {
        recipientId: new Types.ObjectId(recipientUserId),
        actorId: authorId,
        type: NotificationType.COMMENT_REPLY,
        title: `${actorName} replied to a thread`,
        message: `${actorName} replied: "${snippet}"`,
        metadata,
        idempotencyKey: `reply:${replyCommentId}:${recipientUserId}`,
      };
    });

    return this.createNotificationsBatch(notificationItems, session);
  }

  /**
   * Domain Dispatcher: Thread Activity (e.g. Thread Resolved / Reopened)
   * Notifies root comment author and thread participants when a collaborator resolves or reopens a thread.
   */
  async dispatchThreadActivityNotification(params: {
    workspaceId: Types.ObjectId;
    boardId: Types.ObjectId;
    canvasId: Types.ObjectId;
    rootCommentId: Types.ObjectId;
    actorId: Types.ObjectId;
    action: "RESOLVED" | "REOPENED";
    session?: ClientSession;
  }): Promise<NotificationResponseDto[]> {
    const {
      workspaceId,
      boardId,
      canvasId,
      rootCommentId,
      actorId,
      action,
      session,
    } = params;

    const rootComment = await commentRepository.findById(rootCommentId, session);
    if (!rootComment) return [];

    const threadReplies = await commentRepository.findByParentCommentId(
      rootCommentId,
      session
    );

    const participantIds = new Set<string>();

    const rootAuthorIdStr = (
      typeof rootComment.authorId === "object" &&
      "_id" in (rootComment.authorId as any)
        ? (rootComment.authorId as any)._id
        : rootComment.authorId
    ).toString();
    participantIds.add(rootAuthorIdStr);

    for (const reply of threadReplies) {
      const replyAuthorIdStr = (
        typeof reply.authorId === "object" && "_id" in (reply.authorId as any)
          ? (reply.authorId as any)._id
          : reply.authorId
      ).toString();
      participantIds.add(replyAuthorIdStr);
    }

    participantIds.delete(actorId.toString());

    if (participantIds.size === 0) {
      return [];
    }

    const actor = await UserModel.findById(actorId, null, { session });
    const actorName = actor?.fullName || "A collaborator";
    const actionLabel = action === "RESOLVED" ? "resolved" : "reopened";

    const notificationItems: CreateNotificationData[] = Array.from(
      participantIds
    ).map((recipientUserId) => {
      const metadata: NotificationMetadata = {
        workspaceId,
        boardId,
        canvasId,
        commentId: rootCommentId,
        threadRootCommentId: rootCommentId,
        action,
      };

      return {
        recipientId: new Types.ObjectId(recipientUserId),
        actorId,
        type: NotificationType.THREAD_ACTIVITY,
        title: `Thread ${actionLabel}`,
        message: `${actorName} ${actionLabel} a comment thread.`,
        metadata,
        idempotencyKey: `activity:${rootCommentId}:${action}:${Date.now()}:${recipientUserId}`,
      };
    });

    return this.createNotificationsBatch(notificationItems, session);
  }

  /**
   * Retrieves paginated notifications for the authenticated user with unread count.
   */
  async getNotifications(
    recipientId: Types.ObjectId,
    query: GetNotificationsQueryDto
  ): Promise<NotificationListResponseDto> {
    const { items, nextCursor, hasMore } =
      await notificationRepository.findAndPopulateByRecipient(
        recipientId,
        query
      );

    const unreadCount =
      await notificationRepository.countUnreadByRecipient(recipientId);

    return {
      items: items.map((doc) => notificationMapper.toResponseDto(doc)),
      nextCursor,
      hasMore,
      unreadCount,
    };
  }

  /**
   * Retrieves the authoritative unread notification count.
   */
  async getUnreadCount(
    recipientId: Types.ObjectId
  ): Promise<NotificationUnreadCountResponseDto> {
    const unreadCount =
      await notificationRepository.countUnreadByRecipient(recipientId);
    return { unreadCount };
  }

  /**
   * Marks a specific notification as read.
   */
  async markAsRead(
    id: Types.ObjectId,
    recipientId: Types.ObjectId
  ): Promise<NotificationResponseDto> {
    const readAt = new Date();
    const updated = await notificationRepository.markAsRead(
      id,
      recipientId,
      readAt
    );

    if (!updated) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Notification not found.");
    }

    const dto = notificationMapper.toResponseDto(updated);

    // Broadcast read event to all user sessions
    this.safeEmitToUser(recipientId, SocketEvents.NOTIFICATION_READ, {
      id: updated._id.toString(),
      readAt: readAt.toISOString(),
    });

    const unreadCount =
      await notificationRepository.countUnreadByRecipient(recipientId);
    this.safeEmitToUser(recipientId, SocketEvents.NOTIFICATION_COUNT_UPDATED, {
      unreadCount,
    });

    return dto;
  }

  /**
   * Marks all notifications as read for the authenticated user.
   */
  async markAllAsRead(
    recipientId: Types.ObjectId
  ): Promise<{ count: number; readAt: string }> {
    const readAt = new Date();
    const { modifiedCount } = await notificationRepository.markAllAsRead(
      recipientId,
      readAt
    );

    this.safeEmitToUser(recipientId, SocketEvents.NOTIFICATION_ALL_READ, {
      readAt: readAt.toISOString(),
      count: modifiedCount,
    });

    this.safeEmitToUser(recipientId, SocketEvents.NOTIFICATION_COUNT_UPDATED, {
      unreadCount: 0,
    });

    return {
      count: modifiedCount,
      readAt: readAt.toISOString(),
    };
  }
}

export const notificationService = new NotificationService();
