import { Router } from "express";

import {
  asyncHandler,
  authenticate,
  validate,
} from "@/shared/middlewares";

import { shapeController } from "./shape.controller";

import {
  createShapeSchema,
  updateShapeValidationSchema,
  shapeParamsSchema,
  canvasShapeParamsSchema,
} from "./shape.validation";

const shapeRouter = Router();

/**
 * Create Shape
 */
shapeRouter.post(
  "/",
  authenticate,
  validate(createShapeSchema),
  asyncHandler(
    shapeController.createShape.bind(
      shapeController
    )
  )
);

/**
 * Get Shape
 */
shapeRouter.get(
  "/:id",
  authenticate,
  validate(shapeParamsSchema),
  asyncHandler(
    shapeController.getShape.bind(
      shapeController
    )
  )
);

/**
 * Get Shapes by Canvas
 */
shapeRouter.get(
  "/canvas/:canvasId",
  authenticate,
  validate(canvasShapeParamsSchema),
  asyncHandler(
    shapeController.getCanvasShapes.bind(
      shapeController
    )
  )
);

/**
 * Update Shape
 */
shapeRouter.patch(
  "/:id",
  authenticate,
  validate(updateShapeValidationSchema),
  asyncHandler(
    shapeController.updateShape.bind(
      shapeController
    )
  )
);

/**
 * Delete Shape
 */
shapeRouter.delete(
  "/:id",
  authenticate,
  validate(shapeParamsSchema),
  asyncHandler(
    shapeController.deleteShape.bind(
      shapeController
    )
  )
);

export default shapeRouter;