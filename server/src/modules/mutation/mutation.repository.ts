import mongoose, { ClientSession, Types } from "mongoose";
import { MutationRecordModel } from "./mutation.model";
import {
  IMutationRecord,
  MutationOperation,
  MutationRecordDocument,
} from "./mutation.types";

export class MutationRepository {
  /**
   * Finds a mutation record by its scoped uniqueness key (actorId, boardId, mutationId).
   */
  async findByKey(
    actorId: Types.ObjectId,
    boardId: Types.ObjectId,
    mutationId: string,
    session?: ClientSession
  ): Promise<IMutationRecord | null> {
    return MutationRecordModel.findOne(
      {
        actorId,
        boardId,
        mutationId,
      },
      null,
      session ? { session } : undefined
    ).lean<IMutationRecord>();
  }

  /**
   * Finds a mutation record by actorId and mutationId across any board.
   */
  async findByActorAndMutation(
    actorId: Types.ObjectId,
    mutationId: string,
    session?: ClientSession
  ): Promise<IMutationRecord | null> {
    return MutationRecordModel.findOne(
      {
        actorId,
        mutationId,
      },
      null,
      session ? { session } : undefined
    ).lean<IMutationRecord>();
  }

  /**
   * Attempts to atomically insert a new mutation reservation with status 'processing'.
   * If a duplicate key race occurs (MongoDB error code 11000), it returns the existing record.
   */
  async createReservation(
    actorId: Types.ObjectId,
    boardId: Types.ObjectId,
    mutationId: string,
    operation: MutationOperation,
    requestHash: string,
    leaseDurationMs: number = 30000,
    session?: ClientSession
  ): Promise<{ created: boolean; record: IMutationRecord }> {
    const now = new Date();
    // Default 24h retention TTL for completed/processing records
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    try {
      const doc = new MutationRecordModel({
        actorId,
        boardId,
        mutationId,
        operation,
        requestHash,
        status: "processing",
        createdAt: now,
        expiresAt,
      });

      await doc.save(session ? { session } : undefined);
      return { created: true, record: doc.toObject() as IMutationRecord };
    } catch (err: any) {
      if (err?.code === 11000 || err?.message?.includes("E11000")) {
        const existing = await this.findByKey(actorId, boardId, mutationId, session);
        if (existing) {
          return { created: false, record: existing };
        }
      }
      throw err;
    }
  }

  /**
   * Atomically takes over a stale 'processing' reservation if its processing lease has expired.
   */
  async takeoverStaleReservation(
    actorId: Types.ObjectId,
    boardId: Types.ObjectId,
    mutationId: string,
    requestHash: string,
    leaseDurationMs: number = 30000,
    session?: ClientSession
  ): Promise<IMutationRecord | null> {
    const staleThreshold = new Date(Date.now() - leaseDurationMs);

    const updated = await MutationRecordModel.findOneAndUpdate(
      {
        actorId,
        boardId,
        mutationId,
        status: "processing",
        createdAt: { $lt: staleThreshold },
      },
      {
        $set: {
          requestHash,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      },
      {
        returnDocument: "after",
        session: session ?? undefined,
      }
    ).lean<IMutationRecord>();

    return updated;
  }

  /**
   * Marks a mutation as completed and stores the canonical response and event metadata.
   */
  async markCompleted(
    actorId: Types.ObjectId,
    boardId: Types.ObjectId,
    mutationId: string,
    response: unknown,
    eventId: string,
    revision: number,
    session?: ClientSession
  ): Promise<IMutationRecord | null> {
    const updated = await MutationRecordModel.findOneAndUpdate(
      {
        actorId,
        boardId,
        mutationId,
      },
      {
        $set: {
          status: "completed",
          response,
          eventId,
          revision,
          completedAt: new Date(),
        },
      },
      {
        returnDocument: "after",
        session: session ?? undefined,
      }
    ).lean<IMutationRecord>();

    return updated;
  }

  /**
   * Marks a mutation as failed and records the error details.
   */
  async markFailed(
    actorId: Types.ObjectId,
    boardId: Types.ObjectId,
    mutationId: string,
    error: unknown,
    session?: ClientSession
  ): Promise<IMutationRecord | null> {
    const updated = await MutationRecordModel.findOneAndUpdate(
      {
        actorId,
        boardId,
        mutationId,
      },
      {
        $set: {
          status: "failed",
          error,
          completedAt: new Date(),
        },
      },
      {
        returnDocument: "after",
        session: session ?? undefined,
      }
    ).lean<IMutationRecord>();

    return updated;
  }

  /**
   * Deletes a mutation reservation (e.g. during rollback of an uncommitted session).
   */
  async deleteReservation(
    actorId: Types.ObjectId,
    boardId: Types.ObjectId,
    mutationId: string,
    session?: ClientSession
  ): Promise<boolean> {
    const result = await MutationRecordModel.deleteOne(
      {
        actorId,
        boardId,
        mutationId,
      },
      session ? { session } : undefined
    );

    return (result.deletedCount ?? 0) > 0;
  }
}

export const mutationRepository = new MutationRepository();
