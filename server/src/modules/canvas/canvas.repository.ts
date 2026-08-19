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
    id: Types.ObjectId,
    session?: ClientSession
  ): Promise<CanvasDocument | null> {
    const query = CanvasModel.findById(id);
    if (session) {
      query.session(session);
    }
    return query;
  }


  async findByBoardId(
    boardId: Types.ObjectId,
    session?: ClientSession
  ): Promise<CanvasDocument[]> {
    const query = CanvasModel
      .find({ boardId })
      .sort({ order: 1 });

    if (session) {
      query.session(session);
    }

    return query;
  }


  async findLastOrder(
    boardId: Types.ObjectId,
    session?: ClientSession
  ): Promise<number> {
    const query = CanvasModel
      .findOne({ boardId })
      .sort({ order: -1 })
      .select("order");

    if (session) {
      query.session(session);
    }

    const lastCanvas = await query;

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