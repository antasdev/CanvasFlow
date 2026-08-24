import type { WorkspaceRole } from "../types";
import {
  canEditWorkspace,
  canDeleteWorkspace,
  canManageMembers,
  canCreateBoard,
  canEditBoard,
  canDeleteBoard,
  canEditCanvas,
  canAddComment,
} from "../utils/permissions";

export const useWorkspacePermissions = (role?: WorkspaceRole | null) => {
  return {
    role,
    canEditWorkspace: canEditWorkspace(role),
    canDeleteWorkspace: canDeleteWorkspace(role),
    canManageMembers: canManageMembers(role),
    canCreateBoard: canCreateBoard(role),
    canEditBoard: (isCreator?: boolean) => canEditBoard(role, isCreator),
    canDeleteBoard: (isCreator?: boolean) => canDeleteBoard(role, isCreator),
    canEditCanvas: canEditCanvas(role),
    canAddComment: canAddComment(role),
    isOwner: role === "OWNER",
    isAdmin: role === "ADMIN",
    isEditor: role === "EDITOR",
    isViewer: role === "VIEWER",
  };
};
