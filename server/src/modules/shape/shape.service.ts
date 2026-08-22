import { Types } from "mongoose";

import { shapeRepository } from "./shape.repository";
import { canvasRepository } from "@/modules/canvas";
import {
  CreateShapeDto,
  UpdateShapeDto,
} from "./shape.dto";

import { ApiError } from "@/shared/utils";
import {
  HttpStatus,
  Messages,
} from "@/shared/constants";

export class ShapeService {
  async createShape(
    createdBy: Types.ObjectId,
    dto: CreateShapeDto
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

    const shape = await shapeRepository.create({
      ...dto,
      createdBy,
      zIndex,
    });

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
    dto: UpdateShapeDto
  ) {
    const shape =
      await shapeRepository.findById(id);

    if (!shape) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.SHAPE_NOT_FOUND
      );
    }

    const updatedShape =
      await shapeRepository.updateById(
        id,
        dto
      );

    if (!updatedShape) {
      throw new ApiError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Failed to update shape."
      );
    }

    const canvas =
      await canvasRepository.findById(
        shape.canvasId
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
    id: Types.ObjectId
  ) {
    const shape =
      await shapeRepository.findById(id);

    if (!shape) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.SHAPE_NOT_FOUND
      );
    }

    const canvas =
      await canvasRepository.findById(
        shape.canvasId
      );

    if (!canvas) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.CANVAS_NOT_FOUND
      );
    }

    await shapeRepository.deleteById(id);

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