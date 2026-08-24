import { ClientSession, Types } from "mongoose";

import { WorkspaceModel } from "./workspace.model";
import { UpdateWorkspaceDto } from "./workspace.dto";

import {
  CreateWorkspaceData,
  WorkspaceDocument,
} from "./workspace.types";
export class WorkspaceRepository {
  async create(
    data: CreateWorkspaceData,
    session?: ClientSession
  ): Promise<WorkspaceDocument> {
    const [workspace] = await WorkspaceModel.create(
      [data],
      { session }
    );

    return workspace;
  }

  async findById(
    id: Types.ObjectId
  ): Promise<WorkspaceDocument | null> {
    return WorkspaceModel.findById(id);
  }

  async findByIds(
    ids: Types.ObjectId[]
  ): Promise<WorkspaceDocument[]> {
    return WorkspaceModel.find({ _id: { $in: ids } });
  }

  async findByOwnerId(
    ownerId: Types.ObjectId
  ): Promise<WorkspaceDocument[]> {
    return WorkspaceModel.find({ ownerId });
  }

  async updateById(
    id: Types.ObjectId,
    data: UpdateWorkspaceDto,
    session?: ClientSession
  ): Promise<WorkspaceDocument | null> {
    return WorkspaceModel.findByIdAndUpdate(
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
  ): Promise<WorkspaceDocument | null> {
    return WorkspaceModel.findByIdAndDelete(
      id,
      { session }
    );
  }
}

export const workspaceRepository = new WorkspaceRepository();