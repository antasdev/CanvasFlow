import { Router } from "express";
import {
  asyncHandler,
  authenticate,
  validate,
} from "@/shared/middlewares";
import { historyController } from "./history.controller";
import {
  boardVersionsQuerySchema,
  createManualVersionSchema,
  updateVersionMetadataSchema,
  versionParamsSchema,
} from "./history.validation";

export const historyRouter = Router({ mergeParams: true });

/**
 * Create Manual Version Checkpoint
 * POST /api/v1/boards/:boardId/versions
 */
historyRouter.post(
  "/",
  authenticate,
  validate(createManualVersionSchema),
  asyncHandler(historyController.createManualVersion.bind(historyController))
);

/**
 * List Versions for a Board (paginated summaries)
 * GET /api/v1/boards/:boardId/versions
 */
historyRouter.get(
  "/",
  authenticate,
  validate(boardVersionsQuerySchema),
  asyncHandler(historyController.getBoardVersions.bind(historyController))
);

/**
 * Get Single Version with Complete Historical Snapshot
 * GET /api/v1/boards/:boardId/versions/:versionId
 */
historyRouter.get(
  "/:versionId",
  authenticate,
  validate(versionParamsSchema),
  asyncHandler(historyController.getVersionById.bind(historyController))
);

/**
 * Update Version Metadata (name / description)
 * PATCH /api/v1/boards/:boardId/versions/:versionId
 */
historyRouter.patch(
  "/:versionId",
  authenticate,
  validate(updateVersionMetadataSchema),
  asyncHandler(historyController.updateVersionMetadata.bind(historyController))
);

export default historyRouter;
