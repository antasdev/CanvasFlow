import { ClientSession, Types } from "mongoose";

import { ShapeModel } from "./shape.model";

import {
  CreateShapeData,
  ShapeDocument,
} from "./shape.types";

import { UpdateShapeDto } from "./shape.dto";

export class ShapeRepository {
  async create(
    data: CreateShapeData,
    session?: ClientSession
  ): Promise<ShapeDocument> {
    const [shape] = await ShapeModel.create(
      [data],
      { session }
    );

    return shape;
  }

  async findById(
    id: Types.ObjectId,
    session?: ClientSession
  ): Promise<ShapeDocument | null> {
    return ShapeModel.findById(id, null, { session });
  }

  async findByCanvasId(
    canvasId: Types.ObjectId
  ): Promise<ShapeDocument[]> {
    return ShapeModel
      .find({ canvasId })
      .sort({ zIndex: 1 });
  }

  async findHighestZIndex(
    canvasId: Types.ObjectId
  ): Promise<ShapeDocument | null> {
    return ShapeModel
      .findOne({ canvasId })
      .sort({ zIndex: -1 });
  }

  async updateWithExpectedVersion(
    id: Types.ObjectId,
    expectedVersion: number,
    data: UpdateShapeDto,
    session?: ClientSession
  ): Promise<ShapeDocument | null> {
    const { expectedVersion: _, ...updateData } = data;
    return ShapeModel.findOneAndUpdate(
      {
        _id: id,
        version: expectedVersion,
      },
      {
        $set: updateData,
        $inc: { version: 1 },
      },
      {
        returnDocument: "after",
        runValidators: true,
        session,
      }
    );
  }

  async deleteWithExpectedVersion(
    id: Types.ObjectId,
    expectedVersion: number,
    session?: ClientSession
  ): Promise<ShapeDocument | null> {
    return ShapeModel.findOneAndDelete(
      {
        _id: id,
        version: expectedVersion,
      },
      { session }
    );
  }

  async updateById(
    id: Types.ObjectId,
    data: UpdateShapeDto,
    session?: ClientSession
  ): Promise<ShapeDocument | null> {
    const { expectedVersion: _, ...updateData } = data;
    return ShapeModel.findByIdAndUpdate(
      id,
      {
        $set: updateData,
        $inc: { version: 1 },
      },
      {
        returnDocument: "after",
        runValidators: true,
        session,
      }
    );
  }

  async deleteById(
    id: Types.ObjectId,
    session?: ClientSession
  ): Promise<ShapeDocument | null> {
    return ShapeModel.findByIdAndDelete(
      id,
      { session }
    );
  }

  async countByShapeIdsAndCanvasIds(
    shapeIds: Types.ObjectId[],
    canvasIds: Types.ObjectId[]
  ): Promise<number> {
    if (shapeIds.length === 0 || canvasIds.length === 0) {
      return 0;
    }
    return ShapeModel.countDocuments({
      _id: { $in: shapeIds },
      canvasId: { $in: canvasIds },
    });
  }

  async findShapesByIds(
    ids: Types.ObjectId[],
    session?: ClientSession
  ): Promise<ShapeDocument[]> {
    if (ids.length === 0) {
      return [];
    }
    return ShapeModel.find({ _id: { $in: ids } }, null, { session });
  }

  async findByParentId(
    parentId: Types.ObjectId,
    session?: ClientSession
  ): Promise<ShapeDocument[]> {
    return ShapeModel.find({ parentId }, null, { session }).sort({ zIndex: 1 });
  }

  async findDescendantIds(
    rootGroupId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Types.ObjectId[]> {
    const descendants: Types.ObjectId[] = [];
    let currentLevelIds: Types.ObjectId[] = [rootGroupId];

    while (currentLevelIds.length > 0) {
      const children: ShapeDocument[] = await ShapeModel.find(
        { parentId: { $in: currentLevelIds } },
        { _id: 1 },
        { session }
      );
      const nextLevelIds = children.map((c) => c._id as Types.ObjectId);
      if (nextLevelIds.length === 0) {
        break;
      }
      descendants.push(...nextLevelIds);
      currentLevelIds = nextLevelIds;
    }

    return descendants;
  }

  async deleteManyByIds(
    ids: Types.ObjectId[],
    session?: ClientSession
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await ShapeModel.deleteMany({ _id: { $in: ids } }, { session });
  }

  async nullifyConnectorsReferencingShapes(
    shapeIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<void> {
    if (shapeIds.length === 0) {
      return;
    }
    await ShapeModel.updateMany(
      { "connector.sourceShapeId": { $in: shapeIds } },
      { $set: { "connector.sourceShapeId": null, "connector.sourceAnchor": null } },
      { session }
    );
    await ShapeModel.updateMany(
      { "connector.targetShapeId": { $in: shapeIds } },
      { $set: { "connector.targetShapeId": null, "connector.targetAnchor": null } },
      { session }
    );
  }
}

export const shapeRepository =
  new ShapeRepository();