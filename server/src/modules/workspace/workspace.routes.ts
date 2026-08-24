import { Router } from "express";

import {
  asyncHandler,
  authenticate,
  validate,
} from "@/shared/middlewares";

import { workspaceController } from "./workspace.controller";

import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  workspaceParamsSchema,
  addWorkspaceMemberSchema,
  updateWorkspaceMemberRoleSchema,
  workspaceMemberParamsSchema,
} from "./workspace.validation";

const workspaceRouter = Router();

/**
 * Create Workspace
 */
workspaceRouter.post(
  "/",
  authenticate,
  validate(createWorkspaceSchema),
  asyncHandler(
    workspaceController.createWorkspace.bind(
      workspaceController
    )
  )
);

/**
 * Get User Workspaces
 */
workspaceRouter.get(
  "/",
  authenticate,
  asyncHandler(
    workspaceController.getUserWorkspaces.bind(
      workspaceController
    )
  )
);

/**
 * Get Workspace By Id
 */
workspaceRouter.get(
  "/:id",
  authenticate,
  validate(workspaceParamsSchema),
  asyncHandler(
    workspaceController.getWorkspace.bind(
      workspaceController
    )
  )
);

/**
 * Update Workspace
 */
workspaceRouter.patch(
  "/:id",
  authenticate,
  validate(workspaceParamsSchema),
  validate(updateWorkspaceSchema),
  asyncHandler(
    workspaceController.updateWorkspace.bind(
      workspaceController
    )
  )
);

/**
 * Delete Workspace
 */
workspaceRouter.delete(
  "/:id",
  authenticate,
  validate(workspaceParamsSchema),
  asyncHandler(
    workspaceController.deleteWorkspace.bind(
      workspaceController
    )
  )
);

/**
 * Workspace Member Management Routes
 */
workspaceRouter.get(
  "/:id/members",
  authenticate,
  validate(workspaceParamsSchema),
  asyncHandler(
    workspaceController.getMembers.bind(
      workspaceController
    )
  )
);

workspaceRouter.post(
  "/:id/members",
  authenticate,
  validate(addWorkspaceMemberSchema),
  asyncHandler(
    workspaceController.addMember.bind(
      workspaceController
    )
  )
);

workspaceRouter.patch(
  "/:id/members/:memberUserId",
  authenticate,
  validate(updateWorkspaceMemberRoleSchema),
  asyncHandler(
    workspaceController.updateMemberRole.bind(
      workspaceController
    )
  )
);

workspaceRouter.delete(
  "/:id/members/:memberUserId",
  authenticate,
  validate(workspaceMemberParamsSchema),
  asyncHandler(
    workspaceController.removeMember.bind(
      workspaceController
    )
  )
);

export default workspaceRouter;