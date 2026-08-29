import { Types } from "mongoose";

/**
 * Public representation of a comment's author.
 */
export type CommentAuthorDto = {
  id: string;
  fullName: string;
  email?: string;
  avatar?: string;
};

/**
 * Canonical Comment Response DTO returned over HTTP and Socket.IO.
 */
export type CommentResponseDto = {
  id: string;
  boardId: string;
  canvasId: string;
  shapeId: string | null;
  authorId: string;
  author?: CommentAuthorDto;
  parentCommentId: string | null;
  position: {
    x: number;
    y: number;
  } | null;
  content: string;
  isResolved: boolean;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Internal/Service DTO for creating a new comment or reply.
 */
export type CreateCommentDto = {
  boardId: Types.ObjectId;
  canvasId?: Types.ObjectId;
  shapeId?: Types.ObjectId | null;
  parentCommentId?: Types.ObjectId | null;
  position?: {
    x: number;
    y: number;
  } | null;
  content: string;
};

/**
 * Internal/Service DTO for creating a reply to an existing thread.
 */
export type CreateReplyDto = {
  content: string;
  expectedVersion?: number;
};

/**
 * Internal/Service DTO for updating an existing comment's content.
 */
export type UpdateCommentDto = {
  expectedVersion?: number;
  content: string;
};

/**
 * Internal/Service DTO for resolving/unresolving a comment thread.
 */
export type ResolveCommentDto = {
  expectedVersion?: number;
  isResolved: boolean;
};

/**
 * Query filter DTO for fetching board or canvas comments.
 */
export type CommentFilterDto = {
  canvasId?: Types.ObjectId | null;
  shapeId?: Types.ObjectId | null;
  parentCommentId?: Types.ObjectId | null;
  isResolved?: boolean;
};
