import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ID format."
  );

export const MIN_FREEHAND_POINTS = 2;
export const MAX_FREEHAND_POINTS = 2000;

export const MIN_POLYGON_SIDES = 3;
export const MAX_POLYGON_SIDES = 64;

export const MIN_STAR_POINTS = 3;
export const MAX_STAR_POINTS = 64;

export const MIN_STAR_INNER_RADIUS_RATIO = 0.05;
export const MAX_STAR_INNER_RADIUS_RATIO = 0.95;

export const shapeConfigSchema = z.object({
  sides: z
    .number()
    .int("Polygon sides must be an integer.")
    .min(MIN_POLYGON_SIDES, `Polygon must have at least ${MIN_POLYGON_SIDES} sides.`)
    .max(MAX_POLYGON_SIDES, `Polygon cannot exceed ${MAX_POLYGON_SIDES} sides.`)
    .optional(),
  points: z
    .number()
    .int("Star points must be an integer.")
    .min(MIN_STAR_POINTS, `Star must have at least ${MIN_STAR_POINTS} points.`)
    .max(MAX_STAR_POINTS, `Star cannot exceed ${MAX_STAR_POINTS} points.`)
    .optional(),
  innerRadiusRatio: z
    .number()
    .finite("Inner radius ratio must be a finite number.")
    .min(MIN_STAR_INNER_RADIUS_RATIO, `Inner radius ratio must be at least ${MIN_STAR_INNER_RADIUS_RATIO}.`)
    .max(MAX_STAR_INNER_RADIUS_RATIO, `Inner radius ratio cannot exceed ${MAX_STAR_INNER_RADIUS_RATIO}.`)
    .optional(),
});

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

export const MIN_STROKE_WIDTH = 0;
export const MAX_STROKE_WIDTH = 100;

export const MIN_SHADOW_BLUR = 0;
export const MAX_SHADOW_BLUR = 100;
export const MIN_SHADOW_OFFSET = -100;
export const MAX_SHADOW_OFFSET = 100;
export const MIN_SHADOW_OPACITY = 0;
export const MAX_SHADOW_OPACITY = 1;

export const colorSchema = z
  .string()
  .trim()
  .refine(
    (val) =>
      val === "transparent" ||
      /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(val) ||
      /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(val),
    {
      message: "Invalid color format. Must be a valid hex, rgb/rgba, or 'transparent'.",
    }
  );

export const strokeStyleSchema = z.enum(["solid", "dashed", "dotted"]);

export const shapeShadowSchema = z.object({
  enabled: z.boolean().optional(),
  color: colorSchema.optional(),
  blur: z
    .number()
    .finite("Shadow blur must be a finite number.")
    .min(MIN_SHADOW_BLUR, `Shadow blur cannot be less than ${MIN_SHADOW_BLUR}.`)
    .max(MAX_SHADOW_BLUR, `Shadow blur cannot exceed ${MAX_SHADOW_BLUR}.`)
    .optional(),
  offsetX: z
    .number()
    .finite("Shadow offsetX must be a finite number.")
    .min(MIN_SHADOW_OFFSET, `Shadow offsetX cannot be less than ${MIN_SHADOW_OFFSET}.`)
    .max(MAX_SHADOW_OFFSET, `Shadow offsetX cannot exceed ${MAX_SHADOW_OFFSET}.`)
    .optional(),
  offsetY: z
    .number()
    .finite("Shadow offsetY must be a finite number.")
    .min(MIN_SHADOW_OFFSET, `Shadow offsetY cannot be less than ${MIN_SHADOW_OFFSET}.`)
    .max(MAX_SHADOW_OFFSET, `Shadow offsetY cannot exceed ${MAX_SHADOW_OFFSET}.`)
    .optional(),
  opacity: z
    .number()
    .finite("Shadow opacity must be a finite number.")
    .min(MIN_SHADOW_OPACITY, `Shadow opacity cannot be less than ${MIN_SHADOW_OPACITY}.`)
    .max(MAX_SHADOW_OPACITY, `Shadow opacity cannot exceed ${MAX_SHADOW_OPACITY}.`)
    .optional(),
});

