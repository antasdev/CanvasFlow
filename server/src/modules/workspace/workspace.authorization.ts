import { WorkspaceRole } from "./workspace.types";
import { HttpStatus } from "@/shared/constants/http-status";
import { ApiError } from "@/shared/utils/ApiError";

export enum WorkspacePermission {
  VIEW_WORKSPACE = "VIEW_WORKSPACE",
  UPDATE_WORKSPACE = "UPDATE_WORKSPACE",
  DELETE_WORKSPACE = "DELETE_WORKSPACE",
  VIEW_MEMBERS = "VIEW_MEMBERS",
  MANAGE_MEMBERS = "MANAGE_MEMBERS",
  CREATE_BOARD = "CREATE_BOARD",
  EDIT_BOARD = "EDIT_BOARD",
  DELETE_BOARD = "DELETE_BOARD",
}

const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<WorkspacePermission>> = {
  [WorkspaceRole.OWNER]: new Set([
    WorkspacePermission.VIEW_WORKSPACE,
    WorkspacePermission.UPDATE_WORKSPACE,
    WorkspacePermission.DELETE_WORKSPACE,
    WorkspacePermission.VIEW_MEMBERS,
    WorkspacePermission.MANAGE_MEMBERS,
    WorkspacePermission.CREATE_BOARD,
    WorkspacePermission.EDIT_BOARD,
    WorkspacePermission.DELETE_BOARD,
  ]),
  [WorkspaceRole.ADMIN]: new Set([
    WorkspacePermission.VIEW_WORKSPACE,
    WorkspacePermission.UPDATE_WORKSPACE,
    WorkspacePermission.VIEW_MEMBERS,
    WorkspacePermission.MANAGE_MEMBERS,
    WorkspacePermission.CREATE_BOARD,
    WorkspacePermission.EDIT_BOARD,
    WorkspacePermission.DELETE_BOARD,
  ]),
  [WorkspaceRole.EDITOR]: new Set([
    WorkspacePermission.VIEW_WORKSPACE,
    WorkspacePermission.VIEW_MEMBERS,
    WorkspacePermission.CREATE_BOARD,
    WorkspacePermission.EDIT_BOARD,
    WorkspacePermission.DELETE_BOARD,
  ]),
  [WorkspaceRole.VIEWER]: new Set([
    WorkspacePermission.VIEW_WORKSPACE,
    WorkspacePermission.VIEW_MEMBERS,
  ]),
};

export const hasWorkspacePermission = (
  role: WorkspaceRole,
  permission: WorkspacePermission
): boolean => {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
};

export const assertWorkspacePermission = (
  role: WorkspaceRole,
  permission: WorkspacePermission,
  message: string = "You do not have permission to perform this action."
): void => {
  if (!hasWorkspacePermission(role, permission)) {
    throw new ApiError(HttpStatus.FORBIDDEN, message);
  }
};
