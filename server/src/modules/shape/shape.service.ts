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

    return shapeRepository.create({
      ...dto,
      createdBy,
      zIndex,
    });
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

    return shapeRepository.updateById(
      id,
      dto
    );
  }

  async deleteShape(
    id: Types.ObjectId
  ): Promise<void> {
    const shape =
      await shapeRepository.findById(id);

    if (!shape) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.SHAPE_NOT_FOUND
      );
    }

    await shapeRepository.deleteById(id);
  }
}

export const shapeService =
  new ShapeService();