import crypto from "crypto";
import mongoose, { Types } from "mongoose";

import { boardRepository } from "@/modules/board/board.repository";
import { mutationService, MutationOperation } from "@/modules/mutation";
import { CollaborationEventMeta } from "../socket.types";
import { ApiError } from "@/shared/utils";
import { HttpStatus } from "@/shared/constants";

/**
 * Collaboration Version Service (Slice 11 & Slice 14)
 *
 * Manages atomic MongoDB revision increments, mutation idempotency reservations,
 * and server-side metadata generation for all authoritative collaboration mutations.
 */
export class CollaborationVersionService {
  /**
   * Executes an authoritative mutation callback, manages at-most-once idempotency reservation,
   * and atomically increments the board's collaboration revision within a single database transaction.
   */
  async executeWithRevision<T>(
    boardId: Types.ObjectId,
    actorId: Types.ObjectId | string,
    socketId: string,
    mutationFn: (session?: mongoose.ClientSession) => Promise<T>,
    mutationId?: string,
    operation?: MutationOperation,
    payload?: unknown
  ): Promise<{ result: T; meta: CollaborationEventMeta }> {
    const actorObjectId =
      typeof actorId === "string" ? new Types.ObjectId(actorId) : actorId;

    // 1. Check Idempotency Reservation when mutationId & operation are provided
    if (mutationId && operation) {
      const reservation = await mutationService.prepareReservation(
        actorObjectId,
        boardId,
        mutationId,
        operation,
        payload
      );

      if (reservation.status === "hash-mismatch") {
        throw new ApiError(
          HttpStatus.CONFLICT,
          "Idempotency key reused with different payload.",
          "IDEMPOTENCY_KEY_REUSED"
        );
      }

      if (reservation.status === "processing") {
        throw new ApiError(
          HttpStatus.CONFLICT,
          "Mutation is currently in progress.",
          "MUTATION_IN_PROGRESS"
        );
      }

      if (reservation.status === "completed") {
        // Return stored canonical result and original event metadata without re-executing
        const meta: CollaborationEventMeta = {
          eventId: reservation.record.eventId ?? crypto.randomUUID(),
          mutationId,
          boardId: boardId.toString(),
          actorId: actorObjectId.toString(),
          socketId,
          revision: reservation.record.revision ?? 1,
          occurredAt:
            reservation.record.completedAt?.toISOString() ??
            reservation.record.createdAt.toISOString(),
          isIdempotentReplay: true,
        };

        return { result: reservation.record.response as T, meta };
      }
    }

    // 2. Execute new mutation transaction
    const maxRetries = 5;
    let attempt = 0;
    const eventId = crypto.randomUUID();

    while (attempt < maxRetries) {
      attempt++;
      let session: mongoose.ClientSession | null = null;
      let useTransaction = false;

      try {
        session = await mongoose.startSession();
        session.startTransaction();
        useTransaction = true;
      } catch {
        // Standalone MongoDB without replica set
        session = null;
        useTransaction = false;
      }

      try {
        if (useTransaction && session) {
          let result: T;
          let updatedBoard;

          try {
            result = await mutationFn(session);
            updatedBoard = await boardRepository.incrementCollaborationRevision(
              boardId,
              session
            );
            if (!updatedBoard) {
              throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Board not found during revision increment."
              );
            }

            if (mutationId) {
              await mutationService.completeMutation(
                actorObjectId,
                boardId,
                mutationId,
                result,
                eventId,
                updatedBoard.collaborationRevision ?? 1,
                session
              );
            }

            await session.commitTransaction();
          } catch (error: any) {
            if (session.inTransaction()) {
              await session.abortTransaction();
            }

            const isWriteConflict =
              error?.hasErrorLabel?.("TransientTransactionError") ||
              error?.hasErrorLabel?.("UnknownTransactionCommitResult") ||
              error?.message?.includes("Write conflict") ||
              error?.message?.includes("WriteConflict");

            if (isWriteConflict && attempt < maxRetries) {
              await new Promise((resolve) =>
                setTimeout(resolve, Math.random() * 30 + 10)
              );
              continue;
            }

            // Standalone fallback
            if (
              error?.message?.includes(
                "Transaction numbers are only allowed on a replica set member or mongos"
              ) ||
              error?.message?.includes("Transactions are not supported")
            ) {
              result = await mutationFn();
              updatedBoard =
                await boardRepository.incrementCollaborationRevision(boardId);
              if (!updatedBoard) {
                throw new ApiError(
                  HttpStatus.NOT_FOUND,
                  "Board not found during revision increment."
                );
              }

              if (mutationId) {
                await mutationService.completeMutation(
                  actorObjectId,
                  boardId,
                  mutationId,
                  result,
                  eventId,
                  updatedBoard.collaborationRevision ?? 1
                );
              }
            } else {
              if (mutationId) {
                await mutationService.failMutation(
                  actorObjectId,
                  boardId,
                  mutationId,
                  error?.message ?? "Mutation failed"
                );
              }
              throw error;
            }
          }

          const meta: CollaborationEventMeta = {
            eventId,
            mutationId: mutationId ?? undefined,
            boardId: boardId.toString(),
            actorId: actorObjectId.toString(),
            socketId,
            revision: updatedBoard.collaborationRevision ?? 1,
            occurredAt: new Date().toISOString(),
            isIdempotentReplay: false,
          };

          return { result, meta };
        } else {
          try {
            const result = await mutationFn();
            const updatedBoard =
              await boardRepository.incrementCollaborationRevision(boardId);
            if (!updatedBoard) {
              throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Board not found during revision increment."
              );
            }

            if (mutationId) {
              await mutationService.completeMutation(
                actorObjectId,
                boardId,
                mutationId,
                result,
                eventId,
                updatedBoard.collaborationRevision ?? 1
              );
            }

            const meta: CollaborationEventMeta = {
              eventId,
              mutationId: mutationId ?? undefined,
              boardId: boardId.toString(),
              actorId: actorObjectId.toString(),
              socketId,
              revision: updatedBoard.collaborationRevision ?? 1,
              occurredAt: new Date().toISOString(),
              isIdempotentReplay: false,
            };

            return { result, meta };
          } catch (error: any) {
            if (mutationId) {
              await mutationService.failMutation(
                actorObjectId,
                boardId,
                mutationId,
                error?.message ?? "Mutation failed"
              );
            }
            throw error;
          }
        }
      } finally {
        if (session) {
          await session.endSession();
        }
      }
    }

    if (mutationId) {
      await mutationService.failMutation(
        actorObjectId,
        boardId,
        mutationId,
        "Failed to execute authoritative mutation after multiple transaction retry attempts."
      );
    }

    throw new ApiError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "Failed to execute authoritative mutation after multiple transaction retry attempts."
    );
  }

  /**
   * Retrieves the current authoritative collaboration revision of a board.
   */
  async getBoardRevision(boardId: Types.ObjectId): Promise<number> {
    const board = await boardRepository.findById(boardId);
    return board?.collaborationRevision ?? 0;
  }
}

export const collaborationVersionService = new CollaborationVersionService();
