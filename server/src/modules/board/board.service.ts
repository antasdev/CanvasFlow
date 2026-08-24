import mongoose, { Types } from "mongoose";

import {
  CreateBoardDto,
  UpdateBoardDto,
} from "./board.dto";
import { boardRepository } from "./board.repository";

import { workspaceRepository } from "../workspace/workspace.repository";
import { workspaceMemberRepository } from "../workspace/workspaceMember.repository";
import {
  WorkspacePermission,
  assertWorkspacePermission,
} from "../workspace/workspace.authorization";
import { canvasService } from "../canvas/canvas.service";

import {
  CreateBoardData,
  BoardDocument,
  BoardVisibility,
} from "./board.types";
import {
  WorkspaceDocument,
  WorkspaceRole,
  WorkspaceVisibility,
} from "../workspace/workspace.types";

import {
  ApiError,
} from "@/shared/utils";

import {
  HttpStatus,
  Messages,
} from "@/shared/constants";

export class BoardService {
  async resolveUserWorkspaceRole(
    boardId: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<{
    board: BoardDocument;
    workspace: WorkspaceDocument;
    role: WorkspaceRole | null;
  }> {
    const board = await boardRepository.findById(boardId);

    if (!board || board.isArchived) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.BOARD_NOT_FOUND
      );
    }

    const workspace = await workspaceRepository.findById(board.workspaceId);

