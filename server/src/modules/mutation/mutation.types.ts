import { Document, Types } from "mongoose";

export type MutationOperation =
  | "shape:create"
  | "shape:update"
  | "shape:delete"
  | "shape:group"
  | "shape:ungroup"
  | "comment:create"
  | "comment:update"
  | "comment:resolve"
  | "comment:delete";

export type MutationStatus = "processing" | "completed" | "failed";

export interface IMutationRecord {
  _id: Types.ObjectId;
  mutationId: string;
  actorId: Types.ObjectId;
  boardId: Types.ObjectId;
  operation: MutationOperation;
  requestHash: string;
  status: MutationStatus;
  response?: unknown;
  error?: unknown;
  eventId?: string;
  revision?: number;
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date;
}

export type MutationRecordDocument = Document<Types.ObjectId, object, IMutationRecord> &
  IMutationRecord;

export type MutationReservationResult =
  | {
      status: "reserved";
      record: IMutationRecord;
    }
  | {
      status: "completed";
      record: IMutationRecord;
    }
  | {
      status: "processing";
      record: IMutationRecord;
    }
  | {
      status: "hash-mismatch";
      record: IMutationRecord;
    };
