import { ClientSession, Types } from "mongoose";

import { shapeRepository } from "./shape.repository";
import { ShapeModel } from "./shape.model";
import { canvasRepository } from "@/modules/canvas";
import { commentRepository } from "@/modules/comment/comment.repository";
import { boardService } from "@/modules/board/board.service";
import { ShapeType, ShapeDocument } from "./shape.types";
import {
  CreateShapeDto,
  UpdateShapeDto,
  ShapeConnectorDto,
  GroupShapesDto,
  UngroupShapeDto,
} from "./shape.dto";

import { ApiError, ConflictError } from "@/shared/utils";
import {
  HttpStatus,
  Messages,
} from "@/shared/constants";

function calculateEnclosingBoundingBox(shapes: ShapeDocument[]): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const s of shapes) {
    const rot = s.rotation ?? 0;
    if (rot === 0) {
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + s.width);
      maxY = Math.max(maxY, s.y + s.height);
    } else {
      const cx = s.x + s.width / 2;
      const cy = s.y + s.height / 2;
      const rad = (rot * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const corners = [
        { x: s.x, y: s.y },
        { x: s.x + s.width, y: s.y },
        { x: s.x + s.width, y: s.y + s.height },
        { x: s.x, y: s.y + s.height },
      ];

      for (const pt of corners) {
        const dx = pt.x - cx;
        const dy = pt.y - cy;
        const rx = cos * dx - sin * dy + cx;
        const ry = sin * dx + cos * dy + cy;
        minX = Math.min(minX, rx);
        minY = Math.min(minY, ry);
        maxX = Math.max(maxX, rx);
        maxY = Math.max(maxY, ry);
      }
    }
  }

  return {
    minX: Math.round(minX),
    minY: Math.round(minY),
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY)),
  };
}

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
  ): Promise<{ boardId: Types.ObjectId }> {
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

    // Cascade delete descendants if shape is a group
    let descendantIds: Types.ObjectId[] = [];
    if (existing.type === ShapeType.GROUP) {
      descendantIds = await shapeRepository.findDescendantIds(id, session);
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

    if (descendantIds.length > 0) {
      await shapeRepository.deleteManyByIds(descendantIds, session);
    }

    const allDeletedIds = [id, ...descendantIds];
    await shapeRepository.nullifyConnectorsReferencingShapes(allDeletedIds, session);

    for (const shapeId of allDeletedIds) {
      await commentRepository.nullifyShapeId(shapeId, session);
    }

    return {
      boardId: canvas.boardId,
    };
  }

  async groupShapes(
    userId: Types.ObjectId,
    dto: GroupShapesDto,
    session?: ClientSession
  ): Promise<{ group: ShapeDocument; children: ShapeDocument[]; boardId: Types.ObjectId }> {
    if (dto.shapeIds.length < 2) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Grouping requires at least 2 shapes."
      );
    }

    const canvas = await canvasRepository.findById(dto.canvasId);
    if (!canvas) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.CANVAS_NOT_FOUND
      );
    }

    await boardService.authorizeCanvasMutation(canvas.boardId, userId);

    const shapes = await shapeRepository.findShapesByIds(dto.shapeIds, session);
    if (shapes.length !== dto.shapeIds.length) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "One or more shapes to group do not exist."
      );
    }

    // Ensure all shapes belong to the same canvas
    for (const s of shapes) {
      if (s.canvasId.toString() !== dto.canvasId.toString()) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Cross-canvas grouping is rejected. All shapes must belong to the same canvas."
        );
      }
    }

    // Check parent hierarchy consistency: all grouped shapes must share the same parent container
    const firstParentId = shapes[0]?.parentId ? shapes[0].parentId.toString() : null;
    for (const s of shapes) {
      const pId = s.parentId ? s.parentId.toString() : null;
      if (pId !== firstParentId) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "Selected shapes must share the same parent container."
        );
      }
    }

    // Cyclic hierarchy prevention: ensure no selected shape is an ancestor of another selected shape
    const shapeIdSet = new Set(dto.shapeIds.map((id) => id.toString()));
    for (const s of shapes) {
      let currentParentId = s.parentId;
      while (currentParentId) {
        if (shapeIdSet.has(currentParentId.toString())) {
          throw new ApiError(
            HttpStatus.BAD_REQUEST,
            "Cannot group an element together with its own ancestor."
          );
        }
        const parentShape: ShapeDocument | null = await shapeRepository.findById(currentParentId, session);
        currentParentId = parentShape?.parentId ?? null;
      }
    }

    // Validate OCC expected versions
    if (dto.expectedVersions) {
      for (const s of shapes) {
        const expected = dto.expectedVersions[s._id.toString()];
        if (expected !== undefined && s.version !== expected) {
          throw new ConflictError(
            "shape",
            s._id.toString(),
            s.version,
            "One or more shapes have been modified by another collaborator."
          );
        }
      }
    }

    // Compute bounding box
    const bbox = calculateEnclosingBoundingBox(shapes);

    // Stacking order: take minimum zIndex among grouped shapes
    const minZIndex = Math.min(...shapes.map((s) => s.zIndex));

    const commonParentObjectId = shapes[0]?.parentId ?? null;

    // Create group shape
    const [group] = await ShapeModel.create(
      [
        {
          canvasId: dto.canvasId,
          type: ShapeType.GROUP,
          x: bbox.minX,
          y: bbox.minY,
          width: bbox.width,
          height: bbox.height,
          rotation: 0,
          zIndex: minZIndex,
          parentId: commonParentObjectId,
          style: {},
          createdBy: userId,
          version: 1,
        },
      ],
      { session }
    );

    // Convert children to local coordinates and assign parentId
    const updatedChildren: ShapeDocument[] = [];
    for (const child of shapes) {
      const localX = child.x - bbox.minX;
      const localY = child.y - bbox.minY;

      const updated = await ShapeModel.findByIdAndUpdate(
        child._id,
        {
          $set: {
            parentId: group._id,
            x: localX,
            y: localY,
          },
          $inc: { version: 1 },
        },
        { returnDocument: "after", runValidators: true, session }
      );

      if (updated) {
        updatedChildren.push(updated);
      }
    }

    return {
      group,
      children: updatedChildren,
      boardId: canvas.boardId,
    };
  }

  async ungroupShape(
    userId: Types.ObjectId,
    dto: UngroupShapeDto,
    session?: ClientSession
  ): Promise<{ groupId: Types.ObjectId; children: ShapeDocument[]; boardId: Types.ObjectId }> {
    const group = await shapeRepository.findById(dto.groupId, session);
    if (!group) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        "Group shape not found."
      );
    }

    if (group.type !== ShapeType.GROUP) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Shape is not a group."
      );
    }

    if (group.canvasId.toString() !== dto.canvasId.toString()) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Group does not belong to the specified canvas."
      );
    }

    const canvas = await canvasRepository.findById(group.canvasId);
    if (!canvas) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.CANVAS_NOT_FOUND
      );
    }

    await boardService.authorizeCanvasMutation(canvas.boardId, userId);

    // Validate OCC
    if (dto.expectedVersion !== undefined && group.version !== dto.expectedVersion) {
      throw new ConflictError(
        "shape",
        group._id.toString(),
        group.version,
        "Group has been modified by another collaborator."
      );
    }

    const children = await shapeRepository.findByParentId(group._id, session);
    const parentContainerId = group.parentId ?? null;

    const updatedChildren: ShapeDocument[] = [];
    for (const child of children) {
      const worldX = child.x + group.x;
      const worldY = child.y + group.y;
      const worldRotation = (child.rotation + (group.rotation ?? 0)) % 360;

      const updated = await ShapeModel.findByIdAndUpdate(
        child._id,
        {
          $set: {
            parentId: parentContainerId,
            x: worldX,
            y: worldY,
            rotation: worldRotation,
          },
          $inc: { version: 1 },
        },
        { returnDocument: "after", runValidators: true, session }
      );

      if (updated) {
        updatedChildren.push(updated);
      }
    }

    // Delete the group shape
    await shapeRepository.deleteById(group._id, session);

    return {
      groupId: group._id,
      children: updatedChildren,
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