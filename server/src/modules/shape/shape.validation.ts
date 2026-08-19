import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ID format."
  );

export const shapeStyleValidationSchema = z.object({
  fill: z.string().trim().optional(),
  stroke: z.string().trim().optional(),
  strokeWidth: z.number().min(0, "Stroke width cannot be negative.").max(50).optional(),
  opacity: z.number().min(0, "Opacity must be at least 0.").max(1, "Opacity cannot exceed 1.").optional(),
});

export const createShapeSchema = z.object({
  body: z.object({
    canvasId: objectIdSchema,

    type: z.enum(["rectangle", "RECTANGLE"]).transform(() => "RECTANGLE" as const),

    x: z.number().finite("x must be a finite number."),

    y: z.number().finite("y must be a finite number."),

    width: z
      .number()
      .positive("Width must be greater than 0."),

    height: z
      .number()
      .positive("Height must be greater than 0."),

    rotation: z
      .number()
      .finite("Rotation must be a finite number.")
      .optional(),

    style: shapeStyleValidationSchema.optional(),
  }),
});

export const updateShapeValidationSchema =
  z.object({
    params: z.object({
      id: objectIdSchema,
    }),

    body: z.object({
      x: z.number().finite("x must be a finite number.").optional(),

      y: z.number().finite("y must be a finite number.").optional(),

      width: z
        .number()
        .positive("Width must be greater than 0.")
        .optional(),

      height: z
        .number()
        .positive("Height must be greater than 0.")
        .optional(),

      rotation: z
        .number()
        .finite("Rotation must be a finite number.")
        .optional(),

      style: shapeStyleValidationSchema.optional(),
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
