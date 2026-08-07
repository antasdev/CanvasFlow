import { z } from "zod";

export const createBoardSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Board name is required")
    .max(100, "Board name must be 100 characters or less"),

  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or less")
    .optional(),
});

export const updateBoardSchema = createBoardSchema.partial();

export type CreateBoardFormValues = z.infer<
  typeof createBoardSchema
>;

export type UpdateBoardFormValues = z.infer<
  typeof updateBoardSchema
>;