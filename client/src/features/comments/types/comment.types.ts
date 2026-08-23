/**
 * Public representation of a comment author on the frontend.
 */
export type CommentAuthor = {
  id: string;
  fullName: string;
  email?: string;
  avatar?: string;
};

/**
 * Domain entity representing a persistent comment on the canvas or shape.
 */
export type Comment = {
  id: string;
  boardId: string;
  shapeId: string | null;
  authorId: string;
  author?: CommentAuthor;
  parentCommentId: string | null;
  content: string;
  isResolved: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  isOptimistic?: boolean;
};

/**
 * Filter mode for comments panel view.
 */
export type CommentFilterType = "all" | "open" | "resolved";

/**
 * Input parameters for creating a new comment.
 */
export type CreateCommentInput = {
  content: string;
  shapeId?: string | null;
  parentCommentId?: string | null;
};

/**
 * Input parameters for editing an existing comment.
 */
export type UpdateCommentInput = {
  content: string;
};
