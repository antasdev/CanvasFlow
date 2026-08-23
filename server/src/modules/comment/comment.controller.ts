import { Request, Response } from "express";
import { Types } from "mongoose";

import { HttpStatus } from "@/shared/constants";
import { commentService } from "./comment.service";
import { CommentMapper } from "./comment.mapper";
import { CreateCommentDto, UpdateCommentDto, ResolveCommentDto } from "./comment.dto";

export class CommentController {
  async createComment(req: Request, res: Response): Promise<void> {
    const authorId = new Types.ObjectId(req.user!.userId);
    const boardId = new Types.ObjectId(req.params.boardId as string);

    const dto: CreateCommentDto = {
      boardId,
      content: req.body.content,
      shapeId: req.body.shapeId ? new Types.ObjectId(req.body.shapeId) : null,
      parentCommentId: req.body.parentCommentId
        ? new Types.ObjectId(req.body.parentCommentId)
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

  async getBoardComments(req: Request, res: Response): Promise<void> {
    const userId = new Types.ObjectId(req.user!.userId);
    const boardId = new Types.ObjectId(req.params.boardId as string);

    const shapeId = req.query.shapeId
      ? new Types.ObjectId(req.query.shapeId as string)
      : undefined;

    const isResolved =
      req.query.resolved !== undefined
        ? req.query.resolved === "true"
        : undefined;

    const comments = await commentService.getBoardComments(boardId, userId, {
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

    const result = await commentService.deleteComment(commentId, userId);

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
