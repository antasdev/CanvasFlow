import mongoose, { Types } from "mongoose";

import {
  AddWorkspaceMemberDto,
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  UpdateWorkspaceMemberRoleDto,
  WorkspaceMemberResponseDto,
  WorkspaceResponseDto,
} from "./workspace.dto";
import { workspaceRepository } from "./workspace.repository";
import { workspaceMemberRepository } from "./workspaceMember.repository";
import { WorkspaceRole, WorkspaceVisibility } from "./workspace.types";
import {
  assertWorkspacePermission,
  WorkspacePermission,
} from "./workspace.authorization";
import { authRepository } from "../auth/auth.repository";

import { ApiError } from "@/shared/utils";
import { HttpStatus, Messages } from "@/shared/constants";

export class WorkspaceService {
  private toWorkspaceResponseDto(
    workspace: {
      _id: Types.ObjectId;
      name: string;
      description?: string;
      visibility: string;
      createdAt: Date;
      updatedAt: Date;
    },
    role: WorkspaceRole
  ): WorkspaceResponseDto {
    return {
      id: workspace._id.toString(),
      name: workspace.name,
      description: workspace.description,
      visibility: workspace.visibility,
      role,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }

  private async resolveUserRoleInWorkspace(
    workspaceId: Types.ObjectId,
    userId: Types.ObjectId,
    workspaceOwnerId?: Types.ObjectId,
    workspaceVisibility?: WorkspaceVisibility
  ): Promise<WorkspaceRole> {
    if (workspaceOwnerId && workspaceOwnerId.equals(userId)) {
      return WorkspaceRole.OWNER;
    }

    const member = await workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId,
      userId
    );

    if (member) {
      return member.role;
    }

    if (workspaceVisibility === WorkspaceVisibility.PUBLIC) {
      return WorkspaceRole.VIEWER;
    }

    throw new ApiError(
      HttpStatus.FORBIDDEN,
      "You do not have permission to access this workspace."
    );
  }

