import { ClientSession, Types } from "mongoose";
import { generateMutationHash } from "./mutation-hash";
import { mutationRepository } from "./mutation.repository";
import {
  IMutationRecord,
  MutationOperation,
  MutationReservationResult,
} from "./mutation.types";

export class MutationService {
  /**
   * Prepares and reserves a mutation for execution, or determines if an existing
   * mutation record satisfies the request or indicates a conflict/mismatch.
   */
  async prepareReservation(
    actorId: Types.ObjectId,
    boardId: Types.ObjectId,
    mutationId: string,
    operation: MutationOperation,
    payload: unknown,
    leaseDurationMs: number = 30000,
    session?: ClientSession
  ): Promise<MutationReservationResult> {
    const requestHash = generateMutationHash({
      operation,
      boardId,
      mutationId,
      actorId,
      payload,
    });

    // 1. Check existing record
    const existing = await mutationRepository.findByKey(
      actorId,
      boardId,
      mutationId,
      session
    );

    if (existing) {
      return this.evaluateExistingRecord(
        existing,
        requestHash,
        actorId,
        boardId,
        mutationId,
        leaseDurationMs,
        session
      );
    }

    // 2. Attempt atomic reservation insertion
    const { created, record } = await mutationRepository.createReservation(
      actorId,
      boardId,
      mutationId,
      operation,
      requestHash,
      leaseDurationMs,
      session
    );

    if (created) {
      return {
        status: "reserved",
        record,
      };
    }

    // Handled duplicate-key insertion race
    return this.evaluateExistingRecord(
      record,
      requestHash,
      actorId,
      boardId,
      mutationId,
      leaseDurationMs,
      session
    );
  }

  private async evaluateExistingRecord(
    record: IMutationRecord,
    requestHash: string,
    actorId: Types.ObjectId,
    boardId: Types.ObjectId,
    mutationId: string,
    leaseDurationMs: number,
    session?: ClientSession
  ): Promise<MutationReservationResult> {
    // Check if mutation ID was reused with a different payload
    if (record.requestHash !== requestHash) {
      return {
        status: "hash-mismatch",
        record,
      };
    }

    if (record.status === "completed") {
      return {
        status: "completed",
        record,
      };
    }

    if (record.status === "processing") {
      const isStale =
        Date.now() - new Date(record.createdAt).getTime() > leaseDurationMs;

      if (isStale) {
        // Attempt atomic takeover of stale crashed reservation
        const takenOver = await mutationRepository.takeoverStaleReservation(
          actorId,
          boardId,
          mutationId,
          requestHash,
          leaseDurationMs,
          session
        );

        if (takenOver) {
          return {
            status: "reserved",
            record: takenOver,
          };
        }
      }

      return {
        status: "processing",
        record,
      };
    }

    // If previously failed, allow retry by updating processing record
    const retryReservation = await mutationRepository.takeoverStaleReservation(
      actorId,
      boardId,
      mutationId,
      requestHash,
      leaseDurationMs,
      session
    );

    if (retryReservation) {
      return {
        status: "reserved",
        record: retryReservation,
      };
    }

    return {
      status: "processing",
      record,
    };
  }

  /**
   * Completes a mutation and persists its canonical response and event envelope.
   */
  async completeMutation(
    actorId: Types.ObjectId,
    boardId: Types.ObjectId,
    mutationId: string,
    response: unknown,
    eventId: string,
    revision: number,
    session?: ClientSession
  ): Promise<IMutationRecord | null> {
    return mutationRepository.markCompleted(
      actorId,
      boardId,
      mutationId,
      response,
      eventId,
      revision,
      session
    );
  }

  /**
   * Marks a mutation as failed.
   */
  async failMutation(
    actorId: Types.ObjectId,
    boardId: Types.ObjectId,
    mutationId: string,
    error: unknown,
    session?: ClientSession
  ): Promise<IMutationRecord | null> {
    return mutationRepository.markFailed(
      actorId,
      boardId,
      mutationId,
      error,
      session
    );
  }

  /**
   * Deletes a mutation reservation.
   */
  async deleteReservation(
    actorId: Types.ObjectId,
    boardId: Types.ObjectId,
    mutationId: string,
    session?: ClientSession
  ): Promise<boolean> {
    return mutationRepository.deleteReservation(
      actorId,
      boardId,
      mutationId,
      session
    );
  }
}

export const mutationService = new MutationService();
