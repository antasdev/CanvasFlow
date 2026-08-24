import crypto from "crypto";
import { Types } from "mongoose";
import { MutationOperation } from "./mutation.types";

/**
 * Ephemeral fields that must be stripped during mutation hashing
 * to ensure that identical retries across different sockets or connection epochs
 * evaluate to the exact same hash.
 */
const EPHEMERAL_KEYS = new Set([
  "socketId",
  "occurredAt",
  "connectionEpoch",
]);

/**
 * Deeply canonicalizes an arbitrary value by recursively sorting object keys.
 * Arrays retain their exact indexed order.
 */
export function canonicalizeValue(val: unknown): unknown {
  if (val === null || val === undefined) {
    return null;
  }

  if (val instanceof Types.ObjectId) {
    return val.toString();
  }

  if (val instanceof Date) {
    return val.toISOString();
  }

  if (Array.isArray(val)) {
    return val.map((item) => canonicalizeValue(item));
  }

  if (typeof val === "object") {
    const sortedObj: Record<string, unknown> = {};
    const keys = Object.keys(val as Record<string, unknown>).sort();

    for (const key of keys) {
      if (EPHEMERAL_KEYS.has(key)) {
        continue;
      }
      const item = (val as Record<string, unknown>)[key];
      if (item !== undefined) {
        sortedObj[key] = canonicalizeValue(item);
      }
    }
    return sortedObj;
  }

  return val;
}

export interface GenerateMutationHashInput {
  operation: MutationOperation;
  boardId: string | Types.ObjectId;
  mutationId: string;
  actorId: string | Types.ObjectId;
  payload: unknown;
}

/**
 * Generates a deterministic SHA-256 hash representing the semantic intent of a mutation.
 */
export function generateMutationHash(input: GenerateMutationHashInput): string {
  const canonicalPayload = canonicalizeValue(input.payload);

  const payloadString = JSON.stringify({
    operation: input.operation,
    boardId: input.boardId.toString(),
    mutationId: input.mutationId,
    actorId: input.actorId.toString(),
    payload: canonicalPayload,
  });

  return crypto.createHash("sha256").update(payloadString).digest("hex");
}
