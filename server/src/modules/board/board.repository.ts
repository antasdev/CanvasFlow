import { Types } from "mongoose";
import { ClientSession } from "mongoose";

import { BoardModel } from "./board.model";
import {
  CreateBoardData,
  BoardDocument,
  BoardVisibility,
} from "./board.types";
import { UpdateBoardDto } from "./board.dto";

export interface BoardAuthSummary {
  _id: Types.ObjectId;
  visibility: BoardVisibility;
  createdBy: Types.ObjectId;
}

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

  async findBoardAuthSummaries(
    workspaceId: Types.ObjectId
  ): Promise<BoardAuthSummary[]> {
    return BoardModel.find({
      workspaceId,
      isArchived: false,
    })
      .select({
        _id: 1,
        visibility: 1,
        createdBy: 1,
      })
      .lean<BoardAuthSummary[]>()
      .exec();
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
        returnDocument: "after",
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

  async incrementCollaborationRevision(
    id: Types.ObjectId,
    session?: ClientSession
  ): Promise<BoardDocument | null> {
    return BoardModel.findByIdAndUpdate(
      id,
      {
        $inc: {
          collaborationRevision: 1,
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
        session,
      }
    );
  }
}

export const boardRepository =
  new BoardRepository();