    if (!workspace) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.WORKSPACE_NOT_FOUND
      );
    }

    if (workspace.ownerId.equals(userId)) {
      return { board, workspace, role: WorkspaceRole.OWNER };
    }

    const member = await workspaceMemberRepository.findByWorkspaceAndUser(
      board.workspaceId,
      userId
    );

    return {
      board,
      workspace,
      role: member ? member.role : null,
    };
  }

  async authorizeBoardAccess(
    boardId: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<BoardDocument> {
    const board = await boardRepository.findById(boardId);

    if (!board || board.isArchived) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.BOARD_NOT_FOUND
      );
    }

    // 1. Board creator always has access
    if (board.createdBy.equals(userId)) {
      return board;
    }

    // 2. Public board is accessible
    if (board.visibility === BoardVisibility.PUBLIC) {
      return board;
    }

    // 3. Check Workspace access
    const workspace = await workspaceRepository.findById(board.workspaceId);

    if (!workspace) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.WORKSPACE_NOT_FOUND
      );
    }

    // Workspace owner has access
    if (workspace.ownerId.equals(userId)) {
      return board;
    }

    // Public workspace is accessible
    if (workspace.visibility === WorkspaceVisibility.PUBLIC) {
      return board;
    }

    // Check workspace membership
    const member = await workspaceMemberRepository.findByWorkspaceAndUser(
      board.workspaceId,
      userId
    );

    if (member) {
      return board;
    }

    throw new ApiError(
      HttpStatus.FORBIDDEN,
      "You do not have permission to access this board."
    );
  }

  async authorizeCanvasMutation(
    boardId: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<{
    board: BoardDocument;
    workspace: WorkspaceDocument;
    role: WorkspaceRole;
  }> {
    const { board, workspace, role } = await this.resolveUserWorkspaceRole(
      boardId,
      userId
    );

    if (!role) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "You do not have permission to modify this board."
      );
    }

    assertWorkspacePermission(
      role,
      WorkspacePermission.EDIT_CANVAS,
      "You do not have permission to modify this board."
    );

    return { board, workspace, role };
  }

  async createBoard(
    createdBy: Types.ObjectId,
    dto: CreateBoardDto
  ): Promise<BoardDocument> {
    // Verify workspace exists
    const workspace =
      await workspaceRepository.findById(
        dto.workspaceId
      );

    if (!workspace) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.WORKSPACE_NOT_FOUND
      );
    }

    // Verify creator has board creation rights (OWNER, ADMIN, or EDITOR; VIEWER is forbidden)
    if (!workspace.ownerId.equals(createdBy)) {
      const member =
        await workspaceMemberRepository.findByWorkspaceAndUser(
          dto.workspaceId,
          createdBy
        );

      if (!member) {
        if (workspace.visibility !== WorkspaceVisibility.PUBLIC) {
          throw new ApiError(
            HttpStatus.FORBIDDEN,
            "You do not have permission to create boards in this workspace."
          );
        }
      } else if (member.role === WorkspaceRole.VIEWER) {
        throw new ApiError(
          HttpStatus.FORBIDDEN,
          "Viewers cannot create boards in this workspace."
        );
      }
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const data: CreateBoardData = {
        workspaceId: dto.workspaceId,
        name: dto.name,
        description: dto.description,
        createdBy,
      };

      const board = await boardRepository.create(data, session);

      await canvasService.createCanvas(
        {
          boardId: board._id,
          name: "Page 1",
          backgroundColor: "#FFFFFF",
        },
        session
      );

      await session.commitTransaction();

      return board;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getBoardById(
    id: Types.ObjectId,
    userId?: Types.ObjectId
  ): Promise<BoardDocument> {
    if (userId) {
      return this.authorizeBoardAccess(id, userId);
    }

    const board = await boardRepository.findById(id);

    if (!board) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.BOARD_NOT_FOUND
      );
    }

    return board;
  }

  async getBoardsByWorkspace(
    workspaceId: Types.ObjectId,
    userId?: Types.ObjectId
  ): Promise<BoardDocument[]> {
    const workspace = await workspaceRepository.findById(workspaceId);

    if (!workspace) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.WORKSPACE_NOT_FOUND
      );
    }

    if (userId && !workspace.ownerId.equals(userId)) {
      if (workspace.visibility !== WorkspaceVisibility.PUBLIC) {
        const member =
          await workspaceMemberRepository.findByWorkspaceAndUser(
            workspaceId,
            userId
          );

        if (!member) {
          throw new ApiError(
            HttpStatus.FORBIDDEN,
            "You do not have permission to access boards in this workspace."
          );
        }
      }
    }

    return boardRepository.findByWorkspaceId(workspaceId);
  }

  async updateBoard(
    id: Types.ObjectId,
    userId: Types.ObjectId,
    dto: UpdateBoardDto
  ): Promise<BoardDocument | null> {
    const board = await boardRepository.findById(id);

    if (!board || board.isArchived) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.BOARD_NOT_FOUND
      );
    }

    // Creator can always update
    let isAllowed = board.createdBy.equals(userId);

    if (!isAllowed) {
      const workspace = await workspaceRepository.findById(board.workspaceId);
      if (workspace && workspace.ownerId.equals(userId)) {
        isAllowed = true;
      } else {
        const member =
          await workspaceMemberRepository.findByWorkspaceAndUser(
            board.workspaceId,
            userId
          );
        if (
          member &&
          (member.role === WorkspaceRole.OWNER ||
            member.role === WorkspaceRole.ADMIN ||
            member.role === WorkspaceRole.EDITOR)
        ) {
          isAllowed = true;
        }
      }
    }

    if (!isAllowed) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "You do not have permission to update this board."
      );
    }

    return boardRepository.updateById(id, dto);
  }

  async deleteBoard(
    id: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<void> {
    const board = await boardRepository.findById(id);

    if (!board || board.isArchived) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.BOARD_NOT_FOUND
      );
    }

    // Board creator can delete
    let isAllowed = board.createdBy.equals(userId);

    if (!isAllowed) {
      const workspace = await workspaceRepository.findById(board.workspaceId);
      if (workspace && workspace.ownerId.equals(userId)) {
        isAllowed = true;
      } else {
        const member =
          await workspaceMemberRepository.findByWorkspaceAndUser(
            board.workspaceId,
            userId
          );
        if (
          member &&
          (member.role === WorkspaceRole.OWNER ||
            member.role === WorkspaceRole.ADMIN)
        ) {
          isAllowed = true;
        }
      }
    }

    if (!isAllowed) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "You do not have permission to delete this board."
      );
    }

    await boardRepository.deleteById(id);
  }
}

export const boardService = new BoardService();