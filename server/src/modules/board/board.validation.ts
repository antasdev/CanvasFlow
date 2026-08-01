import { z } from "zod";

const boardNameSchema = z
  .string()
  .trim()
  .min(2, "Board name must be at least 2 characters.")
  .max(100, "Board name cannot exceed 100 characters.");

const boardDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Description cannot exceed 500 characters.");

export const createBoardSchema = z.object({
  body: z.object({
    workspaceId: z
      .string()
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "Invalid workspace ID."
      ),

    name: boardNameSchema,

    description: boardDescriptionSchema.optional(),
  }),
});

export const updateBoardSchema = z.object({
  body: z.object({
    name: boardNameSchema.optional(),

    description: boardDescriptionSchema.optional(),

    visibility: z
      .enum(["PRIVATE", "PUBLIC"])
      .optional(),

    isArchived: z
      .boolean()
      .optional(),
  }),
});

export const boardParamsSchema = z.object({
  params: z.object({
    id: z
      .string()
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "Invalid board ID."
      ),
  }),
});

export const workspaceBoardsParamsSchema =
  z.object({
    params: z.object({
      workspaceId: z
        .string()
        .regex(
          /^[0-9a-fA-F]{24}$/,
          "Invalid workspace ID."
        ),
    }),
  });