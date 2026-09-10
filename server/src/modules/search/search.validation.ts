import { z } from "zod";
import { SearchCursorPayload, SearchEntityType } from "./search.types";

const VALID_ENTITY_TYPES: readonly SearchEntityType[] = [
  "board",
  "canvas",
  "shape",
  "comment",
] as const;

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format.");

/**
 * Escapes regex special characters to prevent regex injection attacks.
 */
export const escapeRegex = (input: string): string => {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Encodes a timestamp and an ObjectId into an opaque base64 cursor string.
 */
export const encodeCursor = (date: Date, id: string): string => {
  const payload: SearchCursorPayload = {
    timestamp: date.getTime(),
    id,
  };
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
};

/**
 * Decodes and validates an opaque base64 cursor string.
 * Returns null if the cursor is malformed or invalid.
 */
export const decodeCursor = (
  cursor: string
): { timestamp: Date; id: string } | null => {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed: { timestamp?: number; id?: string } = JSON.parse(raw);

    if (
      typeof parsed.timestamp !== "number" ||
      !Number.isFinite(parsed.timestamp) ||
      typeof parsed.id !== "string" ||
      !/^[0-9a-fA-F]{24}$/.test(parsed.id)
    ) {
      return null;
    }

    const date = new Date(parsed.timestamp);
    if (isNaN(date.getTime())) {
      return null;
    }

    return {
      timestamp: date,
      id: parsed.id,
    };
  } catch {
    return null;
  }
};

/**
 * Parses a comma-separated or array representation of entity types.
 */
const entityTypesSchema = z
  .union([
    z.string().transform((val) =>
      val
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is SearchEntityType =>
          VALID_ENTITY_TYPES.includes(s as SearchEntityType)
        )
    ),
    z.array(z.enum(["board", "canvas", "shape", "comment"])),
  ])
  .optional();

/**
 * Zod validation schema for GET /api/v1/search.
 */
export const searchQuerySchema = z.object({
  query: z
    .object({
      q: z
        .string()
        .trim()
        .min(1, "Search query must contain at least 1 non-whitespace character.")
        .max(100, "Search query cannot exceed 100 characters."),
      scope: z.enum(["workspace", "board"], {
        message: "Scope must be either 'workspace' or 'board'.",
      }),
      workspaceId: objectIdSchema.optional(),
      boardId: objectIdSchema.optional(),
      types: entityTypesSchema,
      limit: z
        .coerce.number()
        .int("Limit must be an integer.")
        .min(1, "Limit must be at least 1.")
        .max(50, "Limit cannot exceed 50.")
        .default(20),
      cursor: z
        .string()
        .trim()
        .refine(
          (val) => decodeCursor(val) !== null,
          "Cursor format is invalid."
        )
        .optional(),
    })
    .refine(
      (data) => {
        if (data.scope === "workspace") {
          return !!data.workspaceId;
        }
        if (data.scope === "board") {
          return !!data.boardId;
        }
        return false;
      },
      {
        message:
          "When scope is 'workspace', workspaceId is required. When scope is 'board', boardId is required.",
      }
    ),
});
