import { z } from "zod";
import {
  CompositeCursorPayload,
  EntityCursor,
  SearchCursorFilter,
  SearchCursorPayloadV1,
  SearchEntityType,
} from "./search.types";

const VALID_ENTITY_TYPES: readonly SearchEntityType[] = [
  "board",
  "canvas",
  "shape",
  "comment",
] as const;

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format.");

export const isValidObjectId = (id: string): boolean => {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * Escapes regex special characters to prevent regex injection attacks.
 */
export const escapeRegex = (input: string): string => {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Encodes a legacy V1 cursor (timestamp + id) into an opaque Base64URL string.
 */
export const encodeCursor = (date: Date, id: string): string => {
  const payload: SearchCursorPayloadV1 = {
    timestamp: date.getTime(),
    id,
  };
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
};

/**
 * Encodes a V2 composite cursor into an opaque Base64URL string.
 */
export const encodeV2Cursor = (payload: CompositeCursorPayload): string => {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
};

const isValidEntityCursor = (
  record: Record<string, unknown>
): record is Record<string, unknown> & { t: number; id: string } => {
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes("t") || !keys.includes("id")) {
    return false;
  }
  const t = record.t;
  if (
    typeof t !== "number" ||
    !Number.isFinite(t) ||
    Number.isNaN(t) ||
    t < 0 ||
    !Number.isInteger(t)
  ) {
    return false;
  }
  const date = new Date(t);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const id = record.id;
  if (typeof id !== "string" || !isValidObjectId(id)) {
    return false;
  }
  return true;
};

/**
 * Decodes and validates an opaque base64url cursor string.
 * Supports V2 composite cursors and backwards-compatible V1 cursors.
 * Returns null if the cursor is malformed or invalid.
 */
export const decodeCursor = (cursor: string): SearchCursorFilter | null => {
  try {
    if (typeof cursor !== "string" || cursor.trim().length === 0) {
      return null;
    }
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;

    // Case 1: V2 Composite Cursor
    if (record.v === 2) {
      const allowedKeys = new Set(["v", "b", "c", "s", "m"]);
      const keys = Object.keys(record);
      for (const k of keys) {
        if (!allowedKeys.has(k)) {
          return null;
        }
      }

      const entityKeys = ["b", "c", "s", "m"] as const;
      let hasAtLeastOneEntity = false;
      const v2Payload: CompositeCursorPayload = { v: 2 };

      for (const ek of entityKeys) {
        if (record[ek] !== undefined) {
          const val = record[ek];
          if (typeof val !== "object" || val === null || Array.isArray(val)) {
            return null;
          }
          if (!isValidEntityCursor(val as Record<string, unknown>)) {
            return null;
          }
          v2Payload[ek] = {
            t: (val as Record<string, unknown>).t as number,
            id: (val as Record<string, unknown>).id as string,
          };
          hasAtLeastOneEntity = true;
        }
      }

      if (!hasAtLeastOneEntity) {
        return null;
      }

      return {
        version: 2,
        v2: v2Payload,
      };
    }

    // Case 2: Legacy V1 Cursor ({ timestamp, id })
    if (record.v === undefined) {
      const keys = Object.keys(record);
      if (keys.length !== 2 || !keys.includes("timestamp") || !keys.includes("id")) {
        return null;
      }

      const ts = record.timestamp;
      if (
        typeof ts !== "number" ||
        !Number.isFinite(ts) ||
        Number.isNaN(ts) ||
        ts < 0 ||
        !Number.isInteger(ts)
      ) {
        return null;
      }

      const date = new Date(ts);
      if (Number.isNaN(date.getTime())) {
        return null;
      }

      const id = record.id;
      if (typeof id !== "string" || !isValidObjectId(id)) {
        return null;
      }

      return {
        version: 1,
        v1: {
          timestamp: ts,
          id,
        },
      };
    }

    return null;
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
