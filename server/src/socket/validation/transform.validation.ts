import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format.");

export const transformingShapeSchema = z.object({
  boardId: objectIdSchema,
  shapeId: objectIdSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive("Width must be greater than 0."),
  height: z.number().finite().positive("Height must be greater than 0."),
  rotation: z.number().finite(),
});

export const transformEndSchema = z.object({
  boardId: objectIdSchema,
  shapeId: objectIdSchema,
});

export type ValidatedTransformingShapePayload = z.infer<
  typeof transformingShapeSchema
>;
export type ValidatedTransformEndPayload = z.infer<typeof transformEndSchema>;
