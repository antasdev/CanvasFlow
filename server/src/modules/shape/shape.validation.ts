import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ID format."
  );

export const MAX_FREEHAND_POINTS = 2000;

export const shapePointsSchema = z
  .array(
    z
      .number()
      .finite("Point coordinate must be a finite number.")
      .min(-100000, "Point coordinate out of bounds.")
      .max(100000, "Point coordinate out of bounds.")
  )
  .min(2, "Stroke must contain at least 2 coordinate numbers (1 point).")
  .max(MAX_FREEHAND_POINTS, `Points array cannot exceed ${MAX_FREEHAND_POINTS} numbers.`)
  .refine((arr) => arr.length % 2 === 0, {
    message: "Points array must contain an even number of coordinate values [x, y, ...].",
  });

export const anchorPositionSchema = z.enum(["top", "right", "bottom", "left", "center"]);
export const connectorRoutingSchema = z.enum(["straight", "orthogonal", "curved"]);

export const shapeConnectorSchema = z
  .object({
    sourceShapeId: objectIdSchema.nullable().optional(),
    sourceAnchor: anchorPositionSchema.nullable().optional(),
    targetShapeId: objectIdSchema.nullable().optional(),
    targetAnchor: anchorPositionSchema.nullable().optional(),
    routing: connectorRoutingSchema.optional().default("straight"),
  })
  .refine(
    (data) => {
      if (data.sourceShapeId && data.targetShapeId) {
        return data.sourceShapeId !== data.targetShapeId;
      }
      return true;
    },
    {
      message: "Connector cannot attach source and target to the same shape.",
      path: ["targetShapeId"],
    }
  );

export const shapeStyleValidationSchema = z.object({
  // Rectangle / Shared styles
  fill: z.string().trim().optional(),
  stroke: z.string().trim().optional(),
  strokeWidth: z.number().min(0, "Stroke width cannot be negative.").max(50).optional(),
  opacity: z.number().min(0, "Opacity must be at least 0.").max(1, "Opacity cannot exceed 1.").optional(),

  // Vector stroke styles
  strokeStyle: z.enum(["solid", "dashed"]).optional(),
  arrowHeadEnd: z.boolean().optional(),
  arrowHeadStart: z.boolean().optional(),
  pointerLength: z.number().min(2).max(50).optional(),
  pointerWidth: z.number().min(2).max(50).optional(),

  // Text / Sticky Note styles
  text: z.string().max(5000, "Text cannot exceed 5000 characters.").optional(),
  fontSize: z.number().min(8, "Font size must be at least 8.").max(200, "Font size cannot exceed 200.").optional(),
  fontFamily: z.string().trim().max(100).optional(),
  fontWeight: z.union([z.string().trim().max(20), z.number()]).optional(),
  fontStyle: z.string().trim().max(20).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  backgroundColor: z.string().trim().optional(),
  textColor: z.string().trim().optional(),

  // Freehand points fallback in style
  points: shapePointsSchema.optional(),
});

export const createShapeSchema = z
  .object({
    body: z.object({
      canvasId: objectIdSchema,

      type: z
        .enum([
          "rectangle",
          "RECTANGLE",
          "text",
          "TEXT",
          "sticky_note",
          "STICKY_NOTE",
          "freehand",
          "FREEHAND",
          "line",
          "LINE",
          "arrow",
          "ARROW",
          "connector",
          "CONNECTOR",
        ])
        .transform((val) => {
          const upper = val.toUpperCase();
          if (upper === "TEXT") return "TEXT" as const;
          if (upper === "STICKY_NOTE") return "STICKY_NOTE" as const;
          if (upper === "FREEHAND") return "FREEHAND" as const;
          if (upper === "LINE") return "LINE" as const;
          if (upper === "ARROW") return "ARROW" as const;
          if (upper === "CONNECTOR") return "CONNECTOR" as const;
          return "RECTANGLE" as const;
        }),

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

      points: shapePointsSchema.optional(),

      connector: shapeConnectorSchema.optional(),

      style: shapeStyleValidationSchema.optional(),
    }),
  })
  .refine(
    (data) => {
      const t = data.body.type;
      if (t === "FREEHAND") {
        const pts = data.body.points ?? data.body.style?.points;
        return Array.isArray(pts) && pts.length >= 2;
      }
      if (t === "LINE" || t === "ARROW" || t === "CONNECTOR") {
        const pts = data.body.points ?? data.body.style?.points;
        return Array.isArray(pts) && pts.length >= 4;
      }
      return true;
    },
    {
      message: "Vector shape must include a points array with at least 2 points [x1, y1, x2, y2].",
      path: ["body", "points"],
    }
  );

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

      points: shapePointsSchema.optional(),

      connector: shapeConnectorSchema.optional(),

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
