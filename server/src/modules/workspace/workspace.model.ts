import { Schema, model, models, Types } from "mongoose";

import { WorkspaceVisibility } from "./workspace.types";

const workspaceSchema = new Schema(
  {
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

    ownerId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },

    visibility: {
      type: String,
      enum: Object.values(WorkspaceVisibility),
      default: WorkspaceVisibility.PRIVATE,
    },
  },
  {
    timestamps: true,
    collection: "workspaces",
  }
);

/**
 * Indexes
 */

// Fetch all workspaces owned by a user
workspaceSchema.index({ ownerId: 1 });

// Future support for public workspace discovery
workspaceSchema.index({ visibility: 1 });

const MODEL_NAME = "Workspace";

export const WorkspaceModel =
  models[MODEL_NAME] || model(MODEL_NAME, workspaceSchema);