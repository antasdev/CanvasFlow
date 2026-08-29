import { Request, Response } from "express";
import { Types } from "mongoose";

import { HttpStatus } from "@/shared/constants";
import { commentService } from "./comment.service";
import { CommentMapper } from "./comment.mapper";
import {
  CreateCommentDto,
  CreateReplyDto,
  UpdateCommentDto,
  ResolveCommentDto,
} from "./comment.dto";

export class CommentController {
  async createComment(req: Request, res: Response): Promise<void> {
    const authorId = new Types.ObjectId(req.user!.userId);
    const boardId = new Types.ObjectId(req.params.boardId as string);
    const canvasIdParam =
      (req.params.canvasId as string | undefined) ??
      (req.body.canvasId as string | undefined);

    const dto: CreateCommentDto = {
      boardId,
      canvasId: canvasIdParam ? new Types.ObjectId(canvasIdParam) : undefined,
      content: req.body.content,
      shapeId: req.body.shapeId ? new Types.ObjectId(req.body.shapeId) : null,
      parentCommentId: req.body.parentCommentId
        ? new Types.ObjectId(req.body.parentCommentId)
        : null,
      position: req.body.position
        ? {
            x: Number(req.body.position.x),
            y: Number(req.body.position.y),
          }
        : null,
    };

    const result = await commentService.createComment(authorId, dto);

    res.status(HttpStatus.CREATED).json({
      success: true,
      data: CommentMapper.toResponseDto(
        result.comment,
        result.comment.authorId as any
      ),
    });
  }

  async createReply(req: Request, res: Response): Promise<void> {
    const authorId = new Types.ObjectId(req.user!.userId);
    const boardId = new Types.ObjectId(req.params.boardId as string);
    const commentId = new Types.ObjectId(req.params.commentId as string);

    const dto: CreateReplyDto = {
      content: req.body.content,
      expectedVersion:
        req.body.expectedVersion !== undefined
          ? Number(req.body.expectedVersion)
          : undefined,
    };

    const result = await commentService.createReply(
      authorId,
      boardId,
      commentId,
      dto
    );

    res.status(HttpStatus.CREATED).json({
      success: true,
      data: CommentMapper.toResponseDto(
        result.comment,
        result.comment.authorId as any
      ),
    });
  }

  async getBoardComments(req: Request, res: Response): Promise<void> {
    const userId = new Types.ObjectId(req.user!.userId);
    const boardId = new Types.ObjectId(req.params.boardId as string);

    const canvasId = req.query.canvasId
      ? new Types.ObjectId(req.query.canvasId as string)
      : undefined;

    const shapeId = req.query.shapeId
      ? new Types.ObjectId(req.query.shapeId as string)
      : undefined;

    const isResolved =
      req.query.resolved !== undefined
        ? req.query.resolved === "true"
        : undefined;

    const comments = await commentService.getBoardComments(boardId, userId, {
      canvasId,
      shapeId,
      isResolved,
    });

    res.status(HttpStatus.OK).json({
      success: true,
      data: comments.map((comment) =>
        CommentMapper.toResponseDto(comment, comment.authorId as any)
      ),
    });
  }

  async getCanvasComments(req: Request, res: Response): Promise<void> {
    const userId = new Types.ObjectId(req.user!.userId);
    const boardId = new Types.ObjectId(req.params.boardId as string);
    const canvasId = new Types.ObjectId(req.params.canvasId as string);

    const shapeId = req.query.shapeId
      ? new Types.ObjectId(req.query.shapeId as string)
      : undefined;

    const isResolved =
      req.query.resolved !== undefined
        ? req.query.resolved === "true"
        : undefined;

    const comments = await commentService.getCanvasComments(
      boardId,
      canvasId,
      userId,
      {
        shapeId,
        isResolved,
      }
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: comments.map((comment) =>
        CommentMapper.toResponseDto(comment, comment.authorId as any)
      ),
    });
  }

  async getComment(req: Request, res: Response): Promise<void> {
    const userId = new Types.ObjectId(req.user!.userId);
    const commentId = new Types.ObjectId(req.params.commentId as string);

    const comment = await commentService.getCommentById(commentId, userId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: CommentMapper.toResponseDto(comment, comment.authorId as any),
    });
  }

  async updateComment(req: Request, res: Response): Promise<void> {
    const userId = new Types.ObjectId(req.user!.userId);
    const commentId = new Types.ObjectId(req.params.commentId as string);

    const dto: UpdateCommentDto = {
      content: req.body.content,
      expectedVersion:
        req.body.expectedVersion !== undefined
          ? Number(req.body.expectedVersion)
          : undefined,
    };

    const result = await commentService.updateComment(commentId, userId, dto);

    res.status(HttpStatus.OK).json({
      success: true,
      data: CommentMapper.toResponseDto(
        result.comment,
        result.comment.authorId as any
      ),
    });
  }

  async resolveComment(req: Request, res: Response): Promise<void> {
    const userId = new Types.ObjectId(req.user!.userId);
    const commentId = new Types.ObjectId(req.params.commentId as string);

    const dto: ResolveCommentDto = {
      isResolved: Boolean(req.body.isResolved),
      expectedVersion:
        req.body.expectedVersion !== undefined
          ? Number(req.body.expectedVersion)
          : undefined,
    };

    const result = await commentService.resolveComment(commentId, userId, dto);

    res.status(HttpStatus.OK).json({
      success: true,
      data: CommentMapper.toResponseDto(
        result.comment,
        result.comment.authorId as any
      ),
    });
  }

  async deleteComment(req: Request, res: Response): Promise<void> {
    const userId = new Types.ObjectId(req.user!.userId);
    const commentId = new Types.ObjectId(req.params.commentId as string);
    const expectedVersion =
      req.body?.expectedVersion !== undefined
        ? Number(req.body.expectedVersion)
        : undefined;

    const result = await commentService.deleteComment(
      commentId,
      userId,
      undefined,
      expectedVersion
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: CommentMapper.toResponseDto(
        result.comment,
        result.comment.authorId as any
      ),
    });
  }
}

export const commentController = new CommentController();
