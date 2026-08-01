import { HydratedDocument, Types } from "mongoose";

/**
 * Workspace Roles
 */
export enum WorkspaceRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  EDITOR = "EDITOR",
  VIEWER = "VIEWER",
}

/**
 * Workspace Visibility
 */
export enum WorkspaceVisibility {
  PRIVATE = "PRIVATE",
  PUBLIC = "PUBLIC",
}

/**
 * Workspace Entity
 */
export type Workspace = {
  _id: Types.ObjectId;

  name: string;
  description?: string;

  ownerId: Types.ObjectId;

  visibility: WorkspaceVisibility;

  createdAt: Date;
  updatedAt: Date;
};

/**
 * Workspace Member Entity
 */
export type WorkspaceMember = {
  _id: Types.ObjectId;

  workspaceId: Types.ObjectId;

  userId: Types.ObjectId;

  role: WorkspaceRole;

  joinedAt: Date;

  createdAt: Date;
  updatedAt: Date;
};

export type CreateWorkspaceData = {
  name: string;
  description?: string;
  ownerId: Types.ObjectId;
};

/**
 * Workspace Documents
 */
export type WorkspaceDocument = HydratedDocument<Workspace>;

export type WorkspaceMemberDocument =
  HydratedDocument<WorkspaceMember>;