import { NotificationDocument } from "./notification.model";
import { NotificationActorDto, NotificationResponseDto } from "./notification.dto";

export const notificationMapper = {
  toResponseDto(
    notification: NotificationDocument,
    actorOverride?: {
      _id?: unknown;
      fullName?: string;
      email?: string;
      profile?: { avatar?: string };
    } | null
  ): NotificationResponseDto {
    const rawActor = actorOverride || notification.actorId;
    let actorDto: NotificationActorDto | undefined = undefined;

    if (
      rawActor &&
      typeof rawActor === "object" &&
      ("_id" in (rawActor as Record<string, unknown>) || "id" in (rawActor as Record<string, unknown>))
    ) {
      const actorObj = rawActor as {
        _id?: unknown;
        id?: string;
        fullName?: string;
        email?: string;
        profile?: { avatar?: string };
      };
      actorDto = {
        id: (actorObj._id?.toString() || actorObj.id || "").toString(),
        fullName: actorObj.fullName || "Collaborator",
        email: actorObj.email,
        avatar: actorObj.profile?.avatar,
      };
    }

    const meta = (notification.metadata as Record<string, unknown>) || {};

    return {
      id: notification._id.toString(),
      recipientId: notification.recipientId.toString(),
      actorId:
        notification.actorId &&
        typeof notification.actorId === "object" &&
        "_id" in (notification.actorId as unknown as Record<string, unknown>)
          ? ((notification.actorId as unknown as { _id: unknown })._id || "").toString()
          : notification.actorId.toString(),
      actor: actorDto,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      metadata: {
        workspaceId: meta.workspaceId ? meta.workspaceId.toString() : undefined,
        boardId: meta.boardId ? meta.boardId.toString() : undefined,
        canvasId: meta.canvasId ? meta.canvasId.toString() : undefined,
        commentId: meta.commentId ? meta.commentId.toString() : undefined,
        parentCommentId: meta.parentCommentId
          ? meta.parentCommentId.toString()
          : undefined,
        threadRootCommentId: meta.threadRootCommentId
          ? meta.threadRootCommentId.toString()
          : undefined,
        commentContentSnippet:
          typeof meta.commentContentSnippet === "string"
            ? meta.commentContentSnippet
            : undefined,
        action: typeof meta.action === "string" ? meta.action : undefined,
        extra:
          meta.extra && typeof meta.extra === "object"
            ? (meta.extra as Record<string, unknown>)
            : undefined,
      },
      isRead: notification.isRead,
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString(),
    };
  },
};
