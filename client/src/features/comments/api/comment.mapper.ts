import type { CommentResponseDto } from "@/services/socket";
import type { Comment } from "../types";

/**
 * Maps raw API or Socket comment DTO into strongly typed client domain Comment.
 */
export function mapCommentResponseToComment(dto: CommentResponseDto): Comment {
  return {
    id: dto.id,
    boardId: dto.boardId,
    canvasId: (dto as any).canvasId ?? "",
    shapeId: dto.shapeId ?? null,
    authorId: dto.authorId,
    author: dto.author
      ? {
          id: dto.author.id,
          fullName: dto.author.fullName,
          email: dto.author.email,
          avatar: dto.author.avatar,
        }
      : undefined,
    parentCommentId: dto.parentCommentId ?? null,
    position: (dto as any).position
      ? {
          x: (dto as any).position.x,
          y: (dto as any).position.y,
        }
      : null,
    content: dto.isDeleted ? "" : dto.content,
    isResolved: Boolean(dto.isResolved),
    resolvedAt: (dto as any).resolvedAt ?? null,
    resolvedBy: (dto as any).resolvedBy ?? null,
    isEdited: Boolean(dto.isEdited),
    isDeleted: Boolean(dto.isDeleted),
    version: dto.version ?? 1,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}
