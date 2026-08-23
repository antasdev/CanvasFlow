import { ClientSession, Types } from "mongoose";

import { CommentModel } from "./comment.model";
import {
  CommentDocument,
  CreateCommentData,
  UpdateCommentData,
} from "./comment.types";
import { CommentFilterDto } from "./comment.dto";

export class CommentRepository {
  async create(
    data: CreateCommentData,
    session?: ClientSession
  ): Promise<CommentDocument> {
    const [comment] = await CommentModel.create([data], { session });
    return comment;
  }

  async findById(id: Types.ObjectId): Promise<CommentDocument | null> {
    return CommentModel.findById(id).populate({
      path: "authorId",
      select: "fullName email profile",
    });
  }

  async findByBoardId(
    boardId: Types.ObjectId,
    filter?: CommentFilterDto
  ): Promise<CommentDocument[]> {
    const query: Record<string, unknown> = {
      boardId,
    };

    if (filter?.shapeId !== undefined) {
      query.shapeId = filter.shapeId;
    }

    if (filter?.parentCommentId !== undefined) {
      query.parentCommentId = filter.parentCommentId;
    }

    if (filter?.isResolved !== undefined) {
      query.isResolved = filter.isResolved;
    }

    return CommentModel.find(query)
      .sort({ createdAt: 1 })
      .populate({
        path: "authorId",
        select: "fullName email profile",
      });
  }

  async updateById(
    id: Types.ObjectId,
    data: UpdateCommentData,
    session?: ClientSession
  ): Promise<CommentDocument | null> {
    return CommentModel.findByIdAndUpdate(
      id,
      { $set: data },
      {
        returnDocument: "after",
        runValidators: true,
        session,
      }
    ).populate({
      path: "authorId",
      select: "fullName email profile",
    });
  }

  async softDeleteById(
    id: Types.ObjectId,
    session?: ClientSession
  ): Promise<CommentDocument | null> {
    return CommentModel.findByIdAndUpdate(
      id,
      {
        $set: {
          content: "",
          deletedAt: new Date(),
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
        session,
      }
    ).populate({
      path: "authorId",
      select: "fullName email profile",
    });
  }

  /**
   * When a shape is deleted, nullifies the shapeId on all comments attached to it,
   * preserving them as canvas-level comments.
   */
  async nullifyShapeId(
    shapeId: Types.ObjectId,
    session?: ClientSession
  ): Promise<number> {
    const result = await CommentModel.updateMany(
      { shapeId },
      { $set: { shapeId: null } },
      { session }
    );
    return result.modifiedCount;
  }

  async countByParentCommentId(
    parentCommentId: Types.ObjectId
  ): Promise<number> {
    return CommentModel.countDocuments({ parentCommentId });
  }

  async findReplies(
    parentCommentId: Types.ObjectId
  ): Promise<CommentDocument[]> {
    return CommentModel.find({ parentCommentId })
      .sort({ createdAt: 1 })
      .populate({
        path: "authorId",
        select: "fullName email profile",
      });
  }
}

export const commentRepository = new CommentRepository();
