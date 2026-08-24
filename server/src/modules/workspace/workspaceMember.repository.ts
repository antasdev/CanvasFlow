import { ClientSession, Types } from "mongoose";

import { CreateWorkspaceMemberDto } from "./workspace.dto";
import { WorkspaceMemberModel } from "./workspaceMember.model";
import { WorkspaceMemberDocument, WorkspaceRole } from "./workspace.types";

export class WorkspaceMemberRepository {
  async create(
    data: CreateWorkspaceMemberDto,
    session?: ClientSession
  ): Promise<WorkspaceMemberDocument> {
    const [member] = await WorkspaceMemberModel.create([data], { session });
    return member;
  }

  async findByWorkspaceId(
    workspaceId: Types.ObjectId
  ): Promise<WorkspaceMemberDocument[]> {
    return WorkspaceMemberModel.find({ workspaceId });
  }

  async findByUserId(
    userId: Types.ObjectId
  ): Promise<WorkspaceMemberDocument[]> {
    return WorkspaceMemberModel.find({ userId });
  }

  async findByWorkspaceIdWithUser(
    workspaceId: Types.ObjectId
  ): Promise<WorkspaceMemberDocument[]> {
    return WorkspaceMemberModel.find({ workspaceId })
      .populate({
        path: "userId",
        select: "fullName email profile.avatar role",
      })
      .sort({ createdAt: 1 });
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

  async updateRole(
    workspaceId: Types.ObjectId,
    userId: Types.ObjectId,
    role: WorkspaceRole,
    session?: ClientSession
  ): Promise<WorkspaceMemberDocument | null> {
    return WorkspaceMemberModel.findOneAndUpdate(
      { workspaceId, userId },
      { role },
      { returnDocument: "after", runValidators: true, session }
    );
  }

  async deleteByWorkspaceAndUser(
    workspaceId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<WorkspaceMemberDocument | null> {
    return WorkspaceMemberModel.findOneAndDelete(
      { workspaceId, userId },
      { session }
    );
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