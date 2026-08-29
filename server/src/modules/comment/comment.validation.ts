import { z } from "zod";

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format.");

/**
 * 2D Canvas coordinate validation schema. Coordinates must be finite numbers.
 */
export const positionSchema = z.object({
  x: z.number().refine((val) => Number.isFinite(val), {
    message: "Coordinate x must be a finite number.",
  }),
  y: z.number().refine((val) => Number.isFinite(val), {
    message: "Coordinate y must be a finite number.",
  }),
});

/**
 * HTTP validation schemas
 */
export const createCommentSchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
    canvasId: objectIdSchema.optional(),
  }),
  body: z.object({
    canvasId: objectIdSchema.optional(),
    content: z
      .string()
      .trim()
      .min(1, "Comment content cannot be empty.")
      .max(2000, "Comment content cannot exceed 2000 characters."),
    shapeId: objectIdSchema.nullable().optional(),
    parentCommentId: objectIdSchema.nullable().optional(),
    position: positionSchema.nullable().optional(),
  }),
});

export const createReplySchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
    commentId: objectIdSchema,
  }),
  body: z.object({
    content: z
      .string()
      .trim()
      .min(1, "Comment content cannot be empty.")
      .max(2000, "Comment content cannot exceed 2000 characters."),
    expectedVersion: z.number().int().min(1).optional(),
  }),
});

export const updateCommentSchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
    commentId: objectIdSchema,
  }),
  body: z.object({
    content: z
      .string()
      .trim()
      .min(1, "Comment content cannot be empty.")
      .max(2000, "Comment content cannot exceed 2000 characters."),
    expectedVersion: z.number().int().min(1).optional(),
  }),
});

export const resolveCommentSchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
    commentId: objectIdSchema,
  }),
  body: z.object({
    isResolved: z.boolean(),
    expectedVersion: z.number().int().min(1).optional(),
  }),
});

export const commentParamsSchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
    commentId: objectIdSchema,
  }),
});

export const boardCommentsParamsSchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
  }),
  query: z
    .object({
      canvasId: objectIdSchema.optional(),
      shapeId: objectIdSchema.optional(),
      resolved: z.enum(["true", "false"]).optional(),
    })
    .optional(),
});

export const canvasCommentsParamsSchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
    canvasId: objectIdSchema,
  }),
  query: z
    .object({
      shapeId: objectIdSchema.optional(),
      resolved: z.enum(["true", "false"]).optional(),
    })
    .optional(),
});

/**
 * Socket.IO validation schemas
 */
export const createCommentSocketSchema = z.object({
  boardId: objectIdSchema,
  canvasId: objectIdSchema.optional(),
  mutationId: z.string().uuid("Invalid mutation ID format.").optional(),
  content: z
    .string()
    .trim()
    .min(1, "Comment content cannot be empty.")
    .max(2000, "Comment content cannot exceed 2000 characters."),
  shapeId: objectIdSchema.nullable().optional(),
  parentCommentId: objectIdSchema.nullable().optional(),
  position: positionSchema.nullable().optional(),
});

export const updateCommentSocketSchema = z.object({
  boardId: objectIdSchema,
  commentId: objectIdSchema,
  mutationId: z.string().uuid("Invalid mutation ID format.").optional(),
  expectedVersion: z.number().int().min(1).optional(),
  content: z
    .string()
    .trim()
    .min(1, "Comment content cannot be empty.")
    .max(2000, "Comment content cannot exceed 2000 characters."),
});

export const resolveCommentSocketSchema = z.object({
  boardId: objectIdSchema,
  commentId: objectIdSchema,
  mutationId: z.string().uuid("Invalid mutation ID format.").optional(),
  expectedVersion: z.number().int().min(1).optional(),
  isResolved: z.boolean(),
});

export const deleteCommentSocketSchema = z.object({
  boardId: objectIdSchema,
  commentId: objectIdSchema,
  mutationId: z.string().uuid("Invalid mutation ID format.").optional(),
  expectedVersion: z.number().int().min(1).optional(),
});
