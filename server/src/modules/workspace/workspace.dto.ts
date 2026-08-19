import { Types } from "mongoose";
import { WorkspaceRole } from "./workspace.types";

/**
 * Workspace DTOs
 */
export type CreateWorkspaceDto = {
  name: string;
  description?: string;
};

export type UpdateWorkspaceDto = {
  name?: string;
  description?: string;
};

/**
 * Workspace Member DTOs
 */
export type CreateWorkspaceMemberDto = {
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  role: WorkspaceRole;
  joinedAt?: Date;
};

export type WorkspaceResponseDto = {
  id: string;
  name: string;
  description?: string;
  visibility: string;
  role: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
};