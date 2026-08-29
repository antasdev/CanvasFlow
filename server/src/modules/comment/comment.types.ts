import { HydratedDocument, Types } from "mongoose";

/**
 * Discriminator type representing the target of a comment.
 */
export type CommentTarget =
  | {
      type: "canvas";
      position: {
        x: number;
        y: number;
      };
    }
  | {
      type: "shape";
      shapeId: string;
      position?: {
        x: number;
        y: number;
      };
    };

/**
 * 2D World-space position anchor.
 */
export type CommentPosition = {
  x: number;
  y: number;
};

/**
 * Persistent Comment Domain Entity.
 */
export type Comment = {
  _id: Types.ObjectId;
  boardId: Types.ObjectId;
  canvasId: Types.ObjectId;
  shapeId?: Types.ObjectId | null;
  authorId: Types.ObjectId;
  parentCommentId?: Types.ObjectId | null;
  position?: CommentPosition | null;
  content: string;
  isResolved: boolean;
  resolvedAt?: Date | null;
  resolvedBy?: Types.ObjectId | null;
  isEdited: boolean;
  deletedAt?: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Data payload required to persist a new comment.
 */
export type CreateCommentData = {
  boardId: Types.ObjectId;
  canvasId: Types.ObjectId;
  shapeId?: Types.ObjectId | null;
  authorId: Types.ObjectId;
  parentCommentId?: Types.ObjectId | null;
  position?: CommentPosition | null;
  content: string;
  isResolved?: boolean;
  isEdited?: boolean;
  version?: number;
};

/**
 * Data payload used for updating an existing comment.
 */
export type UpdateCommentData = {
  content?: string;
  isEdited?: boolean;
  isResolved?: boolean;
  resolvedAt?: Date | null;
  resolvedBy?: Types.ObjectId | null;
  deletedAt?: Date | null;
};

/**
 * Query filter parameters for retrieving comments from repository.
 */
export type CommentFilter = {
  boardId: Types.ObjectId;
  canvasId?: Types.ObjectId | null;
  shapeId?: Types.ObjectId | null;
  parentCommentId?: Types.ObjectId | null;
  isResolved?: boolean;
  includeDeleted?: boolean;
};

/**
 * Hydrated Mongoose Document for Comment.
 */
export type CommentDocument = HydratedDocument<Comment>;
