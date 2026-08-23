import { ClientSession, Types } from "mongoose";

import { boardService } from "@/modules/board";
import { shapeService } from "@/modules/shape";
import { workspaceRepository } from "@/modules/workspace/workspace.repository";
import { workspaceMemberRepository } from "@/modules/workspace/workspaceMember.repository";
import { WorkspaceRole } from "@/modules/workspace/workspace.types";
import { ApiError } from "@/shared/utils";
import { HttpStatus } from "@/shared/constants";

import { commentRepository } from "./comment.repository";
import {
  CreateCommentDto,
  UpdateCommentDto,
  ResolveCommentDto,
  CommentFilterDto,
} from "./comment.dto";
import { CommentDocument } from "./comment.types";

export class CommentService {
  /**
   * Creates a new canvas-level comment, shape-attached comment, or thread reply.
   */
  async createComment(
    authorId: Types.ObjectId,
    dto: CreateCommentDto,
    session?: ClientSession
  ): Promise<{ comment: CommentDocument; boardId: Types.ObjectId }> {
    // 1. Authorize board access
    await boardService.authorizeBoardAccess(dto.boardId, authorId);

    // 2. Validate shapeId ownership if attached to a shape
    if (dto.shapeId) {
      const belongs = await shapeService.verifyShapesBelongToBoard(dto.boardId, [
        dto.shapeId,
      ]);
      if (!belongs) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "The specified shape does not belong to this board."
        );
      }
    }

    // 3. Validate parent comment if this is a reply
    let effectiveShapeId = dto.shapeId ?? null;

    if (dto.parentCommentId) {
      const parent = await commentRepository.findById(dto.parentCommentId);

      if (!parent) {
        throw new ApiError(HttpStatus.NOT_FOUND, "Parent comment not found.");
      }

      if (!parent.boardId.equals(dto.boardId)) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Parent comment belongs to a different board."
        );
      }

      if (parent.parentCommentId) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Replies can only be attached to top-level comments (1-level limit)."
        );
      }

      if (parent.deletedAt) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Cannot reply to a deleted comment."
        );
      }

      // Inherit parent's shape association if not explicitly overridden
      if (!effectiveShapeId && parent.shapeId) {
        effectiveShapeId = parent.shapeId;
      }
    }

    // 4. Authoritative persistence
    const created = await commentRepository.create(
      {
        boardId: dto.boardId,
        shapeId: effectiveShapeId,
        authorId,
        parentCommentId: dto.parentCommentId ?? null,
        content: dto.content,
        isResolved: false,
        isEdited: false,
      },
      session
    );

    // 5. Populate author info for response DTO
    const populated = await commentRepository.findById(created._id, session);

    return {
      comment: populated ?? created,
      boardId: dto.boardId,
    };
  }

  /**
   * Retrieves all comments for a board matching optional filters.
   */
  async getBoardComments(
    boardId: Types.ObjectId,
    userId: Types.ObjectId,
    filter?: CommentFilterDto
  ): Promise<CommentDocument[]> {
    await boardService.authorizeBoardAccess(boardId, userId);
    return commentRepository.findByBoardId(boardId, filter);
  }

  /**
   * Retrieves a single comment by ID after verifying board authorization.
   */
  async getCommentById(
    commentId: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<CommentDocument> {
    const comment = await commentRepository.findById(commentId);

    if (!comment) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found.");
    }

    await boardService.authorizeBoardAccess(comment.boardId, userId);
    return comment;
  }

  /**
   * Updates comment content. Only the author may edit their comment.
   */
  async updateComment(
    commentId: Types.ObjectId,
    userId: Types.ObjectId,
    dto: UpdateCommentDto,
    session?: ClientSession
  ): Promise<{ comment: CommentDocument; boardId: Types.ObjectId }> {
    const comment = await commentRepository.findById(commentId);

    if (!comment) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found.");
    }

    await boardService.authorizeBoardAccess(comment.boardId, userId);

    if (comment.deletedAt) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Cannot edit a deleted comment."
      );
    }

    // Author ownership check
    const commentAuthorId =
      typeof comment.authorId === "object" && "_id" in (comment.authorId as any)
        ? (comment.authorId as any)._id
        : comment.authorId;

    if (!new Types.ObjectId(commentAuthorId).equals(userId)) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "Only the comment author can edit this comment."
      );
    }

    const updated = await commentRepository.updateById(
      commentId,
      {
        content: dto.content,
        isEdited: true,
      },
      session
    );

    if (!updated) {
      throw new ApiError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Failed to update comment."
      );
    }

    return {
      comment: updated,
      boardId: comment.boardId,
    };
  }

  /**
   * Resolves or unresolves a comment.
   */
  async resolveComment(
    commentId: Types.ObjectId,
    userId: Types.ObjectId,
    dto: ResolveCommentDto,
    session?: ClientSession
  ): Promise<{ comment: CommentDocument; boardId: Types.ObjectId }> {
    const comment = await commentRepository.findById(commentId);

    if (!comment) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found.");
    }

    await boardService.authorizeBoardAccess(comment.boardId, userId);

    if (comment.deletedAt) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Cannot resolve a deleted comment."
      );
    }

    const updated = await commentRepository.updateById(
      commentId,
      {
        isResolved: dto.isResolved,
      },
      session
    );

    if (!updated) {
      throw new ApiError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Failed to resolve comment."
      );
    }

    return {
      comment: updated,
      boardId: comment.boardId,
    };
  }

  /**
   * Soft-deletes a comment. Only the author, board creator, or workspace admin/owner may delete.
   */
  async deleteComment(
    commentId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<{ comment: CommentDocument; boardId: Types.ObjectId }> {
    const comment = await commentRepository.findById(commentId);

    if (!comment) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found.");
    }

    const board = await boardService.authorizeBoardAccess(comment.boardId, userId);

    const commentAuthorId =
      typeof comment.authorId === "object" && "_id" in (comment.authorId as any)
        ? (comment.authorId as any)._id
        : comment.authorId;

    const isAuthor = new Types.ObjectId(commentAuthorId).equals(userId);
    const isBoardCreator = board.createdBy.equals(userId);

    let hasPermission = isAuthor || isBoardCreator;

    if (!hasPermission) {
      const workspace = await workspaceRepository.findById(board.workspaceId);
      if (workspace && workspace.ownerId.equals(userId)) {
        hasPermission = true;
      } else {
        const member = await workspaceMemberRepository.findByWorkspaceAndUser(
          board.workspaceId,
          userId
        );
        if (member && member.role === WorkspaceRole.ADMIN) {
          hasPermission = true;
        }
      }
    }

    if (!hasPermission) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "You do not have permission to delete this comment."
      );
    }

    const deleted = await commentRepository.softDeleteById(commentId, session);

    if (!deleted) {
      throw new ApiError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Failed to delete comment."
      );
    }

    return {
      comment: deleted,
      boardId: comment.boardId,
    };
  }

  /**
   * Decouples comments when a shape is deleted by setting shapeId to null.
   */
  async handleShapeDeleted(shapeId: Types.ObjectId): Promise<void> {
    await commentRepository.nullifyShapeId(shapeId);
  }
}

export const commentService = new CommentService();
