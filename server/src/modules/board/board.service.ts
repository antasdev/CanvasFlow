import mongoose, { Types } from "mongoose";

import {
  CreateBoardDto,
  UpdateBoardDto,
} from "./board.dto";
import { boardRepository } from "./board.repository";

import { workspaceRepository } from "../workspace/workspace.repository";
import { workspaceMemberRepository } from "../workspace/workspaceMember.repository";
import { canvasService } from "../canvas/canvas.service";

import {
  CreateBoardData,
  BoardDocument,
  BoardVisibility,
} from "./board.types";
import { WorkspaceVisibility } from "../workspace/workspace.types";

import {
  ApiError,
} from "@/shared/utils";

import {
  HttpStatus,
  Messages,
} from "@/shared/constants";

export class BoardService {
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
  async createBoard(
    createdBy: Types.ObjectId,
    dto: CreateBoardDto
  ) {
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
    id: Types.ObjectId
  ) {
    const board =
      await boardRepository.findById(id);

    if (!board) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.BOARD_NOT_FOUND
      );
    }

    return board;
  }

  async getBoardsByWorkspace(
    workspaceId: Types.ObjectId
  ) {
    return boardRepository.findByWorkspaceId(
      workspaceId
    );
  }

  async updateBoard(
    id: Types.ObjectId,
    dto: UpdateBoardDto
  ) {
    const board =
      await boardRepository.findById(id);

    if (!board) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.BOARD_NOT_FOUND
      );
    }

    return boardRepository.updateById(
      id,
      dto
    );
  }

  async deleteBoard(
    id: Types.ObjectId
  ): Promise<void> {
    const board =
      await boardRepository.findById(id);

    if (!board) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.BOARD_NOT_FOUND
      );
    }

    await boardRepository.deleteById(id);
  }
}

export const boardService =
  new BoardService();