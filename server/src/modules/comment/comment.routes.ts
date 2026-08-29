import { Router } from "express";

import {
  asyncHandler,
  authenticate,
  validate,
} from "@/shared/middlewares";

import { commentController } from "./comment.controller";
import {
  createCommentSchema,
  createReplySchema,
  updateCommentSchema,
  resolveCommentSchema,
  commentParamsSchema,
  boardCommentsParamsSchema,
  canvasCommentsParamsSchema,
} from "./comment.validation";

export const commentRouter = Router({ mergeParams: true });
export const canvasCommentRouter = Router({ mergeParams: true });

/**
 * Routes mounted at: /api/v1/boards/:boardId/comments
 */

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
 * Create Reply to a Comment Thread
 * POST /api/v1/boards/:boardId/comments/:commentId/replies
 */
commentRouter.post(
  "/:commentId/replies",
  authenticate,
  validate(createReplySchema),
  asyncHandler(commentController.createReply.bind(commentController))
);

/**
 * List Comments for a Board (with optional canvasId/shapeId/resolved query filter)
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

/**
 * Routes mounted at: /api/v1/boards/:boardId/canvases/:canvasId/comments
 */
canvasCommentRouter.post(
  "/",
  authenticate,
  validate(createCommentSchema),
  asyncHandler(commentController.createComment.bind(commentController))
);

canvasCommentRouter.get(
  "/",
  authenticate,
  validate(canvasCommentsParamsSchema),
  asyncHandler(commentController.getCanvasComments.bind(commentController))
);

export default commentRouter;
