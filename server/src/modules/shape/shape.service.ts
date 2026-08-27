import { ClientSession, Types } from "mongoose";

import { shapeRepository } from "./shape.repository";
import { canvasRepository } from "@/modules/canvas";
import { commentRepository } from "@/modules/comment/comment.repository";
import { boardService } from "@/modules/board/board.service";
import { ShapeType } from "./shape.types";
import {
  CreateShapeDto,
  UpdateShapeDto,
  ShapeConnectorDto,
} from "./shape.dto";

import { ApiError, ConflictError } from "@/shared/utils";
import {
  HttpStatus,
  Messages,
} from "@/shared/constants";

export class ShapeService {
  private async validateConnectorRelations(
    canvasId: Types.ObjectId,
    connector?: ShapeConnectorDto,
    session?: ClientSession
  ): Promise<void> {
    if (!connector) return;

    if (connector.sourceShapeId && connector.targetShapeId) {
      if (connector.sourceShapeId === connector.targetShapeId) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Connector cannot attach source and target to the same shape."
        );
      }
    }

    if (connector.sourceShapeId) {
      const sourceShape = await shapeRepository.findById(
        new Types.ObjectId(connector.sourceShapeId),
        session
      );
      if (!sourceShape) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Connector source shape does not exist."
        );
      }
      if (sourceShape.canvasId.toString() !== canvasId.toString()) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Connector source shape belongs to a different canvas."
        );
      }
      if (sourceShape.type === ShapeType.CONNECTOR) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Connectors cannot attach to other connectors."
        );
      }
    }

    if (connector.targetShapeId) {
      const targetShape = await shapeRepository.findById(
        new Types.ObjectId(connector.targetShapeId),
        session
      );
      if (!targetShape) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Connector target shape does not exist."
        );
      }
      if (targetShape.canvasId.toString() !== canvasId.toString()) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Connector target shape belongs to a different canvas."
        );
      }
      if (targetShape.type === ShapeType.CONNECTOR) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Connectors cannot attach to other connectors."
        );
      }
    }
  }

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

    // Authorize canvas mutation for user
    await boardService.authorizeCanvasMutation(canvas.boardId, createdBy);

    if (dto.type === ShapeType.CONNECTOR && dto.connector) {
      await this.validateConnectorRelations(dto.canvasId, dto.connector, session);
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
    expectedVersion?: number,
    userId?: Types.ObjectId
  ) {
    const existing = await shapeRepository.findById(id, session);
    if (!existing) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.SHAPE_NOT_FOUND
      );
    }

    const canvas = await canvasRepository.findById(
      existing.canvasId
    );

    if (!canvas) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.CANVAS_NOT_FOUND
      );
    }

    if (userId) {
      await boardService.authorizeCanvasMutation(canvas.boardId, userId);
    }

    if (dto.connector) {
      await this.validateConnectorRelations(existing.canvasId, dto.connector, session);
    }

    const effectiveExpectedVersion = expectedVersion ?? dto.expectedVersion;

    let updatedShape = null;

    const effectiveShapeConfig = dto.shapeConfig
      ? { ...(existing.shapeConfig ?? {}), ...dto.shapeConfig }
      : existing.shapeConfig;

    const existingObj =
      typeof (existing as any).toObject === "function"
        ? (existing as any).toObject()
        : existing;
    const existingStyle = (existingObj.style ?? {}) as Record<string, unknown>;
    const rawExistingShadow = existingStyle.shadow;
    const existingShadow = (
      rawExistingShadow && typeof (rawExistingShadow as any).toObject === "function"
        ? (rawExistingShadow as any).toObject()
        : rawExistingShadow ?? {}
    ) as Record<string, unknown>;

    const effectiveStyle = dto.style
      ? {
          ...existingStyle,
          ...dto.style,
          ...(dto.style.shadow && typeof dto.style.shadow === "object"
            ? {
                shadow: {
                  ...existingShadow,
                  ...dto.style.shadow,
                },
              }
            : {}),
        }
      : existing.style;

    const updateDto = {
      ...dto,
      ...(dto.shapeConfig ? { shapeConfig: effectiveShapeConfig } : {}),
      ...(dto.style ? { style: effectiveStyle } : {}),
    };

    if (effectiveExpectedVersion !== undefined) {
      updatedShape = await shapeRepository.updateWithExpectedVersion(
        id,
        effectiveExpectedVersion,
        updateDto,
        session
      );

      if (!updatedShape) {
        const fresh = await shapeRepository.findById(id, session);
        if (!fresh) {
          throw new ApiError(
            HttpStatus.NOT_FOUND,
            Messages.SHAPE_NOT_FOUND
          );
        }
        throw new ConflictError(
          "shape",
          id.toString(),
          fresh.version,
          "Shape has been modified by another collaborator."
        );
      }
    } else {
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

    return {
      shape: updatedShape,
      boardId: canvas.boardId,
    };
  }

  async deleteShape(
    id: Types.ObjectId,
    session?: ClientSession,
    expectedVersion?: number,
    userId?: Types.ObjectId
  ) {
    const existing = await shapeRepository.findById(id, session);

    if (!existing) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.SHAPE_NOT_FOUND
      );
    }

    const canvas = await canvasRepository.findById(existing.canvasId);

    if (!canvas) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.CANVAS_NOT_FOUND
      );
    }

    if (userId) {
      await boardService.authorizeCanvasMutation(canvas.boardId, userId);
    }

    if (expectedVersion !== undefined) {
      const deleted = await shapeRepository.deleteWithExpectedVersion(
        id,
        expectedVersion,
        session
      );

      if (!deleted) {
        const fresh = await shapeRepository.findById(id, session);
        if (!fresh) {
          throw new ApiError(
            HttpStatus.NOT_FOUND,
            Messages.SHAPE_NOT_FOUND
          );
        }
        throw new ConflictError(
          "shape",
          id.toString(),
          fresh.version,
          "Shape has been modified by another collaborator."
        );
      }
    } else {
      await shapeRepository.deleteById(id, session);
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