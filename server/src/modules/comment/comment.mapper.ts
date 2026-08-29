import { Comment, CommentDocument } from "./comment.types";
import { CommentResponseDto, CommentAuthorDto } from "./comment.dto";

type AuthorEntity = {
  _id?: unknown;
  id?: string;
  fullName?: string;
  email?: string;
  profile?: {
    avatar?: string;
  };
};

export class CommentMapper {
  /**
   * Maps internal MongoDB Comment entity / document to public API/Socket response DTO.
   * Safely masks content when the comment is soft-deleted.
   */
  static toResponseDto(
    doc: CommentDocument | Comment,
    authorEntity?: AuthorEntity | null
  ): CommentResponseDto {
    const isDeleted = Boolean(doc.deletedAt);

    let authorDto: CommentAuthorDto | undefined;
    if (authorEntity) {
      const authorId = authorEntity._id
        ? String(authorEntity._id)
        : authorEntity.id ?? doc.authorId.toString();

      authorDto = {
        id: authorId,
        fullName: authorEntity.fullName ?? "Collaborator",
        email: authorEntity.email,
        avatar: authorEntity.profile?.avatar,
      };
    }

    return {
      id: doc._id.toString(),
      boardId: doc.boardId.toString(),
      canvasId: doc.canvasId.toString(),
      shapeId: doc.shapeId ? doc.shapeId.toString() : null,
      authorId: doc.authorId.toString(),
      author: authorDto,
      parentCommentId: doc.parentCommentId
        ? doc.parentCommentId.toString()
        : null,
      position: doc.position
        ? {
            x: doc.position.x,
            y: doc.position.y,
          }
        : null,
      content: isDeleted ? "" : doc.content,
      isResolved: Boolean(doc.isResolved),
      resolvedAt: doc.resolvedAt
        ? doc.resolvedAt instanceof Date
          ? doc.resolvedAt.toISOString()
          : new Date(doc.resolvedAt).toISOString()
        : null,
      resolvedBy: doc.resolvedBy
        ? typeof doc.resolvedBy === "object" && "_id" in (doc.resolvedBy as any)
          ? String((doc.resolvedBy as any)._id)
          : doc.resolvedBy.toString()
        : null,
      isEdited: Boolean(doc.isEdited),
      isDeleted,
      version: doc.version ?? 1,
      createdAt:
        doc.createdAt instanceof Date
          ? doc.createdAt.toISOString()
          : new Date(doc.createdAt).toISOString(),
      updatedAt:
        doc.updatedAt instanceof Date
          ? doc.updatedAt.toISOString()
          : new Date(doc.updatedAt).toISOString(),
    };
  }
}
