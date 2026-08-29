import { Types } from "mongoose";

import { commentService, CommentMapper } from "@/modules/comment";
import { mutationRepository, generateMutationHash } from "@/modules/mutation";
import {
  createCommentSocketSchema,
  updateCommentSocketSchema,
  resolveCommentSocketSchema,
  deleteCommentSocketSchema,
} from "@/modules/comment/comment.validation";
import { ApiError, ConflictError } from "@/shared/utils";
import { HttpStatus } from "@/shared/constants";

import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";
import { collaborationVersionService } from "../services/collaboration-version.service";
import {
  AuthSocket,
  CommentResponseDto,
  CreateCommentPayload,
  DeleteCommentPayload,
  ResolveCommentPayload,
  SocketAck,
  UpdateCommentPayload,
} from "../socket.types";

/**
 * Registers real-time collaborative comment event handlers on an authenticated socket.
 */
export const registerCommentHandlers = (socket: AuthSocket): void => {
  /**
   * Handle comment:create
   */
  socket.on(
    SocketEvents.COMMENT_CREATE,
    async (
      payload: CreateCommentPayload,
      callback?: (response: SocketAck<CommentResponseDto>) => void
    ) => {
      const fallbackMutationId = typeof payload?.mutationId === "string" ? payload.mutationId : undefined;
      try {
        const parsed = createCommentSocketSchema.safeParse(payload);

        if (!parsed.success) {
          const message =
            parsed.error.issues[0]?.message ?? "Invalid comment creation payload.";
          socket.emit(SocketEvents.ERROR, message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code: "BAD_REQUEST", message },
          });
          return;
        }

        const userId = socket.data.user.userId;
        const boardObjectId = new Types.ObjectId(parsed.data.boardId);

        // 1. Verify socket is joined to the board room
        const room = getBoardRoom(parsed.data.boardId);
        if (!socket.rooms.has(room)) {
          throw new ApiError(
            HttpStatus.FORBIDDEN,
            "You must join the board room before creating comments."
          );
        }

        // 2. Authoritative persistence via CommentService & atomic revision increment
        const { result, meta } = await collaborationVersionService.executeWithRevision(
          boardObjectId,
          userId,
          socket.id,
          async (session) => {
            return commentService.createComment(
              userId,
              {
                boardId: boardObjectId,
                canvasId: parsed.data.canvasId
                  ? new Types.ObjectId(parsed.data.canvasId)
                  : undefined,
                content: parsed.data.content,
                shapeId: parsed.data.shapeId
                  ? new Types.ObjectId(parsed.data.shapeId)
                  : null,
                parentCommentId: parsed.data.parentCommentId
                  ? new Types.ObjectId(parsed.data.parentCommentId)
                  : null,
                position: parsed.data.position
                  ? {
                      x: parsed.data.position.x,
                      y: parsed.data.position.y,
                    }
                  : null,
              },
              session
            );
          },
          parsed.data.mutationId,
          "comment:create",
          parsed.data
        );

        // 3. Transform to canonical response DTO
        const responseDto = (result as any)?.comment
          ? CommentMapper.toResponseDto(
              (result as any).comment,
              (result as any).comment.authorId as any
            )
          : (result as unknown as CommentResponseDto);

        // 4. Broadcast envelope to other collaborators in the room (excludes sender, omitted on replay)
        if (!meta.isIdempotentReplay) {
          socket.to(room).emit(SocketEvents.COMMENT_CREATED, {
            meta,
            comment: responseDto,
          });
        }

        // 5. Acknowledge creator with canonical persisted DTO & mutationId
        callback?.({
          success: true,
          mutationId: parsed.data.mutationId,
          data: responseDto,
        });
      } catch (error) {
        if (error instanceof ApiError) {
          const code =
            error.code ??
            (error.statusCode === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : error.statusCode === HttpStatus.FORBIDDEN
              ? "FORBIDDEN"
              : error.statusCode === HttpStatus.CONFLICT
              ? "CONFLICT"
              : "BAD_REQUEST");

          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code, message: error.message },
          });
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to create comment.";

        socket.emit(SocketEvents.ERROR, message);
        callback?.({
          success: false,
          mutationId: fallbackMutationId,
          error: { code: "INTERNAL_ERROR", message },
        });
      }
    }
  );

  /**
   * Handle comment:update
   */
  socket.on(
    SocketEvents.COMMENT_UPDATE,
    async (
      payload: UpdateCommentPayload,
      callback?: (response: SocketAck<CommentResponseDto>) => void
    ) => {
      const fallbackMutationId = typeof payload?.mutationId === "string" ? payload.mutationId : undefined;
      try {
        const parsed = updateCommentSocketSchema.safeParse(payload);

        if (!parsed.success) {
          const message =
            parsed.error.issues[0]?.message ?? "Invalid comment update payload.";
          socket.emit(SocketEvents.ERROR, message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code: "BAD_REQUEST", message },
          });
          return;
        }

        const userId = socket.data.user.userId;
        const commentObjectId = new Types.ObjectId(parsed.data.commentId);
        const boardObjectId = new Types.ObjectId(parsed.data.boardId);

        // Pre-check idempotency record for completed or in-progress duplicate requests
        if (parsed.data.mutationId) {
          const existingRecord = await mutationRepository.findByActorAndMutation(
            userId,
            parsed.data.mutationId
          );
          if (existingRecord) {
            const expectedHash = generateMutationHash({
              operation: "comment:update",
              boardId: existingRecord.boardId,
              mutationId: parsed.data.mutationId,
              actorId: userId,
              payload: parsed.data,
            });

            if (existingRecord.requestHash !== expectedHash) {
              callback?.({
                success: false,
                mutationId: parsed.data.mutationId,
                error: {
                  code: "IDEMPOTENCY_KEY_REUSED",
                  message: "Idempotency key reused with different payload.",
                },
              });
              return;
            }

            if (existingRecord.status === "completed") {
              const responseDto = (existingRecord.response as any)?.comment
                ? CommentMapper.toResponseDto(
                    (existingRecord.response as any).comment,
                    (existingRecord.response as any).comment.authorId as any
                  )
                : (existingRecord.response as CommentResponseDto);

              callback?.({
                success: true,
                mutationId: parsed.data.mutationId,
                data: responseDto,
              });
              return;
            }

            if (existingRecord.status === "processing") {
              const isStale =
                Date.now() - new Date(existingRecord.createdAt).getTime() > 30000;
              if (!isStale) {
                callback?.({
                  success: false,
                  mutationId: parsed.data.mutationId,
                  error: {
                    code: "MUTATION_IN_PROGRESS",
                    message: "Mutation is currently in progress.",
                  },
                });
                return;
              }
            }
          }
        }

        // 1. Verify socket is joined to the board room
        const room = getBoardRoom(parsed.data.boardId);
        if (!socket.rooms.has(room)) {
          throw new ApiError(
            HttpStatus.FORBIDDEN,
            "You must join the board room before updating comments."
          );
        }

        // 2. Authoritative update via CommentService & atomic revision increment
        const { result, meta } = await collaborationVersionService.executeWithRevision(
          boardObjectId,
          userId,
          socket.id,
          async (session) => {
            return commentService.updateComment(
              commentObjectId,
              userId,
              {
                content: parsed.data.content,
              },
              session,
              parsed.data.expectedVersion
            );
          },
          parsed.data.mutationId,
          "comment:update",
          parsed.data
        );

        // 3. Transform to canonical response DTO
        const responseDto = (result as any)?.comment
          ? CommentMapper.toResponseDto(
              (result as any).comment,
              (result as any).comment.authorId as any
            )
          : (result as unknown as CommentResponseDto);

        // 4. Broadcast envelope to other room members (excludes sender, omitted on replay)
        if (!meta.isIdempotentReplay) {
          socket.to(room).emit(SocketEvents.COMMENT_UPDATED, {
            meta,
            comment: responseDto,
          });
        }

        // 5. Acknowledge sender with mutationId
        callback?.({
          success: true,
          mutationId: parsed.data.mutationId,
          data: responseDto,
        });
      } catch (error) {
        if (error instanceof ConflictError) {
          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: {
              code: "CONFLICT",
              message: error.message,
              resourceType: error.resourceType,
              resourceId: error.resourceId,
              currentVersion: error.currentVersion,
            },
          });
          return;
        }

        if (error instanceof ApiError) {
          const code =
            error.code ??
            (error.statusCode === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : error.statusCode === HttpStatus.FORBIDDEN
              ? "FORBIDDEN"
              : error.statusCode === HttpStatus.CONFLICT
              ? "CONFLICT"
              : "BAD_REQUEST");

          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code, message: error.message },
          });
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to update comment.";

        socket.emit(SocketEvents.ERROR, message);
        callback?.({
          success: false,
          mutationId: fallbackMutationId,
          error: { code: "INTERNAL_ERROR", message },
        });
      }
    }
  );

  /**
   * Handle comment:resolve
   */
  socket.on(
    SocketEvents.COMMENT_RESOLVE,
    async (
      payload: ResolveCommentPayload,
      callback?: (response: SocketAck<CommentResponseDto>) => void
    ) => {
      const fallbackMutationId = typeof payload?.mutationId === "string" ? payload.mutationId : undefined;
      try {
        const parsed = resolveCommentSocketSchema.safeParse(payload);

        if (!parsed.success) {
          const message =
            parsed.error.issues[0]?.message ?? "Invalid comment resolve payload.";
          socket.emit(SocketEvents.ERROR, message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code: "BAD_REQUEST", message },
          });
          return;
        }

        const userId = socket.data.user.userId;
        const commentObjectId = new Types.ObjectId(parsed.data.commentId);
        const boardObjectId = new Types.ObjectId(parsed.data.boardId);

        // Pre-check idempotency record for completed or in-progress duplicate requests
        if (parsed.data.mutationId) {
          const existingRecord = await mutationRepository.findByActorAndMutation(
            userId,
            parsed.data.mutationId
          );
          if (existingRecord) {
            const expectedHash = generateMutationHash({
              operation: "comment:resolve",
              boardId: existingRecord.boardId,
              mutationId: parsed.data.mutationId,
              actorId: userId,
              payload: parsed.data,
            });

            if (existingRecord.requestHash !== expectedHash) {
              callback?.({
                success: false,
                mutationId: parsed.data.mutationId,
                error: {
                  code: "IDEMPOTENCY_KEY_REUSED",
                  message: "Idempotency key reused with different payload.",
                },
              });
              return;
            }

            if (existingRecord.status === "completed") {
              const responseDto = (existingRecord.response as any)?.comment
                ? CommentMapper.toResponseDto(
                    (existingRecord.response as any).comment,
                    (existingRecord.response as any).comment.authorId as any
                  )
                : (existingRecord.response as CommentResponseDto);

              callback?.({
                success: true,
                mutationId: parsed.data.mutationId,
                data: responseDto,
              });
              return;
            }

            if (existingRecord.status === "processing") {
              const isStale =
                Date.now() - new Date(existingRecord.createdAt).getTime() > 30000;
              if (!isStale) {
                callback?.({
                  success: false,
                  mutationId: parsed.data.mutationId,
                  error: {
                    code: "MUTATION_IN_PROGRESS",
                    message: "Mutation is currently in progress.",
                  },
                });
                return;
              }
            }
          }
        }

        // 1. Verify socket is joined to the board room
        const room = getBoardRoom(parsed.data.boardId);
        if (!socket.rooms.has(room)) {
          throw new ApiError(
            HttpStatus.FORBIDDEN,
            "You must join the board room before resolving comments."
          );
        }

        // 2. Authoritative resolution via CommentService & atomic revision increment
        const { result, meta } = await collaborationVersionService.executeWithRevision(
          boardObjectId,
          userId,
          socket.id,
          async (session) => {
            return commentService.resolveComment(
              commentObjectId,
              userId,
              {
                isResolved: parsed.data.isResolved,
              },
              session,
              parsed.data.expectedVersion
            );
          },
          parsed.data.mutationId,
          "comment:resolve",
          parsed.data
        );

        // 3. Transform to canonical response DTO
        const responseDto = (result as any)?.comment
          ? CommentMapper.toResponseDto(
              (result as any).comment,
              (result as any).comment.authorId as any
            )
          : (result as unknown as CommentResponseDto);

        // 4. Broadcast envelope to other room members (excludes sender, omitted on replay)
        if (!meta.isIdempotentReplay) {
          socket.to(room).emit(SocketEvents.COMMENT_RESOLVED, {
            meta,
            comment: responseDto,
          });
        }

        // 5. Acknowledge sender with mutationId
        callback?.({
          success: true,
          mutationId: parsed.data.mutationId,
          data: responseDto,
        });
      } catch (error) {
        if (error instanceof ConflictError) {
          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: {
              code: "CONFLICT",
              message: error.message,
              resourceType: error.resourceType,
              resourceId: error.resourceId,
              currentVersion: error.currentVersion,
            },
          });
          return;
        }

        if (error instanceof ApiError) {
          const code =
            error.code ??
            (error.statusCode === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : error.statusCode === HttpStatus.FORBIDDEN
              ? "FORBIDDEN"
              : error.statusCode === HttpStatus.CONFLICT
              ? "CONFLICT"
              : "BAD_REQUEST");

          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code, message: error.message },
          });
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to resolve comment.";

        socket.emit(SocketEvents.ERROR, message);
        callback?.({
          success: false,
          mutationId: fallbackMutationId,
          error: { code: "INTERNAL_ERROR", message },
        });
      }
    }
  );

  /**
   * Handle comment:delete
   */
  socket.on(
    SocketEvents.COMMENT_DELETE,
    async (
      payload: DeleteCommentPayload,
      callback?: (response: SocketAck<CommentResponseDto>) => void
    ) => {
      const fallbackMutationId = typeof payload?.mutationId === "string" ? payload.mutationId : undefined;
      try {
        const parsed = deleteCommentSocketSchema.safeParse(payload);

        if (!parsed.success) {
          const message =
            parsed.error.issues[0]?.message ?? "Invalid comment delete payload.";
          socket.emit(SocketEvents.ERROR, message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code: "BAD_REQUEST", message },
          });
          return;
        }

        const userId = socket.data.user.userId;
        const commentObjectId = new Types.ObjectId(parsed.data.commentId);
        const boardObjectId = new Types.ObjectId(parsed.data.boardId);

        // Pre-check idempotency record for completed or in-progress duplicate requests
        if (parsed.data.mutationId) {
          const existingRecord = await mutationRepository.findByActorAndMutation(
            userId,
            parsed.data.mutationId
          );
          if (existingRecord) {
            const expectedHash = generateMutationHash({
              operation: "comment:delete",
              boardId: existingRecord.boardId,
              mutationId: parsed.data.mutationId,
              actorId: userId,
              payload: parsed.data,
            });

            if (existingRecord.requestHash !== expectedHash) {
              callback?.({
                success: false,
                mutationId: parsed.data.mutationId,
                error: {
                  code: "IDEMPOTENCY_KEY_REUSED",
                  message: "Idempotency key reused with different payload.",
                },
              });
              return;
            }

            if (existingRecord.status === "completed") {
              const responseDto = (existingRecord.response as any)?.comment
                ? CommentMapper.toResponseDto(
                    (existingRecord.response as any).comment,
                    (existingRecord.response as any).comment.authorId as any
                  )
                : (existingRecord.response as CommentResponseDto);

              callback?.({
                success: true,
                mutationId: parsed.data.mutationId,
                data: responseDto,
              });
              return;
            }

            if (existingRecord.status === "processing") {
              const isStale =
                Date.now() - new Date(existingRecord.createdAt).getTime() > 30000;
              if (!isStale) {
                callback?.({
                  success: false,
                  mutationId: parsed.data.mutationId,
                  error: {
                    code: "MUTATION_IN_PROGRESS",
                    message: "Mutation is currently in progress.",
                  },
                });
                return;
              }
            }
          }
        }

        // 1. Verify socket is joined to the board room
        const room = getBoardRoom(parsed.data.boardId);
        if (!socket.rooms.has(room)) {
          throw new ApiError(
            HttpStatus.FORBIDDEN,
            "You must join the board room before deleting comments."
          );
        }

        // 2. Authoritative soft deletion via CommentService & atomic revision increment
        const { result, meta } = await collaborationVersionService.executeWithRevision(
          boardObjectId,
          userId,
          socket.id,
          async (session) => {
            return commentService.deleteComment(
              commentObjectId,
              userId,
              session,
              parsed.data.expectedVersion
            );
          },
          parsed.data.mutationId,
          "comment:delete",
          parsed.data
        );

        // 3. Transform to canonical response DTO
        const responseDto = (result as any)?.comment
          ? CommentMapper.toResponseDto(
              (result as any).comment,
              (result as any).comment.authorId as any
            )
          : (result as unknown as CommentResponseDto);

        // 4. Broadcast deletion envelope to other room members (excludes sender, omitted on replay)
        if (!meta.isIdempotentReplay) {
          socket.to(room).emit(SocketEvents.COMMENT_DELETED, {
            meta,
            boardId: parsed.data.boardId,
            commentId: parsed.data.commentId,
            comment: responseDto,
          });

          // Also broadcast comment:updated with masked soft-deleted payload
          socket.to(room).emit(SocketEvents.COMMENT_UPDATED, {
            meta,
            comment: responseDto,
          });
        }

        // 5. Acknowledge sender with mutationId
        callback?.({
          success: true,
          mutationId: parsed.data.mutationId,
          data: responseDto,
        });
      } catch (error) {
        if (error instanceof ConflictError) {
          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: {
              code: "CONFLICT",
              message: error.message,
              resourceType: error.resourceType,
              resourceId: error.resourceId,
              currentVersion: error.currentVersion,
            },
          });
          return;
        }

        if (error instanceof ApiError) {
          const code =
            error.code ??
            (error.statusCode === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : error.statusCode === HttpStatus.FORBIDDEN
              ? "FORBIDDEN"
              : error.statusCode === HttpStatus.CONFLICT
              ? "CONFLICT"
              : "BAD_REQUEST");

          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code, message: error.message },
          });
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to delete comment.";

        socket.emit(SocketEvents.ERROR, message);
        callback?.({
          success: false,
          mutationId: fallbackMutationId,
          error: { code: "INTERNAL_ERROR", message },
        });
      }
    }
  );
};
