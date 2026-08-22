import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format.");

export const selectionChangeSchema = z.object({
  boardId: objectIdSchema,
  shapeIds: z
    .array(objectIdSchema)
    .max(100, "Selection cannot exceed 100 shapes.")
    .refine((items) => new Set(items).size === items.length, {
      message: "Duplicate shape IDs are not allowed in selection.",
    }),
});

export type ValidatedSelectionChangePayload = z.infer<
  typeof selectionChangeSchema
>;
