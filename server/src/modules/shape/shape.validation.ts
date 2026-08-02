import { z } from "zod";

import { ShapeType } from "./shape.types";

const objectIdSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ID format."
  );

const shapeTypeSchema = z.nativeEnum(
  ShapeType
);

export const createShapeSchema = z.object({
  body: z.object({
    canvasId: objectIdSchema,

    type: shapeTypeSchema,

    x: z.number(),

    y: z.number(),

    width: z
      .number()
      .positive(),

    height: z
      .number()
      .positive(),

    rotation: z
      .number()
      .optional(),

    style: z
      .record(z.string(), z.unknown())
      .optional(),
  }),
});

export const updateShapeValidationSchema =
  z.object({
    params: z.object({
      id: objectIdSchema,
    }),

    body: z.object({
      x: z.number().optional(),

      y: z.number().optional(),

      width: z
        .number()
        .positive()
        .optional(),

      height: z
        .number()
        .positive()
        .optional(),

      rotation: z
        .number()
        .optional(),

      style: z
        .record(
          z.string(),
          z.unknown()
        )
        .optional(),
    }),
  });

export const shapeParamsSchema =
  z.object({
    params: z.object({
      id: objectIdSchema,
    }),
  });

export const canvasShapeParamsSchema =
  z.object({
    params: z.object({
      canvasId: objectIdSchema,
    }),
  });