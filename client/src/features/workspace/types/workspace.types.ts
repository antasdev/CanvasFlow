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

export type CreateWorkspaceResponse = Workspace;