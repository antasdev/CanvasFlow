import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format.");

export const lockShapeSchema = z.object({
  boardId: objectIdSchema,
  shapeId: objectIdSchema,
});

export const unlockShapeSchema = z.object({
  boardId: objectIdSchema,
  shapeId: objectIdSchema,
});

export const refreshShapeLockSchema = z.object({
  boardId: objectIdSchema,
  shapeId: objectIdSchema,
});

export type ValidatedLockShapePayload = z.infer<typeof lockShapeSchema>;
export type ValidatedUnlockShapePayload = z.infer<typeof unlockShapeSchema>;
export type ValidatedRefreshShapeLockPayload = z.infer<typeof refreshShapeLockSchema>;
