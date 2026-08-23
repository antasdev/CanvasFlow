import { z } from "zod";

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format.");

/**
 * HTTP validation schemas
 */
export const createCommentSchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
  }),
  body: z.object({
    content: z
      .string()
      .trim()
      .min(1, "Comment content cannot be empty.")
      .max(2000, "Comment content cannot exceed 2000 characters."),
    shapeId: objectIdSchema.nullable().optional(),
    parentCommentId: objectIdSchema.nullable().optional(),
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
  }),
});

export const resolveCommentSchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
    commentId: objectIdSchema,
  }),
  body: z.object({
    isResolved: z.boolean(),
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
  content: z
    .string()
    .trim()
    .min(1, "Comment content cannot be empty.")
    .max(2000, "Comment content cannot exceed 2000 characters."),
  shapeId: objectIdSchema.nullable().optional(),
  parentCommentId: objectIdSchema.nullable().optional(),
});

export const updateCommentSocketSchema = z.object({
  boardId: objectIdSchema,
  commentId: objectIdSchema,
  content: z
    .string()
    .trim()
    .min(1, "Comment content cannot be empty.")
    .max(2000, "Comment content cannot exceed 2000 characters."),
});

export const resolveCommentSocketSchema = z.object({
  boardId: objectIdSchema,
  commentId: objectIdSchema,
  isResolved: z.boolean(),
});

export const deleteCommentSocketSchema = z.object({
  boardId: objectIdSchema,
  commentId: objectIdSchema,
});
