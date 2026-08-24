import { ClientSession, Types } from "mongoose";

import { shapeRepository } from "./shape.repository";
import { canvasRepository } from "@/modules/canvas";
import { commentRepository } from "@/modules/comment/comment.repository";
import {
  CreateShapeDto,
  UpdateShapeDto,
} from "./shape.dto";

import { ApiError, ConflictError } from "@/shared/utils";
import {
  HttpStatus,
  Messages,
} from "@/shared/constants";

export class ShapeService {
  async createShape(
    createdBy: Types.ObjectId,
    dto: CreateShapeDto,
    session?: ClientSession
  ) {
    const canvas = await canvasRepository.findById(
      dto.canvasId
    );

    if (!canvas) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.CANVAS_NOT_FOUND
      );
    }

    const highestShape =
      await shapeRepository.findHighestZIndex(
        dto.canvasId
      );

    const zIndex = highestShape
      ? highestShape.zIndex + 1
      : 1;

    const shape = await shapeRepository.create(
      {
        ...dto,
        createdBy,
        zIndex,
      },
      session
    );

    return {
      shape,
      boardId: canvas.boardId,
    };
  }

  async getShapeById(id: Types.ObjectId) {
    const shape =
      await shapeRepository.findById(id);

    if (!shape) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.SHAPE_NOT_FOUND
      );
    }

    return shape;
  }

  async getCanvasShapes(
    canvasId: Types.ObjectId
  ) {
    return shapeRepository.findByCanvasId(
      canvasId
    );
  }

  async updateShape(
    id: Types.ObjectId,
    dto: UpdateShapeDto,
    session?: ClientSession,
    expectedVersion?: number
  ) {
    const effectiveExpectedVersion = expectedVersion ?? dto.expectedVersion;

    let updatedShape = null;

    if (effectiveExpectedVersion !== undefined) {
      updatedShape = await shapeRepository.updateWithExpectedVersion(
        id,
        effectiveExpectedVersion,
        dto,
        session
      );

      if (!updatedShape) {
        const existing = await shapeRepository.findById(id, session);
        if (!existing) {
          throw new ApiError(
            HttpStatus.NOT_FOUND,
            Messages.SHAPE_NOT_FOUND
          );
        }
        throw new ConflictError(
          "shape",
          id.toString(),
          existing.version,
          "Shape has been modified by another collaborator."
        );
      }
    } else {
      const shape = await shapeRepository.findById(id, session);

      if (!shape) {
        throw new ApiError(
          HttpStatus.NOT_FOUND,
          Messages.SHAPE_NOT_FOUND
        );
      }

      updatedShape = await shapeRepository.updateById(
        id,
        dto,
        session
      );

      if (!updatedShape) {
        throw new ApiError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Failed to update shape."
        );
      }
    }

    const canvas = await canvasRepository.findById(
      updatedShape.canvasId
    );

    if (!canvas) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.CANVAS_NOT_FOUND
      );
    }

    return {
      shape: updatedShape,
      boardId: canvas.boardId,
    };
  }

  async deleteShape(
    id: Types.ObjectId,
    session?: ClientSession,
    expectedVersion?: number
  ) {
    let canvasId: Types.ObjectId | null = null;

    if (expectedVersion !== undefined) {
      const deleted = await shapeRepository.deleteWithExpectedVersion(
        id,
        expectedVersion,
        session
      );

      if (!deleted) {
        const existing = await shapeRepository.findById(id, session);
        if (!existing) {
          throw new ApiError(
            HttpStatus.NOT_FOUND,
            Messages.SHAPE_NOT_FOUND
          );
        }
        throw new ConflictError(
          "shape",
          id.toString(),
          existing.version,
          "Shape has been modified by another collaborator."
        );
      }

      canvasId = deleted.canvasId;
    } else {
      const shape = await shapeRepository.findById(id, session);

      if (!shape) {
        throw new ApiError(
          HttpStatus.NOT_FOUND,
          Messages.SHAPE_NOT_FOUND
        );
      }

      canvasId = shape.canvasId;
      await shapeRepository.deleteById(id, session);
    }

    const canvas = await canvasRepository.findById(canvasId);

    if (!canvas) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.CANVAS_NOT_FOUND
      );
    }

    await commentRepository.nullifyShapeId(id, session);

    return {
      boardId: canvas.boardId,
    };
  }

  async verifyShapesBelongToBoard(
    boardId: Types.ObjectId,
    shapeIds: Types.ObjectId[]
  ): Promise<boolean> {
    if (shapeIds.length === 0) {
      return true;
    }

    const canvases = await canvasRepository.findByBoardId(boardId);
    if (canvases.length === 0) {
      return false;
    }

    const canvasIds = canvases.map((c) => c._id as Types.ObjectId);
    const count = await shapeRepository.countByShapeIdsAndCanvasIds(
      shapeIds,
      canvasIds
    );

    return count === shapeIds.length;
  }
}

export const shapeService =
  new ShapeService();