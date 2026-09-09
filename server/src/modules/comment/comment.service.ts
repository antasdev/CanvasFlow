import { ClientSession, Types } from "mongoose";

import { boardService } from "@/modules/board";
import { canvasRepository } from "@/modules/canvas/canvas.repository";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { UserModel } from "@/modules/user/user.model";
import { workspaceRepository } from "@/modules/workspace/workspace.repository";
import { workspaceMemberRepository } from "@/modules/workspace/workspaceMember.repository";
import { WorkspaceRole } from "@/modules/workspace/workspace.types";
import {
  WorkspacePermission,
  assertWorkspacePermission,
} from "@/modules/workspace/workspace.authorization";
import { notificationService } from "@/modules/notification";
import { ApiError, ConflictError } from "@/shared/utils";
import { HttpStatus } from "@/shared/constants";

import { commentRepository } from "./comment.repository";
import {
  CreateCommentDto,
  CreateReplyDto,
  UpdateCommentDto,
  ResolveCommentDto,
  CommentFilterDto,
  CommentMentionDto,
} from "./comment.dto";
import {
  CommentDocument,
  CommentMention,
  UpdateCommentData,
} from "./comment.types";

export class CommentService {
  /**
   * Validates and normalizes structured mention metadata against the target workspace and content.
   * Rejects mutations if any mention is invalid, out of bounds, non-member, or malformed.
   */
  async resolveAndValidateMentions(
    workspaceId: Types.ObjectId,
    content: string,
    submittedMentions?: CommentMentionDto[],
    session?: ClientSession
  ): Promise<CommentMention[]> {
    if (!submittedMentions || submittedMentions.length === 0) {
      return [];
    }

    // 1. Sort mentions by startIndex to verify range integrity and non-overlapping invariant
    const sorted = [...submittedMentions].sort(
      (a, b) => a.startIndex - b.startIndex
    );

    const canonicalMentions: CommentMention[] = [];

    const workspace = await workspaceRepository.findById(workspaceId);
    if (!workspace) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        "Workspace associated with comment not found."
      );
    }

    for (let i = 0; i < sorted.length; i++) {
      const mention = sorted[i];

      // A. Validate index boundaries
      if (
        typeof mention.startIndex !== "number" ||
        typeof mention.endIndex !== "number" ||
        mention.startIndex < 0 ||
        mention.endIndex <= mention.startIndex ||
        mention.endIndex > content.length
      ) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          `Invalid mention range: indices [${mention.startIndex}, ${mention.endIndex}] are out of bounds for content length ${content.length}.`
        );
      }

      // B. Ensure ranges do not overlap
      if (i > 0) {
        const prev = sorted[i - 1];
        if (mention.startIndex < prev.endIndex) {
          throw new ApiError(
            HttpStatus.BAD_REQUEST,
            "Invalid mention ranges: overlapping mention tokens are not permitted."
          );
        }
      }

      // C. Validate content slice begins with '@'
      const mentionSlice = content.slice(mention.startIndex, mention.endIndex);
      if (!mentionSlice.startsWith("@")) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          `Invalid mention range: content slice "${mentionSlice}" must begin with '@'.`
        );
      }

      // D. Validate user ID format
      if (!Types.ObjectId.isValid(mention.userId)) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          `Invalid user ID format for mention: ${mention.userId}.`
        );
      }

      const targetUserId = new Types.ObjectId(mention.userId);

      // E. Verify workspace membership (owner or member)
      const isOwner = workspace.ownerId.equals(targetUserId);
      const member = isOwner
        ? true
        : await workspaceMemberRepository.findByWorkspaceAndUser(
            workspaceId,
            targetUserId
          );

      if (!isOwner && !member) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          `Mentioned user ${mention.userId} is not a member of this workspace.`
        );
      }

      // F. Verify user existence & active status
      const user = await UserModel.findById(targetUserId, null, { session });
      if (!user) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          `Mentioned user ${mention.userId} was not found.`
        );
      }

      const canonicalDisplayName = user.fullName || mention.displayName;

      canonicalMentions.push({
        userId: targetUserId,
        displayName: canonicalDisplayName,
        startIndex: mention.startIndex,
        endIndex: mention.endIndex,
      });
    }

    return canonicalMentions;
  }

  /**
   * Creates a new canvas-level comment, shape-attached comment, or thread reply.
   */
  async createComment(
    authorId: Types.ObjectId,
    dto: CreateCommentDto,
    session?: ClientSession
  ): Promise<{ comment: CommentDocument; boardId: Types.ObjectId }> {
    // 1. Resolve workspace role & authorize board access + ADD_COMMENT permission
    const { board, role } = await boardService.resolveUserWorkspaceRole(
      dto.boardId,
      authorId
    );

    let effectiveRole = role;
    if (!effectiveRole && board.createdBy.equals(authorId)) {
      effectiveRole = WorkspaceRole.EDITOR;
    }

    if (!effectiveRole) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "You do not have permission to comment on this board."
      );
    }

    assertWorkspacePermission(
      effectiveRole,
      WorkspacePermission.ADD_COMMENT,
      "You do not have permission to comment on this board."
    );

    // 2. Validate or resolve canvasId
    let effectiveCanvasId: Types.ObjectId | null = dto.canvasId ?? null;

    if (dto.canvasId) {
      const canvas = await canvasRepository.findById(dto.canvasId, session);
      if (!canvas || !canvas.boardId.equals(dto.boardId)) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "The specified canvas does not belong to this board."
        );
      }
    } else if (!dto.parentCommentId) {
      const defaultCanvas = await CanvasModel.findOne(
        { boardId: dto.boardId },
        null,
        { session }
      ).sort({ order: 1 });
      if (!defaultCanvas) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "The board does not have an active canvas."
        );
      }
      effectiveCanvasId = defaultCanvas._id;
    }

    // 3. Validate parent comment if this is a reply
    let effectiveShapeId = dto.shapeId ?? null;
    let effectivePosition = dto.position ?? null;

    if (dto.parentCommentId) {
      const parent = await commentRepository.findById(
        dto.parentCommentId,
        session
      );

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

      // Reply inherits spatial and canvas context from root comment
      effectiveCanvasId = parent.canvasId;
      effectiveShapeId = parent.shapeId ?? null;
      effectivePosition = parent.position ?? null;
    } else {
      // Root comment: default position if neither shapeId nor position provided
      if (!dto.shapeId && !effectivePosition) {
        effectivePosition = { x: 0, y: 0 };
      }

      // Validate shape if provided
      if (dto.shapeId) {
        const shape = await ShapeModel.findById(dto.shapeId, null, { session });
        if (
          !shape ||
          (effectiveCanvasId && !shape.canvasId.equals(effectiveCanvasId))
        ) {
          throw new ApiError(
            HttpStatus.BAD_REQUEST,
            "The specified shape does not belong to this canvas."
          );
        }
      }
    }

    // 4. Resolve & validate mentions
    const canonicalMentions = await this.resolveAndValidateMentions(
      board.workspaceId,
      dto.content,
      dto.mentions,
      session
    );

    // 5. Authoritative persistence
    const created = await commentRepository.create(
      {
        boardId: dto.boardId,
        canvasId: effectiveCanvasId!,
        shapeId: effectiveShapeId,
        authorId,
        parentCommentId: dto.parentCommentId ?? null,
        position: effectivePosition,
        content: dto.content,
        mentions: canonicalMentions,
        isResolved: false,
        isEdited: false,
        version: 1,
      },
      session
    );

    // 6. Return populated comment
    const populated = await commentRepository.findById(created._id, session);

    // 7. Dispatch Notifications (asynchronous domain boundary)
    const mentionedUserIds = canonicalMentions.map((m) => m.userId.toString());

    if (dto.parentCommentId) {
      // Thread Reply Notification
      await notificationService.dispatchReplyNotification({
        workspaceId: board.workspaceId,
        boardId: dto.boardId,
        canvasId: effectiveCanvasId!,
        replyCommentId: created._id,
        parentCommentId: dto.parentCommentId,
        authorId,
        content: dto.content,
        mentionedUserIds,
        session,
      });
    }

    if (canonicalMentions.length > 0) {
      // Mention Notification
      await notificationService.dispatchMentionNotifications({
        workspaceId: board.workspaceId,
        boardId: dto.boardId,
        canvasId: effectiveCanvasId!,
        commentId: created._id,
        parentCommentId: dto.parentCommentId ?? null,
        authorId,
        mentions: canonicalMentions,
        content: dto.content,
        session,
      });
    }

    return {
      comment: populated ?? created,
      boardId: dto.boardId,
    };
  }

  /**
   * Creates a reply to an existing top-level comment thread.
   */
  async createReply(
    authorId: Types.ObjectId,
    boardId: Types.ObjectId,
    parentCommentId: Types.ObjectId,
    dto: CreateReplyDto,
    session?: ClientSession
  ): Promise<{ comment: CommentDocument; boardId: Types.ObjectId }> {
    const parent = await commentRepository.findById(parentCommentId, session);

    if (!parent) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Parent comment not found.");
    }

    if (!parent.boardId.equals(boardId)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Parent comment belongs to a different board."
      );
    }

    return this.createComment(
      authorId,
      {
        boardId,
        canvasId: parent.canvasId,
        parentCommentId,
        content: dto.content,
        mentions: dto.mentions,
      },
      session
    );
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
   * Retrieves all comments for a specific canvas page of a board.
   */
  async getCanvasComments(
    boardId: Types.ObjectId,
    canvasId: Types.ObjectId,
    userId: Types.ObjectId,
    filter?: CommentFilterDto
  ): Promise<CommentDocument[]> {
    await boardService.authorizeBoardAccess(boardId, userId);

    const canvas = await canvasRepository.findById(canvasId);
    if (!canvas || !canvas.boardId.equals(boardId)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "The specified canvas does not belong to this board."
      );
    }

    return commentRepository.findByCanvasId(boardId, canvasId, filter);
  }

  /**
   * Counts unresolved comments per shape on a specific canvas.
   */
  async countUnresolvedByShape(
    boardId: Types.ObjectId,
    canvasId: Types.ObjectId,
    userId: Types.ObjectId,
    shapeIds: Types.ObjectId[]
  ): Promise<Record<string, number>> {
    await boardService.authorizeBoardAccess(boardId, userId);

    const canvas = await canvasRepository.findById(canvasId);
    if (!canvas || !canvas.boardId.equals(boardId)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "The specified canvas does not belong to this board."
      );
    }

    return commentRepository.countUnresolvedByShape(
      boardId,
      canvasId,
      shapeIds
    );
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
    session?: ClientSession,
    expectedVersion?: number
  ): Promise<{ comment: CommentDocument; boardId: Types.ObjectId }> {
    const comment = await commentRepository.findById(commentId, session);

    if (!comment) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found.");
    }

    const { board } = await boardService.resolveUserWorkspaceRole(
      comment.boardId,
      userId
    );

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

    // Resolve & validate updated mentions against target workspace
    const canonicalMentions = await this.resolveAndValidateMentions(
      board.workspaceId,
      dto.content,
      dto.mentions,
      session
    );

    const effectiveExpectedVersion = expectedVersion ?? dto.expectedVersion;
    let updated: CommentDocument | null = null;

    const updateData: UpdateCommentData = {
      content: dto.content,
      mentions: canonicalMentions,
      isEdited: true,
    };

    if (effectiveExpectedVersion !== undefined) {
      updated = await commentRepository.updateWithExpectedVersion(
        commentId,
        effectiveExpectedVersion,
        updateData,
        session
      );

      if (!updated) {
        const existing = await commentRepository.findById(commentId, session);
        if (!existing) {
          throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found.");
        }
        throw new ConflictError(
          "comment",
          commentId.toString(),
          existing.version,
          "Comment has been modified by another collaborator."
        );
      }
    } else {
      updated = await commentRepository.updateById(
        commentId,
        updateData,
        session
      );

      if (!updated) {
        throw new ApiError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Failed to update comment."
        );
      }
    }

    // Dispatch Mention Notifications for newly added mentions
    if (canonicalMentions.length > 0) {
      await notificationService.dispatchMentionNotifications({
        workspaceId: board.workspaceId,
        boardId: comment.boardId,
        canvasId: comment.canvasId,
        commentId: updated._id,
        authorId: userId,
        mentions: canonicalMentions,
        previousMentions: comment.mentions ?? [],
        content: dto.content,
        parentCommentId: comment.parentCommentId,
        session,
      });
    }

    return {
      comment: updated,
      boardId: comment.boardId,
    };
  }

  /**
   * Resolves or unresolves a comment thread.
   * Allowed for OWNER, ADMIN, EDITOR, or the thread author.
   */
  async resolveComment(
    commentId: Types.ObjectId,
    userId: Types.ObjectId,
    dto: ResolveCommentDto,
    session?: ClientSession,
    expectedVersion?: number
  ): Promise<{ comment: CommentDocument; boardId: Types.ObjectId }> {
    const comment = await commentRepository.findById(commentId, session);

    if (!comment) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found.");
    }

    if (comment.deletedAt) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Cannot resolve a deleted comment."
      );
    }

    const { board, role } = await boardService.resolveUserWorkspaceRole(
      comment.boardId,
      userId
    );

    let effectiveRole = role;
    if (!effectiveRole && board.createdBy.equals(userId)) {
      effectiveRole = WorkspaceRole.EDITOR;
    }

    const commentAuthorId =
      typeof comment.authorId === "object" && "_id" in (comment.authorId as any)
        ? (comment.authorId as any)._id
        : comment.authorId;

    const isAuthor = new Types.ObjectId(commentAuthorId).equals(userId);
    const canResolve =
      isAuthor ||
      effectiveRole === WorkspaceRole.OWNER ||
      effectiveRole === WorkspaceRole.ADMIN ||
      effectiveRole === WorkspaceRole.EDITOR;

    if (!canResolve) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "You do not have permission to resolve this comment."
      );
    }

    const effectiveExpectedVersion = expectedVersion ?? dto.expectedVersion;
    const updateData: UpdateCommentData = {
      isResolved: dto.isResolved,
      resolvedAt: dto.isResolved ? new Date() : null,
      resolvedBy: dto.isResolved ? userId : null,
    };

    let updated: CommentDocument | null = null;

    if (effectiveExpectedVersion !== undefined) {
      updated = await commentRepository.updateWithExpectedVersion(
        commentId,
        effectiveExpectedVersion,
        updateData,
        session
      );

      if (!updated) {
        const existing = await commentRepository.findById(commentId, session);
        if (!existing) {
          throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found.");
        }
        throw new ConflictError(
          "comment",
          commentId.toString(),
          existing.version,
          "Comment has been modified by another collaborator."
        );
      }
    } else {
      updated = await commentRepository.updateById(
        commentId,
        updateData,
        session
      );

      if (!updated) {
        throw new ApiError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Failed to resolve comment."
        );
      }
    }

    // Dispatch Thread Activity Notification if resolution state changed
    if (comment.isResolved !== dto.isResolved) {
      await notificationService.dispatchThreadActivityNotification({
        workspaceId: board.workspaceId,
        boardId: comment.boardId,
        canvasId: comment.canvasId,
        rootCommentId: comment._id,
        actorId: userId,
        action: dto.isResolved ? "RESOLVED" : "REOPENED",
        session,
      });
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
    session?: ClientSession,
    expectedVersion?: number
  ): Promise<{ comment: CommentDocument; boardId: Types.ObjectId }> {
    const comment = await commentRepository.findById(commentId, session);

    if (!comment) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found.");
    }

    const { board, role } = await boardService.resolveUserWorkspaceRole(
      comment.boardId,
      userId
    );

    let effectiveRole = role;
    if (!effectiveRole && board.createdBy.equals(userId)) {
      effectiveRole = WorkspaceRole.EDITOR;
    }

    const commentAuthorId =
      typeof comment.authorId === "object" && "_id" in (comment.authorId as any)
        ? (comment.authorId as any)._id
        : comment.authorId;

    const isAuthor = new Types.ObjectId(commentAuthorId).equals(userId);
    const isBoardCreator = board.createdBy.equals(userId);
    const isOwnerOrAdmin =
      effectiveRole === WorkspaceRole.OWNER ||
      effectiveRole === WorkspaceRole.ADMIN;

    const canDelete = isAuthor || isBoardCreator || isOwnerOrAdmin;

    if (!canDelete) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "You do not have permission to delete this comment."
      );
    }

    let deleted: CommentDocument | null = null;

    if (expectedVersion !== undefined) {
      deleted = await commentRepository.softDeleteWithExpectedVersion(
        commentId,
        expectedVersion,
        session
      );

      if (!deleted) {
        const existing = await commentRepository.findById(commentId, session);
        if (!existing) {
          throw new ApiError(HttpStatus.NOT_FOUND, "Comment not found.");
        }
        throw new ConflictError(
          "comment",
          commentId.toString(),
          existing.version,
          "Comment has been modified by another collaborator."
        );
      }
    } else {
      deleted = await commentRepository.softDeleteById(commentId, session);

      if (!deleted) {
        throw new ApiError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Failed to delete comment."
        );
      }
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
