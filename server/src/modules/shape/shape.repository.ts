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
    id: Types.ObjectId
  ): Promise<ShapeDocument | null> {
    return ShapeModel.findById(id);
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

  async updateById(
    id: Types.ObjectId,
    data: UpdateShapeDto,
    session?: ClientSession
  ): Promise<ShapeDocument | null> {
    return ShapeModel.findByIdAndUpdate(
      id,
      data,
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
}

export const shapeRepository =
  new ShapeRepository();