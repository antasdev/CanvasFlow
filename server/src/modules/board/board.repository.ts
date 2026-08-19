import { Types } from "mongoose";
import { ClientSession } from "mongoose";

import { BoardModel } from "./board.model";
import {
  CreateBoardData,
  BoardDocument,
} from "./board.types";
import { UpdateBoardDto } from "./board.dto";

export class BoardRepository {
  async create(
    data: CreateBoardData,
    session?: ClientSession
  ): Promise<BoardDocument> {
    const [board] = await BoardModel.create(
      [data],
      { session }
    );

    return board;
  }

  async findById(
    id: Types.ObjectId,
    session?: ClientSession
  ): Promise<BoardDocument | null> {
    const query = BoardModel.findById(id);
    if (session) {
      query.session(session);
    }
    return query;
  }

  async findByWorkspaceId(
    workspaceId: Types.ObjectId
  ): Promise<BoardDocument[]> {
    return BoardModel.find({
      workspaceId,
      isArchived: false,
    });
  }

  async updateById(
    id: Types.ObjectId,
    data: UpdateBoardDto,
    session?: ClientSession
  ): Promise<BoardDocument | null> {
    return BoardModel.findByIdAndUpdate(
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
  ): Promise<BoardDocument | null> {
    return BoardModel.findByIdAndDelete(
      id,
      { session }
    );
  }
}

export const boardRepository =
  new BoardRepository();