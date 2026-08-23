import { Schema, model, models } from "mongoose";

import { BoardVisibility } from "./board.types";

const boardSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    visibility: {
      type: String,
      enum: Object.values(BoardVisibility),
      default: BoardVisibility.PRIVATE,
    },

    isArchived: {
      type: Boolean,
      default: false,
    },

    collaborationRevision: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    collection: "boards",
  }
);

// Compound index
boardSchema.index({
  workspaceId: 1,
  isArchived: 1,
});

const MODEL_NAME = "Board";

export const BoardModel =
  models[MODEL_NAME] ||
  model(MODEL_NAME, boardSchema);