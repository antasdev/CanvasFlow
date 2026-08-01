import { Types } from "mongoose";
import { ClientSession } from "mongoose";

import { CreateWorkspaceMemberDto } from "./workspace.dto";
import { WorkspaceMemberModel } from "./workspaceMember.model";
import { WorkspaceMemberDocument } from "./workspace.types";

export class WorkspaceMemberRepository {
 async create(
  data: CreateWorkspaceMemberDto,
  session?: ClientSession
): Promise<WorkspaceMemberDocument> {
  const [member] = await WorkspaceMemberModel.create(
    [data],
    { session }
  );

  return member;
}

  async findByWorkspaceId(
    workspaceId: Types.ObjectId
  ): Promise<WorkspaceMemberDocument[]> {
    return WorkspaceMemberModel.find({ workspaceId });
  }

  async findByWorkspaceAndUser(
    workspaceId: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<WorkspaceMemberDocument | null> {
    return WorkspaceMemberModel.findOne({
      workspaceId,
      userId,
    });
  }

  async deleteById(
    id: Types.ObjectId
  ): Promise<WorkspaceMemberDocument | null> {
    return WorkspaceMemberModel.findByIdAndDelete(id);
  }

  async deleteByWorkspaceId(
  workspaceId: Types.ObjectId,
  session?: ClientSession
): Promise<void> {
  await WorkspaceMemberModel.deleteMany(
    { workspaceId },
    { session }
  );
}
}

export const workspaceMemberRepository =
  new WorkspaceMemberRepository();