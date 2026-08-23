import { z } from "zod";
import { PRESENCE_ACTIVITIES } from "../presence/presence.types";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid boardId format.");

export const presenceHeartbeatSchema = z.object({
  boardId: objectIdSchema,
});

export const presenceCursorSchema = z.object({
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

export const presenceActivitySchema = z.object({
  boardId: objectIdSchema,
  activity: z.enum([
    "idle",
    "cursor",
    "selecting",
    "moving",
    "resizing",
    "editing-text",
    "commenting",
  ] as const, {
    message:
      "Invalid activity. Supported: idle, cursor, selecting, moving, resizing, editing-text, commenting.",
  }),
});

export const presenceSnapshotSchema = z.object({
  boardId: objectIdSchema,
});

export type ValidatedPresenceHeartbeat = z.infer<typeof presenceHeartbeatSchema>;
export type ValidatedPresenceCursor = z.infer<typeof presenceCursorSchema>;
export type ValidatedPresenceActivity = z.infer<typeof presenceActivitySchema>;
export type ValidatedPresenceSnapshot = z.infer<typeof presenceSnapshotSchema>;
