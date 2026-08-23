import crypto from "crypto";
import mongoose, { Types } from "mongoose";

import { boardRepository } from "@/modules/board/board.repository";
import { CollaborationEventMeta } from "../socket.types";
import { ApiError } from "@/shared/utils";
import { HttpStatus } from "@/shared/constants";

/**
 * Collaboration Version Service (Slice 11)
 *
 * Manages atomic MongoDB revision increments and server-side metadata generation
 * for all authoritative collaboration mutations.
 */
export class CollaborationVersionService {
  /**
   * Executes an authoritative mutation callback and atomically increments the board's
   * collaboration revision within a single database transaction.
   *
   * If transactions are not supported by the current MongoDB deployment topology (e.g. standalone test server),
   * it falls back gracefully to sequential execution without session.
   */
  async executeWithRevision<T>(
    boardId: Types.ObjectId,
    actorId: Types.ObjectId | string,
    socketId: string,
    mutationFn: (session?: mongoose.ClientSession) => Promise<T>,
    mutationId?: string
  ): Promise<{ result: T; meta: CollaborationEventMeta }> {
    const maxRetries = 5;
    let attempt = 0;

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
            updatedBoard = await boardRepository.incrementCollaborationRevision(boardId, session);
            if (!updatedBoard) {
              throw new ApiError(HttpStatus.NOT_FOUND, "Board not found during revision increment.");
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
              // Retry on concurrent transaction write conflict
              await new Promise((resolve) => setTimeout(resolve, Math.random() * 30 + 10));
              continue;
            }

            // If transaction failed due to standalone topology, retry without transaction
            if (
              error?.message?.includes("Transaction numbers are only allowed on a replica set member or mongos") ||
              error?.message?.includes("Transactions are not supported")
            ) {
              result = await mutationFn();
              updatedBoard = await boardRepository.incrementCollaborationRevision(boardId);
              if (!updatedBoard) {
                throw new ApiError(HttpStatus.NOT_FOUND, "Board not found during revision increment.");
              }
            } else {
              throw error;
            }
          }

          const meta: CollaborationEventMeta = {
            eventId: crypto.randomUUID(),
            mutationId: mutationId ?? undefined,
            boardId: boardId.toString(),
            actorId: actorId.toString(),
            socketId,
            revision: updatedBoard.collaborationRevision ?? 1,
            occurredAt: new Date().toISOString(),
          };

          return { result, meta };
        } else {
          const result = await mutationFn();
          const updatedBoard = await boardRepository.incrementCollaborationRevision(boardId);
          if (!updatedBoard) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Board not found during revision increment.");
          }

          const meta: CollaborationEventMeta = {
            eventId: crypto.randomUUID(),
            mutationId: mutationId ?? undefined,
            boardId: boardId.toString(),
            actorId: actorId.toString(),
            socketId,
            revision: updatedBoard.collaborationRevision ?? 1,
            occurredAt: new Date().toISOString(),
          };

          return { result, meta };
        }
      } finally {
        if (session) {
          await session.endSession();
        }
      }
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
