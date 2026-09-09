import { z } from "zod";

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format.");

export const getNotificationsSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z
      .string()
      .regex(/^\d+$/, "Limit must be a valid number.")
      .transform(Number)
      .optional()
      .refine((val) => val === undefined || (val >= 1 && val <= 50), {
        message: "Limit must be between 1 and 50.",
      }),
    unreadOnly: z
      .enum(["true", "false"])
      .transform((val) => val === "true")
      .optional(),
  }),
});

export const markAsReadSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});
