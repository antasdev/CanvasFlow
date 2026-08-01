import { ClientSession, Types } from "mongoose";

import { CanvasModel } from "./canvas.model";

import {
  CreateCanvasData,
  CanvasDocument,
} from "./canvas.types";

import {
  UpdateCanvasDto,
} from "./canvas.dto";


export class CanvasRepository {

  async create(
    data: CreateCanvasData,
    session?: ClientSession
  ): Promise<CanvasDocument> {
    const [canvas] =
      await CanvasModel.create(
        [data],
        { session }
      );

    return canvas;
  }


  async findById(
    id: Types.ObjectId
  ): Promise<CanvasDocument | null> {
    return CanvasModel.findById(id);
  }


  async findByBoardId(
    boardId: Types.ObjectId
  ): Promise<CanvasDocument[]> {
    return CanvasModel
      .find({ boardId })
      .sort({ order: 1 });
  }


  async findLastOrder(
    boardId: Types.ObjectId
  ): Promise<number> {
    const lastCanvas =
      await CanvasModel
        .findOne({ boardId })
        .sort({ order: -1 })
        .select("order");


    return lastCanvas?.order ?? 0;
  }


  async updateById(
    id: Types.ObjectId,
    data: UpdateCanvasDto,
    session?: ClientSession
  ): Promise<CanvasDocument | null> {

    return CanvasModel.findByIdAndUpdate(
      id,
      data,
      {
        new: true,
        runValidators: true,
        session,
      }
    );
  }


  async deleteById(
    id: Types.ObjectId,
    session?: ClientSession
  ): Promise<CanvasDocument | null> {

    return CanvasModel.findByIdAndDelete(
      id,
      {
        session,
      }
    );
  }
}


export const canvasRepository =
  new CanvasRepository();