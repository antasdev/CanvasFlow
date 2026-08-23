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
      shapeId: doc.shapeId ? doc.shapeId.toString() : null,
      authorId: doc.authorId.toString(),
      author: authorDto,
      parentCommentId: doc.parentCommentId
        ? doc.parentCommentId.toString()
        : null,
      content: isDeleted ? "" : doc.content,
      isResolved: Boolean(doc.isResolved),
      isEdited: Boolean(doc.isEdited),
      isDeleted,
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
