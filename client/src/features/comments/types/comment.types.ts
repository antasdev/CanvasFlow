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
 * 2D World-space position anchor.
 */
export type CommentPosition = {
  x: number;
  y: number;
};

/**
 * Domain entity representing a persistent comment on the canvas or shape.
 */
export type Comment = {
  id: string;
  boardId: string;
  canvasId: string;
  shapeId: string | null;
  authorId: string;
  author?: CommentAuthor;
  parentCommentId: string | null;
  position?: CommentPosition | null;
  content: string;
  isResolved: boolean;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  version?: number;
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
  canvasId?: string;
  content: string;
  shapeId?: string | null;
  parentCommentId?: string | null;
  position?: CommentPosition | null;
};

/**
 * Input parameters for creating a reply.
 */
export type CreateReplyInput = {
  content: string;
  expectedVersion?: number;
};

/**
 * Input parameters for editing an existing comment.
 */
export type UpdateCommentInput = {
  content: string;
  expectedVersion?: number;
};
