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
 * Structured mention representation on the frontend.
 */
export type CommentMention = {
  userId: string;
  displayName: string;
  startIndex: number;
  endIndex: number;
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
  mentions?: CommentMention[];
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
  mentions?: CommentMention[];
  shapeId?: string | null;
  parentCommentId?: string | null;
  position?: CommentPosition | null;
};

/**
 * Input parameters for creating a reply.
 */
export type CreateReplyInput = {
  content: string;
  mentions?: CommentMention[];
  expectedVersion?: number;
};

/**
 * Input parameters for editing an existing comment.
 */
export type UpdateCommentInput = {
  content: string;
  mentions?: CommentMention[];
  expectedVersion?: number;
};
