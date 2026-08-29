import { Schema, model } from "mongoose";

import { Comment } from "./comment.types";

const commentSchema = new Schema<Comment>(
  {
    boardId: {
      type: Schema.Types.ObjectId,
      ref: "Board",
      required: true,
      index: true,
    },

    canvasId: {
      type: Schema.Types.ObjectId,
      ref: "Canvas",
      required: true,
      index: true,
    },

    shapeId: {
      type: Schema.Types.ObjectId,
      ref: "Shape",
      default: null,
    },

    authorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    parentCommentId: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    },

    position: {
      type: {
        x: { type: Number, required: true },
        y: { type: Number, required: true },
      },
      _id: false,
      default: null,
    },

    content: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },

    isResolved: {
      type: Boolean,
      default: false,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isEdited: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Compound & Single-Field Indexes:
 * 1. { boardId: 1, canvasId: 1, createdAt: 1 } - Fast chronological retrieval of all comments for a canvas.
 * 2. { boardId: 1, shapeId: 1, createdAt: 1 } - Fast filtering of comments attached to shapes on a board.
 * 3. { parentCommentId: 1, createdAt: 1 } - Fast chronological resolution of thread replies.
 * 4. { authorId: 1, createdAt: -1 } - User-specific comment lookups and audit queries.
 */
commentSchema.index({ boardId: 1, canvasId: 1, createdAt: 1 });
commentSchema.index({ boardId: 1, shapeId: 1, createdAt: 1 });
commentSchema.index({ parentCommentId: 1, createdAt: 1 });
commentSchema.index({ authorId: 1, createdAt: -1 });

export const CommentModel = model<Comment>("Comment", commentSchema);
