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

export default workspaceRouter;