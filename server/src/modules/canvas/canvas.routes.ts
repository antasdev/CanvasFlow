import { Router } from "express";

import {
  asyncHandler,
  authenticate,
  validate,
} from "@/shared/middlewares";

import {
  canvasController,
} from "./canvas.controller";

import {
  createCanvasSchema,
  updateCanvasValidationSchema,
  canvasParamsSchema,
  boardCanvasParamsSchema,
} from "./canvas.validation";


const canvasRouter = Router();


// Create canvas page
canvasRouter.post(
  "/",
  authenticate,
  validate(createCanvasSchema),
  asyncHandler(
    canvasController.createCanvas.bind(
      canvasController
    )
  )
);


// Get all pages inside a board
canvasRouter.get(
  "/board/:boardId",
  authenticate,
  validate(boardCanvasParamsSchema),
  asyncHandler(
    canvasController.getBoardCanvases.bind(
      canvasController
    )
  )
);


// Get single canvas
canvasRouter.get(
  "/:id",
  authenticate,
  validate(canvasParamsSchema),
  asyncHandler(
    canvasController.getCanvas.bind(
      canvasController
    )
  )
);


// Update canvas
canvasRouter.patch(
  "/:id",
  authenticate,
  validate(updateCanvasValidationSchema),
  asyncHandler(
    canvasController.updateCanvas.bind(
      canvasController
    )
  )
);


// Delete canvas
canvasRouter.delete(
  "/:id",
  authenticate,
  validate(canvasParamsSchema),
  asyncHandler(
    canvasController.deleteCanvas.bind(
      canvasController
    )
  )
);


export default canvasRouter;