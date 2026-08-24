import type { WorkspaceRole } from "../types";

export const canEditWorkspace = (role?: WorkspaceRole | null): boolean => {
  return role === "OWNER" || role === "ADMIN";
};

export const canDeleteWorkspace = (role?: WorkspaceRole | null): boolean => {
  return role === "OWNER";
};

export const canManageMembers = (role?: WorkspaceRole | null): boolean => {
  return role === "OWNER" || role === "ADMIN";
};

export const canCreateBoard = (role?: WorkspaceRole | null): boolean => {
  return role === "OWNER" || role === "ADMIN" || role === "EDITOR";
};

export const canEditBoard = (
  role?: WorkspaceRole | null,
  isCreator: boolean = false
): boolean => {
  if (!role || role === "VIEWER") return false;
  if (role === "OWNER" || role === "ADMIN") return true;
  if (role === "EDITOR") return isCreator;
  return false;
};

export const canDeleteBoard = (
  role?: WorkspaceRole | null,
  isCreator: boolean = false
): boolean => {
  if (!role || role === "VIEWER") return false;
  if (role === "OWNER" || role === "ADMIN") return true;
  if (role === "EDITOR") return isCreator;
  return false;
};

export const canEditCanvas = (role?: WorkspaceRole | null): boolean => {
  return role === "OWNER" || role === "ADMIN" || role === "EDITOR";
};

export const canAddComment = (role?: WorkspaceRole | null): boolean => {
  return !!role;
};
