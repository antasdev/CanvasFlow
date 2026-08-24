export type WorkspaceRole =
    | "OWNER"
    | "ADMIN"
    | "EDITOR"
    | "VIEWER";

export type WorkspaceVisibility =
    | "PRIVATE"
    | "PUBLIC";

export interface Workspace {
    id: string;
    name: string;
    description?: string;
    visibility: WorkspaceVisibility;
    role: WorkspaceRole;
    createdAt: string;
    updatedAt: string;
}

export type CreateWorkspaceRequest = {
  name: string;
  description?: string;
};

export type UpdateWorkspaceRequest = {
  name?: string;
  description?: string;
};

export type CreateWorkspaceResponse = Workspace;

export interface WorkspaceMemberUser {
  id: string;
  fullName: string;
  email: string;
  avatar?: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
  user?: WorkspaceMemberUser;
}

export type AddWorkspaceMemberRequest = {
  email: string;
  role: WorkspaceRole;
};

export type UpdateWorkspaceMemberRoleRequest = {
  role: WorkspaceRole;
};