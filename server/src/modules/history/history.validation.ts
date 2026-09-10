import { z } from "zod";

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format.");

/**
 * Validation schema for manual version creation (POST /api/v1/boards/:boardId/versions).
 */
export const createManualVersionSchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Version name cannot be empty.")
        .max(100, "Version name cannot exceed 100 characters.")
        .optional(),
      description: z
        .string()
        .trim()
        .max(500, "Description cannot exceed 500 characters.")
        .optional(),
    })
    .optional(),
});

/**
 * Validation schema for updating version metadata (PATCH /api/v1/boards/:boardId/versions/:versionId).
 */
export const updateVersionMetadataSchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
    versionId: objectIdSchema,
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Version name cannot be empty.")
        .max(100, "Version name cannot exceed 100 characters.")
        .optional(),
      description: z
        .string()
        .trim()
        .max(500, "Description cannot exceed 500 characters.")
        .optional(),
    })
    .refine(
      (data) =>
        data.name !== undefined || data.description !== undefined,
      {
        message:
          "At least one field (name or description) must be provided for update.",
      }
    ),
});

/**
 * Validation schema for endpoints requiring boardId and versionId path parameters.
 */
export const versionParamsSchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
    versionId: objectIdSchema,
  }),
});

/**
 * Validation schema for listing versions (GET /api/v1/boards/:boardId/versions).
 */
export const boardVersionsQuerySchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
  }),
  query: z
    .object({
      trigger: z.enum(["manual", "automatic"]).optional(),
      isNamed: z.enum(["true", "false"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      cursor: z.coerce.number().int().min(1).optional(),
    })
    .optional(),
});