  async createWorkspace(
    ownerId: Types.ObjectId,
    dto: CreateWorkspaceDto
  ): Promise<WorkspaceResponseDto> {
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

      return this.toWorkspaceResponseDto(workspace, WorkspaceRole.OWNER);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getWorkspaceById(
    id: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<WorkspaceResponseDto> {
    const workspace = await workspaceRepository.findById(id);

    if (!workspace) {
      throw new ApiError(HttpStatus.NOT_FOUND, Messages.WORKSPACE_NOT_FOUND);
    }

    const role = await this.resolveUserRoleInWorkspace(
      workspace._id,
      userId,
      workspace.ownerId,
      workspace.visibility
    );

    return this.toWorkspaceResponseDto(workspace, role);
  }

  async getUserWorkspaces(
    userId: Types.ObjectId
  ): Promise<WorkspaceResponseDto[]> {
    const memberships = await workspaceMemberRepository.findByUserId(userId);
    const ownedWorkspaces = await workspaceRepository.findByOwnerId(userId);

    const roleMap = new Map<string, WorkspaceRole>();
    const workspaceIdSet = new Set<string>();

    for (const membership of memberships) {
      const wId = membership.workspaceId.toString();
      workspaceIdSet.add(wId);
      roleMap.set(wId, membership.role);
    }

    for (const owned of ownedWorkspaces) {
      const wId = owned._id.toString();
      workspaceIdSet.add(wId);
      roleMap.set(wId, WorkspaceRole.OWNER);
    }

    const objectIds = Array.from(workspaceIdSet).map(
      (idStr) => new Types.ObjectId(idStr)
    );

    const workspaces = await workspaceRepository.findByIds(objectIds);

    return workspaces.map((workspace) => {
      const role =
        roleMap.get(workspace._id.toString()) ??
        (workspace.ownerId.equals(userId)
          ? WorkspaceRole.OWNER
          : WorkspaceRole.VIEWER);

      return this.toWorkspaceResponseDto(workspace, role);
    });
  }

  async updateWorkspace(
    id: Types.ObjectId,
    userId: Types.ObjectId,
    dto: UpdateWorkspaceDto
  ): Promise<WorkspaceResponseDto> {
    const workspace = await workspaceRepository.findById(id);

    if (!workspace) {
      throw new ApiError(HttpStatus.NOT_FOUND, Messages.WORKSPACE_NOT_FOUND);
    }

    const role = await this.resolveUserRoleInWorkspace(
      workspace._id,
      userId,
      workspace.ownerId,
      workspace.visibility
    );

    assertWorkspacePermission(
      role,
      WorkspacePermission.UPDATE_WORKSPACE,
      "You do not have permission to update this workspace."
    );

    const updatedWorkspace = await workspaceRepository.updateById(id, dto);

    if (!updatedWorkspace) {
      throw new ApiError(HttpStatus.NOT_FOUND, Messages.WORKSPACE_NOT_FOUND);
    }

    return this.toWorkspaceResponseDto(updatedWorkspace, role);
  }

  async deleteWorkspace(
    id: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<void> {
    const workspace = await workspaceRepository.findById(id);

    if (!workspace) {
      throw new ApiError(HttpStatus.NOT_FOUND, Messages.WORKSPACE_NOT_FOUND);
    }

    if (!workspace.ownerId.equals(userId)) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "Only the workspace owner can delete this workspace."
      );
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      await workspaceMemberRepository.deleteByWorkspaceId(id, session);
      await workspaceRepository.deleteById(id, session);

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getWorkspaceMembers(
    workspaceId: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<WorkspaceMemberResponseDto[]> {
    const workspace = await workspaceRepository.findById(workspaceId);

    if (!workspace) {
      throw new ApiError(HttpStatus.NOT_FOUND, Messages.WORKSPACE_NOT_FOUND);
    }

    const role = await this.resolveUserRoleInWorkspace(
      workspace._id,
      userId,
      workspace.ownerId,
      workspace.visibility
    );

    assertWorkspacePermission(
      role,
      WorkspacePermission.VIEW_MEMBERS,
      "You do not have permission to view workspace members."
    );

    const members =
      await workspaceMemberRepository.findByWorkspaceIdWithUser(workspaceId);

    return members.map((member) => {
      const userDoc = member.userId as any;
      const isPopulated = userDoc && typeof userDoc === "object" && "_id" in userDoc;

      return {
        id: member._id.toString(),
        workspaceId: member.workspaceId.toString(),
        userId: isPopulated ? userDoc._id.toString() : member.userId.toString(),
        role: member.role,
        joinedAt: member.joinedAt,
        user: isPopulated
          ? {
              id: userDoc._id.toString(),
              fullName: userDoc.fullName || "",
              email: userDoc.email || "",
              avatar: userDoc.profile?.avatar || undefined,
            }
          : undefined,
      };
    });
  }

  async addWorkspaceMember(
    workspaceId: Types.ObjectId,
    actorId: Types.ObjectId,
    dto: AddWorkspaceMemberDto
  ): Promise<WorkspaceMemberResponseDto> {
    const workspace = await workspaceRepository.findById(workspaceId);

    if (!workspace) {
      throw new ApiError(HttpStatus.NOT_FOUND, Messages.WORKSPACE_NOT_FOUND);
    }

    const actorRole = await this.resolveUserRoleInWorkspace(
      workspace._id,
      actorId,
      workspace.ownerId,
      workspace.visibility
    );

    assertWorkspacePermission(
      actorRole,
      WorkspacePermission.MANAGE_MEMBERS,
      "You do not have permission to add members to this workspace."
    );

    if (dto.role === WorkspaceRole.OWNER) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Cannot assign OWNER role directly."
      );
    }

    const targetUser = await authRepository.findByEmail(
      dto.email.toLowerCase().trim()
    );

    if (!targetUser) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        "User with the specified email does not exist."
      );
    }

    const existingMember =
      await workspaceMemberRepository.findByWorkspaceAndUser(
        workspaceId,
        targetUser._id
      );

    if (existingMember) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "User is already a member of this workspace."
      );
    }

    const newMember = await workspaceMemberRepository.create({
      workspaceId,
      userId: targetUser._id,
      role: dto.role,
    });

    return {
      id: newMember._id.toString(),
      workspaceId: newMember.workspaceId.toString(),
      userId: targetUser._id.toString(),
      role: newMember.role,
      joinedAt: newMember.joinedAt,
      user: {
        id: targetUser._id.toString(),
        fullName: targetUser.fullName,
        email: targetUser.email,
        avatar: targetUser.profile?.avatar || undefined,
      },
    };
  }

  async updateMemberRole(
    workspaceId: Types.ObjectId,
    actorId: Types.ObjectId,
    targetUserId: Types.ObjectId,
    dto: UpdateWorkspaceMemberRoleDto
  ): Promise<WorkspaceMemberResponseDto> {
    const workspace = await workspaceRepository.findById(workspaceId);

    if (!workspace) {
      throw new ApiError(HttpStatus.NOT_FOUND, Messages.WORKSPACE_NOT_FOUND);
    }

    const actorRole = await this.resolveUserRoleInWorkspace(
      workspace._id,
      actorId,
      workspace.ownerId,
      workspace.visibility
    );

    assertWorkspacePermission(
      actorRole,
      WorkspacePermission.MANAGE_MEMBERS,
      "You do not have permission to update member roles."
    );

    if (dto.role === WorkspaceRole.OWNER) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Cannot assign OWNER role directly."
      );
    }

    const targetMember =
      await workspaceMemberRepository.findByWorkspaceAndUser(
        workspaceId,
        targetUserId
      );

    if (!targetMember) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        "Workspace member not found."
      );
    }

    if (
      workspace.ownerId.equals(targetUserId) ||
      targetMember.role === WorkspaceRole.OWNER
    ) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "Cannot modify the workspace owner's role."
      );
    }

    if (
      actorRole === WorkspaceRole.ADMIN &&
      targetMember.role === WorkspaceRole.ADMIN &&
      !actorId.equals(targetUserId)
    ) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "Only the workspace owner can modify another admin's role."
      );
    }

    const updatedMember = await workspaceMemberRepository.updateRole(
      workspaceId,
      targetUserId,
      dto.role
    );

    if (!updatedMember) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        "Workspace member not found."
      );
    }

    return {
      id: updatedMember._id.toString(),
      workspaceId: updatedMember.workspaceId.toString(),
      userId: updatedMember.userId.toString(),
      role: updatedMember.role,
      joinedAt: updatedMember.joinedAt,
    };
  }

  async removeWorkspaceMember(
    workspaceId: Types.ObjectId,
    actorId: Types.ObjectId,
    targetUserId: Types.ObjectId
  ): Promise<void> {
    const workspace = await workspaceRepository.findById(workspaceId);

    if (!workspace) {
      throw new ApiError(HttpStatus.NOT_FOUND, Messages.WORKSPACE_NOT_FOUND);
    }

    const targetMember =
      await workspaceMemberRepository.findByWorkspaceAndUser(
        workspaceId,
        targetUserId
      );

    if (!targetMember) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        "Workspace member not found."
      );
    }

    if (
      workspace.ownerId.equals(targetUserId) ||
      targetMember.role === WorkspaceRole.OWNER
    ) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "The workspace owner cannot be removed. Ownership must be transferred first."
      );
    }

    const isSelfLeaving = actorId.equals(targetUserId);

    if (!isSelfLeaving) {
      const actorRole = await this.resolveUserRoleInWorkspace(
        workspace._id,
        actorId,
        workspace.ownerId,
        workspace.visibility
      );

      assertWorkspacePermission(
        actorRole,
        WorkspacePermission.MANAGE_MEMBERS,
        "You do not have permission to remove members from this workspace."
      );

      if (
        actorRole === WorkspaceRole.ADMIN &&
        targetMember.role === WorkspaceRole.ADMIN
      ) {
        throw new ApiError(
          HttpStatus.FORBIDDEN,
          "Only the workspace owner can remove another admin."
        );
      }
    }

    await workspaceMemberRepository.deleteByWorkspaceAndUser(
      workspaceId,
      targetUserId
    );
  }
}

export const workspaceService = new WorkspaceService();