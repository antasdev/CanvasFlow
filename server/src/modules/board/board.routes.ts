import { Router } from "express";

import {
  authenticate,
  asyncHandler,
  validate,
} from "@/shared/middlewares";

import { boardController } from "./board.controller";

import {
  createBoardSchema,
  updateBoardSchema,
  boardParamsSchema,
  workspaceBoardsParamsSchema,
} from "./board.validation";

const boardRouter = Router();

boardRouter.post(
  "/",
  authenticate,
  validate(createBoardSchema),
  asyncHandler(
    boardController.createBoard.bind(
      boardController
    )
  )
);

boardRouter.get(
  "/:id",
  authenticate,
  validate(boardParamsSchema),
  asyncHandler(
    boardController.getBoard.bind(
      boardController
    )
  )
);

boardRouter.get(
  "/workspace/:workspaceId",
  authenticate,
  validate(workspaceBoardsParamsSchema),
  asyncHandler(
    boardController.getBoardsByWorkspace.bind(
      boardController
    )
  )
);

boardRouter.patch(
  "/:id",
  authenticate,
  validate(updateBoardSchema),
  asyncHandler(
    boardController.updateBoard.bind(
      boardController
    )
  )
);

boardRouter.delete(
  "/:id",
  authenticate,
  validate(boardParamsSchema),
  asyncHandler(
    boardController.deleteBoard.bind(
      boardController
    )
  )
);

export default boardRouter;