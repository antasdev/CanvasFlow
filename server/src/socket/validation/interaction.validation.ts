import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format.");

const uuidSchema = z
  .string()
  .uuid("Invalid interactionId UUID format.");

export const interactionTargetSchema = z.object({
  type: z.enum(["shape", "comment"] as const, {
    message: "Invalid target type. Supported: shape, comment.",
  }),
  id: objectIdSchema,
});

export const interactionStartSchema = z.object({
  boardId: objectIdSchema,
  type: z.enum([
    "selecting",
    "moving",
    "resizing",
    "rotating",
    "editing-text",
    "commenting",
  ] as const, {
    message:
      "Invalid interaction type. Supported: selecting, moving, resizing, rotating, editing-text, commenting.",
  }),
  targets: z
    .array(interactionTargetSchema)
    .min(1, "At least one target is required.")
    .max(50, "Maximum of 50 targets allowed per interaction."),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const interactionUpdateSchema = z.object({
  boardId: objectIdSchema,
  interactionId: uuidSchema,
  targets: z
    .array(interactionTargetSchema)
    .max(50, "Maximum of 50 targets allowed per interaction.")
    .optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const interactionEndSchema = z.object({
  boardId: objectIdSchema,
  interactionId: uuidSchema,
});

export const interactionSnapshotSchema = z.object({
  boardId: objectIdSchema,
});
