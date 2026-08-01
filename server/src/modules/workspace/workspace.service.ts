import mongoose, { Types } from "mongoose";

import { CreateWorkspaceDto, UpdateWorkspaceDto } from "./workspace.dto";
import { workspaceRepository } from "./workspace.repository";
import { workspaceMemberRepository } from "./workspaceMember.repository";
import { WorkspaceRole } from "./workspace.types";

import { ApiError } from "@/shared/utils";
import { HttpStatus, Messages } from "@/shared/constants";


export class WorkspaceService {
  async createWorkspace(
  ownerId: Types.ObjectId,
  dto: CreateWorkspaceDto
) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const workspace = await workspaceRepository.create(
      {
        ...dto,
        ownerId,
      },
      session
    );

    await workspaceMemberRepository.create(
      {
        workspaceId: workspace._id,
        userId: ownerId,
        role: WorkspaceRole.OWNER,
      },
      session
    );

    await session.commitTransaction();

    return workspace;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}

  async getWorkspaceById(id: Types.ObjectId) {
  const workspace = await workspaceRepository.findById(id);

  if (!workspace) {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      Messages.WORKSPACE_NOT_FOUND
    );
  }

  return workspace;
}
  async getUserWorkspaces(ownerId: Types.ObjectId) {
    return workspaceRepository.findByOwnerId(ownerId);
  }

  async updateWorkspace(
  id: Types.ObjectId,
  dto: UpdateWorkspaceDto
) {
  const workspace = await workspaceRepository.findById(id);

  if (!workspace) {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      Messages.WORKSPACE_NOT_FOUND
    );
  }

  return workspaceRepository.updateById(id, dto);
}

async deleteWorkspace(
  id: Types.ObjectId
): Promise<void> {
  const workspace = await workspaceRepository.findById(id);

  if (!workspace) {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      Messages.WORKSPACE_NOT_FOUND
    );
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    await workspaceMemberRepository.deleteByWorkspaceId(
      id,
      session
    );

    await workspaceRepository.deleteById(
      id,
      session
    );

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}
}

export const workspaceService = new WorkspaceService();