export const shapeStyleValidationSchema = z.object({
  // Rectangle / Shared styles
  fill: colorSchema.optional(),
  stroke: colorSchema.optional(),
  strokeWidth: z
    .number()
    .finite("Stroke width must be a finite number.")
    .min(MIN_STROKE_WIDTH, "Stroke width cannot be negative.")
    .max(MAX_STROKE_WIDTH, `Stroke width cannot exceed ${MAX_STROKE_WIDTH}.`)
    .optional(),
  opacity: z
    .number()
    .finite("Opacity must be a finite number.")
    .min(0, "Opacity must be at least 0.")
    .max(1, "Opacity cannot exceed 1.")
    .optional(),

  // Vector / Shared stroke styles
  strokeStyle: strokeStyleSchema.optional(),
  shadow: shapeShadowSchema.optional(),
  arrowHeadEnd: z.boolean().optional(),
  arrowHeadStart: z.boolean().optional(),
  pointerLength: z.number().min(2).max(50).optional(),
  pointerWidth: z.number().min(2).max(50).optional(),

  // Text / Sticky Note styles
  text: z.string().max(10000, "Text cannot exceed 10000 characters.").optional(),
  fontSize: z.number().min(8, "Font size must be at least 8.").max(200, "Font size cannot exceed 200.").optional(),
  fontFamily: z.string().trim().max(100).optional(),
  fontWeight: z.union([z.string().trim().max(20), z.number()]).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  textDecoration: z.enum(["none", "underline"]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  padding: z.number().min(0).max(100).optional(),
  lineHeight: z.number().min(0.5).max(5).optional(),
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
          "circle",
          "CIRCLE",
          "ellipse",
          "ELLIPSE",
          "triangle",
          "TRIANGLE",
          "polygon",
          "POLYGON",
          "star",
          "STAR",
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
          "group",
          "GROUP",
        ])
        .transform((val) => {
          const upper = val.toUpperCase();
          if (upper === "GROUP") return "GROUP" as const;
          if (upper === "CIRCLE") return "CIRCLE" as const;
          if (upper === "ELLIPSE") return "ELLIPSE" as const;
          if (upper === "TRIANGLE") return "TRIANGLE" as const;
          if (upper === "POLYGON") return "POLYGON" as const;
          if (upper === "STAR") return "STAR" as const;
          if (upper === "TEXT") return "TEXT" as const;
          if (upper === "STICKY_NOTE") return "STICKY_NOTE" as const;
          if (upper === "FREEHAND") return "FREEHAND" as const;
          if (upper === "LINE") return "LINE" as const;
          if (upper === "ARROW") return "ARROW" as const;
          if (upper === "CONNECTOR") return "CONNECTOR" as const;
          return "RECTANGLE" as const;
        }),

      parentId: objectIdSchema.nullable().optional(),

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

      text: z.string().max(10000, "Text cannot exceed 10000 characters.").optional(),

      points: shapePointsSchema.optional(),

      connector: shapeConnectorSchema.optional(),

      shapeConfig: shapeConfigSchema.optional(),

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

      text: z.string().max(10000, "Text cannot exceed 10000 characters.").optional(),

      points: shapePointsSchema.optional(),

      connector: shapeConnectorSchema.optional(),

      shapeConfig: shapeConfigSchema.optional(),

      style: shapeStyleValidationSchema.optional(),

      parentId: objectIdSchema.nullable().optional(),
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

export const groupShapesValidationSchema = z.object({
  canvasId: objectIdSchema,
  shapeIds: z
    .array(objectIdSchema)
    .min(2, "Grouping requires at least 2 shapes.")
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Duplicate shape IDs are not allowed in grouping.",
    }),
  expectedVersions: z.record(z.string(), z.number().int().min(1)).optional(),
});

export const ungroupShapeValidationSchema = z.object({
  canvasId: objectIdSchema,
  groupId: objectIdSchema,
  expectedVersion: z.number().int().min(1).optional(),
});
