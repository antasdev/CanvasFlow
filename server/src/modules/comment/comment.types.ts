import { HydratedDocument, Types } from "mongoose";

/**
 * Discriminator type representing the target of a comment.
 */
export type CommentTarget =
  | { type: "canvas" }
  | { type: "shape"; shapeId: string };

/**
 * Persistent Comment Domain Entity.
 */
export type Comment = {
  _id: Types.ObjectId;
  boardId: Types.ObjectId;
  shapeId?: Types.ObjectId | null;
  authorId: Types.ObjectId;
  parentCommentId?: Types.ObjectId | null;
  content: string;
  isResolved: boolean;
  isEdited: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Data payload required to persist a new comment.
 */
export type CreateCommentData = {
  boardId: Types.ObjectId;
  shapeId?: Types.ObjectId | null;
  authorId: Types.ObjectId;
  parentCommentId?: Types.ObjectId | null;
  content: string;
  isResolved?: boolean;
  isEdited?: boolean;
};

/**
 * Data payload used for updating an existing comment.
 */
export type UpdateCommentData = {
  content?: string;
  isEdited?: boolean;
  isResolved?: boolean;
  deletedAt?: Date | null;
};

/**
 * Query filter parameters for retrieving comments from repository.
 */
export type CommentFilter = {
  boardId: Types.ObjectId;
  shapeId?: Types.ObjectId | null;
  parentCommentId?: Types.ObjectId | null;
  isResolved?: boolean;
  includeDeleted?: boolean;
};

/**
 * Hydrated Mongoose Document for Comment.
 */
export type CommentDocument = HydratedDocument<Comment>;
