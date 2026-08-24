/**
 * Collaborative Interaction Domain Types (Slice 16)
 *
 * Ephemeral interaction state represents what a collaborator is actively doing right now
 * (e.g. selecting, moving, resizing, rotating, editing text, commenting).
 *
 * Invariant: Interaction state is strictly in-memory and transient. It NEVER writes to MongoDB,
 * NEVER increments collaborationRevision or entity.version, and NEVER creates mutation records.
 */

export type InteractionType =
  | "selecting"
  | "moving"
  | "resizing"
  | "rotating"
  | "editing-text"
  | "commenting";

export const INTERACTION_TYPES: readonly InteractionType[] = [
  "selecting",
  "moving",
  "resizing",
  "rotating",
  "editing-text",
  "commenting",
] as const;

export type InteractionTargetType = "shape" | "comment";

export const INTERACTION_TARGET_TYPES: readonly InteractionTargetType[] = [
  "shape",
  "comment",
] as const;

export interface InteractionTarget {
  type: InteractionTargetType;
  id: string;
}

export interface CollaborativeInteraction {
  interactionId: string;
  socketId: string;
  userId: string;
  boardId: string;
  type: InteractionType;
  targets: InteractionTarget[];
  startedAt: string;
  updatedAt: string;
  data?: Record<string, unknown>;
}

export interface InteractionConflict {
  code: "INTERACTION_CONFLICT";
  resourceType: InteractionTargetType;
  resourceId: string;
  ownerUserId: string;
  interactionType: InteractionType;
}

export interface StartInteractionResult {
  success: boolean;
  interaction?: CollaborativeInteraction;
  conflict?: InteractionConflict;
}

export interface UpdateInteractionResult {
  success: boolean;
  interaction?: CollaborativeInteraction;
  error?: {
    code: string;
    message: string;
  };
}

export interface EndInteractionResult {
  success: boolean;
  interaction?: CollaborativeInteraction;
  error?: {
    code: string;
    message: string;
  };
}

// -------------------------------------------------------------
// Socket Event Payloads & Acks
// -------------------------------------------------------------

export interface InteractionStartPayload {
  boardId: string;
  type: InteractionType;
  targets: InteractionTarget[];
  data?: Record<string, unknown>;
}

export interface InteractionStartAckData {
  interactionId: string;
  startedAt: string;
}

export interface InteractionUpdatePayload {
  boardId: string;
  interactionId: string;
  targets?: InteractionTarget[];
  data?: Record<string, unknown>;
}

export interface InteractionEndPayload {
  boardId: string;
  interactionId: string;
}

export interface InteractionSnapshotPayload {
  boardId: string;
}

export interface InteractionBroadcastPayload {
  boardId: string;
  interaction: CollaborativeInteraction;
}

export interface InteractionEndBroadcastPayload {
  boardId: string;
  interactionId: string;
  userId: string;
  type: InteractionType;
  targets: InteractionTarget[];
}
