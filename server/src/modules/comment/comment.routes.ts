import { Router } from "express";

import {
  asyncHandler,
  authenticate,
  validate,
} from "@/shared/middlewares";

import { commentController } from "./comment.controller";
import {
  createCommentSchema,
  updateCommentSchema,
  resolveCommentSchema,
  commentParamsSchema,
  boardCommentsParamsSchema,
} from "./comment.validation";

const commentRouter = Router({ mergeParams: true });

/**
 * Create Comment on a Board / Shape / Reply
 * POST /api/v1/boards/:boardId/comments
 */
commentRouter.post(
  "/",
  authenticate,
  validate(createCommentSchema),
  asyncHandler(commentController.createComment.bind(commentController))
);

/**
 * List Comments for a Board (with optional shapeId/resolved query filter)
 * GET /api/v1/boards/:boardId/comments
 */
commentRouter.get(
  "/",
  authenticate,
  validate(boardCommentsParamsSchema),
  asyncHandler(commentController.getBoardComments.bind(commentController))
);

/**
 * Get Single Comment
 * GET /api/v1/boards/:boardId/comments/:commentId
 */
commentRouter.get(
  "/:commentId",
  authenticate,
  validate(commentParamsSchema),
  asyncHandler(commentController.getComment.bind(commentController))
);

/**
 * Update Comment Content (Author only)
 * PATCH /api/v1/boards/:boardId/comments/:commentId
 */
commentRouter.patch(
  "/:commentId",
  authenticate,
  validate(updateCommentSchema),
  asyncHandler(commentController.updateComment.bind(commentController))
);

/**
 * Resolve/Unresolve Comment Thread
 * PATCH /api/v1/boards/:boardId/comments/:commentId/resolve
 */
commentRouter.patch(
  "/:commentId/resolve",
  authenticate,
  validate(resolveCommentSchema),
  asyncHandler(commentController.resolveComment.bind(commentController))
);

/**
 * Soft Delete Comment
 * DELETE /api/v1/boards/:boardId/comments/:commentId
 */
commentRouter.delete(
  "/:commentId",
  authenticate,
  validate(commentParamsSchema),
  asyncHandler(commentController.deleteComment.bind(commentController))
);

export default commentRouter;
