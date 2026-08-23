import { Types } from "mongoose";

import { commentService, CommentMapper } from "@/modules/comment";
import {
  createCommentSocketSchema,
  updateCommentSocketSchema,
  resolveCommentSocketSchema,
  deleteCommentSocketSchema,
} from "@/modules/comment/comment.validation";
import { ApiError } from "@/shared/utils";
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
      try {
        const parsed = createCommentSocketSchema.safeParse(payload);

        if (!parsed.success) {
          const message =
            parsed.error.issues[0]?.message ?? "Invalid comment creation payload.";
          socket.emit(SocketEvents.ERROR, message);
          callback?.({
            success: false,
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
                content: parsed.data.content,
                shapeId: parsed.data.shapeId
                  ? new Types.ObjectId(parsed.data.shapeId)
                  : null,
                parentCommentId: parsed.data.parentCommentId
                  ? new Types.ObjectId(parsed.data.parentCommentId)
                  : null,
              },
              session
            );
          }
        );

        // 3. Transform to canonical response DTO
        const responseDto = CommentMapper.toResponseDto(
          result.comment,
          result.comment.authorId as any
        );

        // 4. Broadcast envelope to other collaborators in the room (excludes sender)
        socket.to(room).emit(SocketEvents.COMMENT_CREATED, {
          meta,
          comment: responseDto,
        });

        // 5. Acknowledge creator with canonical persisted DTO
        callback?.({
          success: true,
          data: responseDto,
        });
      } catch (error) {
        if (error instanceof ApiError) {
          const code =
            error.statusCode === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : error.statusCode === HttpStatus.FORBIDDEN
              ? "FORBIDDEN"
              : "BAD_REQUEST";

          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            error: { code, message: error.message },
          });
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to create comment.";

        socket.emit(SocketEvents.ERROR, message);
        callback?.({
          success: false,
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
      try {
        const parsed = updateCommentSocketSchema.safeParse(payload);

        if (!parsed.success) {
          const message =
            parsed.error.issues[0]?.message ?? "Invalid comment update payload.";
          socket.emit(SocketEvents.ERROR, message);
          callback?.({
            success: false,
            error: { code: "BAD_REQUEST", message },
          });
          return;
        }

        const userId = socket.data.user.userId;
        const commentObjectId = new Types.ObjectId(parsed.data.commentId);
        const boardObjectId = new Types.ObjectId(parsed.data.boardId);

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
              session
            );
          }
        );

        // 3. Transform to canonical response DTO
        const responseDto = CommentMapper.toResponseDto(
          result.comment,
          result.comment.authorId as any
        );

        // 4. Broadcast envelope to other room members (excludes sender)
        socket.to(room).emit(SocketEvents.COMMENT_UPDATED, {
          meta,
          comment: responseDto,
        });

        // 5. Acknowledge sender
        callback?.({
          success: true,
          data: responseDto,
        });
      } catch (error) {
        if (error instanceof ApiError) {
          const code =
            error.statusCode === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : error.statusCode === HttpStatus.FORBIDDEN
              ? "FORBIDDEN"
              : "BAD_REQUEST";

          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            error: { code, message: error.message },
          });
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to update comment.";

        socket.emit(SocketEvents.ERROR, message);
        callback?.({
          success: false,
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
      try {
        const parsed = resolveCommentSocketSchema.safeParse(payload);

        if (!parsed.success) {
          const message =
            parsed.error.issues[0]?.message ?? "Invalid comment resolve payload.";
          socket.emit(SocketEvents.ERROR, message);
          callback?.({
            success: false,
            error: { code: "BAD_REQUEST", message },
          });
          return;
        }

        const userId = socket.data.user.userId;
        const commentObjectId = new Types.ObjectId(parsed.data.commentId);
        const boardObjectId = new Types.ObjectId(parsed.data.boardId);

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
              session
            );
          }
        );

        // 3. Transform to canonical response DTO
        const responseDto = CommentMapper.toResponseDto(
          result.comment,
          result.comment.authorId as any
        );

        // 4. Broadcast envelope to other room members (excludes sender)
        socket.to(room).emit(SocketEvents.COMMENT_RESOLVED, {
          meta,
          comment: responseDto,
        });

        // 5. Acknowledge sender
        callback?.({
          success: true,
          data: responseDto,
        });
      } catch (error) {
        if (error instanceof ApiError) {
          const code =
            error.statusCode === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : error.statusCode === HttpStatus.FORBIDDEN
              ? "FORBIDDEN"
              : "BAD_REQUEST";

          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            error: { code, message: error.message },
          });
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to resolve comment.";

        socket.emit(SocketEvents.ERROR, message);
        callback?.({
          success: false,
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
      try {
        const parsed = deleteCommentSocketSchema.safeParse(payload);

        if (!parsed.success) {
          const message =
            parsed.error.issues[0]?.message ?? "Invalid comment delete payload.";
          socket.emit(SocketEvents.ERROR, message);
          callback?.({
            success: false,
            error: { code: "BAD_REQUEST", message },
          });
          return;
        }

        const userId = socket.data.user.userId;
        const commentObjectId = new Types.ObjectId(parsed.data.commentId);
        const boardObjectId = new Types.ObjectId(parsed.data.boardId);

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
              session
            );
          }
        );

        // 3. Transform to canonical response DTO
        const responseDto = CommentMapper.toResponseDto(
          result.comment,
          result.comment.authorId as any
        );

        // 4. Broadcast deletion envelope to other room members (excludes sender)
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

        // 5. Acknowledge sender
        callback?.({
          success: true,
          data: responseDto,
        });
      } catch (error) {
        if (error instanceof ApiError) {
          const code =
            error.statusCode === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : error.statusCode === HttpStatus.FORBIDDEN
              ? "FORBIDDEN"
              : "BAD_REQUEST";

          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            error: { code, message: error.message },
          });
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to delete comment.";

        socket.emit(SocketEvents.ERROR, message);
        callback?.({
          success: false,
          error: { code: "INTERNAL_ERROR", message },
        });
      }
    }
  );
};
