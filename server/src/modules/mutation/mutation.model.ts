import { Schema, model } from "mongoose";
import { IMutationRecord, MutationRecordDocument } from "./mutation.types";

const mutationRecordSchema = new Schema<IMutationRecord>(
  {
    mutationId: {
      type: String,
      required: [true, "Mutation ID is required."],
      trim: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Actor ID is required."],
    },
    boardId: {
      type: Schema.Types.ObjectId,
      ref: "Board",
      required: [true, "Board ID is required."],
    },
    operation: {
      type: String,
      enum: [
        "shape:create",
        "shape:update",
        "shape:delete",
        "shape:group",
        "shape:ungroup",
        "comment:create",
        "comment:update",
        "comment:resolve",
        "comment:delete",
      ],
      required: [true, "Mutation operation is required."],
    },
    requestHash: {
      type: String,
      required: [true, "Request hash is required."],
      trim: true,
    },
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
      required: true,
    },
    response: {
      type: Schema.Types.Mixed,
      default: null,
    },
    error: {
      type: Schema.Types.Mixed,
      default: null,
    },
    eventId: {
      type: String,
      trim: true,
    },
    revision: {
      type: Number,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    completedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiration timestamp is required."],
    },
  },
  {
    versionKey: false,
  }
);

// Compound unique index ensuring at-most-once execution per (actor, board, mutationId)
mutationRecordSchema.index(
  {
    actorId: 1,
    boardId: 1,
    mutationId: 1,
  },
  {
    unique: true,
  }
);

// MongoDB TTL index: automatically purges documents when expiresAt timestamp has passed
mutationRecordSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

mutationRecordSchema.index({ status: 1 });
mutationRecordSchema.index({ createdAt: 1 });

export const MutationRecordModel = model<IMutationRecord>(
  "MutationRecord",
  mutationRecordSchema,
  "mutation_records"
);
