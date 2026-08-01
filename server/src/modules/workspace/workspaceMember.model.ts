import { Schema, model, models, Types } from "mongoose";

import { WorkspaceRole } from "./workspace.types";

const workspaceMemberSchema = new Schema(
  {
    workspaceId: {
      type: Types.ObjectId,
      ref: "Workspace",
      required: true,
    },

    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },

    role: {
      type: String,
      enum: Object.values(WorkspaceRole),
      required: true,
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "workspace_members",
  }
);

/**
 * Indexes
 */

// Find all members of a workspace
workspaceMemberSchema.index({ workspaceId: 1 });

// Find all workspaces for a user
workspaceMemberSchema.index({ userId: 1 });

// Prevent duplicate memberships
workspaceMemberSchema.index(
  {
    workspaceId: 1,
    userId: 1,
  },
  {
    unique: true,
  }
);

const MODEL_NAME = "WorkspaceMember";

export const WorkspaceMemberModel =
  models[MODEL_NAME] || model(MODEL_NAME, workspaceMemberSchema);