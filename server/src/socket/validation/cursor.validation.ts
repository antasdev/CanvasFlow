import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid boardId format.");

export const cursorMoveSchema = z.object({
  boardId: objectIdSchema,
  x: z
    .number()
    .finite("x must be a finite number.")
    .min(-1000000, "x is out of canvas coordinate bounds.")
    .max(1000000, "x is out of canvas coordinate bounds."),
  y: z
    .number()
    .finite("y must be a finite number.")
    .min(-1000000, "y is out of canvas coordinate bounds.")
    .max(1000000, "y is out of canvas coordinate bounds."),
});

export type ValidatedCursorMovePayload = z.infer<typeof cursorMoveSchema>;
