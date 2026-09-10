import { ClientSession, Types } from "mongoose";
import { boardService } from "@/modules/board";
import { UserModel } from "@/modules/user/user.model";
import { ApiError } from "@/shared/utils";
import { HttpStatus } from "@/shared/constants";
import { historyRepository } from "./history.repository";
import { HistoryMapper } from "./history.mapper";
import { SnapshotBuilder } from "./pipeline/history.snapshot";
import {
  CreateManualVersionDto,
  PaginatedVersionsResponseDto,
  UpdateVersionMetadataDto,
  VersionAuthorDto,
  VersionFilterDto,
  VersionResponseDto,
} from "./history.dto";
import {
  BoardVersionDocument,
  VersionSnapshot,
} from "./history.types";

export class HistoryService {
  /**
   * Helper to build a VersionAuthorDto from a User document.
   */
  private buildAuthorDto(user: {
    _id: Types.ObjectId | string;
    fullName: string;
    email?: string;
    profile?: { avatar?: string };
  }): VersionAuthorDto {
    return {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      avatar: user.profile?.avatar,
    };
  }

  /**
   * Batch fetches authors for an array of version documents.
   */
  private async populateAuthorsForVersions(
    versions: BoardVersionDocument[]
  ): Promise<Map<string, VersionAuthorDto>> {
    const authorMap = new Map<string, VersionAuthorDto>();
    const authorIds = Array.from(
      new Set(versions.map((v) => v.createdBy.toString()))
    );

    if (authorIds.length === 0) {
      return authorMap;
    }

    const users = await UserModel.find({
      _id: { $in: authorIds.map((id) => new Types.ObjectId(id)) },
    });

    for (const user of users) {
      authorMap.set(user._id.toString(), this.buildAuthorDto(user));
    }

    return authorMap;
  }

  /**
   * Captures an authoritative, self-contained snapshot of all canvases and shapes for a board.
   */
  async captureBoardSnapshot(
    boardId: Types.ObjectId,
    session?: ClientSession
  ): Promise<VersionSnapshot> {
    return SnapshotBuilder.buildBoardSnapshot(boardId, session);
  }

  /**
   * Creates a manual named version checkpoint for a board.
   * Requires EDIT_CANVAS permission.
   */
  async createManualVersion(
    boardId: Types.ObjectId,
    userId: Types.ObjectId,
    dto?: CreateManualVersionDto,
    session?: ClientSession
  ): Promise<VersionResponseDto> {
    // 1. Authorize canvas mutation rights (OWNER, ADMIN, EDITOR allowed; VIEWER forbidden)
    const { board } = await boardService.authorizeCanvasMutation(
      boardId,
      userId
    );

    // 2. Capture authoritative canvas and shape snapshot
    const snapshot = await this.captureBoardSnapshot(boardId, session);

    // 3. Determine name and isNamed flag
    const trimmedName = dto?.name?.trim();
    const isNamed = Boolean(trimmedName && trimmedName.length > 0);
    const name = isNamed ? (trimmedName as string) : "";
    const description = dto?.description?.trim() ?? "";

    // 4. Persist version document via repository with atomic numbering retry safety
    const versionDoc = await historyRepository.create(
      {
        boardId,
        versionNumber: 0, // 0 tells repository to allocate highest + 1 atomically
        name,
        description,
        trigger: "manual",
        createdBy: userId,
        collaborationRevision: board.collaborationRevision ?? 0,
        snapshot,
        isNamed,
      },
      session
    );

    // 5. Lookup author details
    const userDoc = await UserModel.findById(userId);
    const authorDto = userDoc ? this.buildAuthorDto(userDoc) : undefined;

    return HistoryMapper.toResponseDto(versionDoc, authorDto);
  }

  /**
   * Retrieves a paginated list of version summaries for a board.
   * Requires board access.
   */
  async getBoardVersions(
    boardId: Types.ObjectId,
    userId: Types.ObjectId,
    filterDto: VersionFilterDto = {},
    session?: ClientSession
  ): Promise<PaginatedVersionsResponseDto> {
    // 1. Authorize board access
    await boardService.authorizeBoardAccess(boardId, userId);

    const limit = Math.min(Math.max(filterDto.limit ?? 20, 1), 100);

    // 2. Query repository
    const { versions, totalCount } = await historyRepository.listByBoard(
      boardId,
      {
        trigger: filterDto.trigger,
        isNamed: filterDto.isNamed,
        cursor: filterDto.cursor,
        limit,
      },
      session
    );

    const hasMore = versions.length > limit;
    const slicedVersions = hasMore ? versions.slice(0, limit) : versions;
    const nextCursor =
      hasMore && slicedVersions.length > 0
        ? slicedVersions[slicedVersions.length - 1].versionNumber
        : undefined;

    // 3. Batch populate authors
    const authorMap = await this.populateAuthorsForVersions(slicedVersions);

    const summaryDtos = slicedVersions.map((v) =>
      HistoryMapper.toSummaryDto(v, authorMap.get(v.createdBy.toString()))
    );

    return {
      versions: summaryDtos,
      nextCursor,
      hasMore,
      totalCount,
    };
  }

  /**
   * Retrieves a full version record by ID, including its complete snapshot.
   * Requires board access.
   */
  async getVersionById(
    boardId: Types.ObjectId,
    versionId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<VersionResponseDto> {
    // 1. Authorize board access
    await boardService.authorizeBoardAccess(boardId, userId);

    // 2. Fetch version document
    const version = await historyRepository.findById(versionId, session);

    if (!version || !version.boardId.equals(boardId)) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Version not found.");
    }

    // 3. Fetch author details
    const userDoc = await UserModel.findById(version.createdBy);
    const authorDto = userDoc ? this.buildAuthorDto(userDoc) : undefined;

    return HistoryMapper.toResponseDto(version, authorDto);
  }

  /**
   * Updates version metadata (name/description).
   * Enforces strict snapshot immutability.
   * Requires EDIT_CANVAS permission.
   */
  async updateVersionMetadata(
    boardId: Types.ObjectId,
    versionId: Types.ObjectId,
    userId: Types.ObjectId,
    dto: UpdateVersionMetadataDto,
    session?: ClientSession
  ): Promise<VersionResponseDto> {
    // 1. Authorize canvas mutation rights
    await boardService.authorizeCanvasMutation(boardId, userId);

    // 2. Verify version exists and belongs to board
    const existing = await historyRepository.findById(versionId, session);

    if (!existing || !existing.boardId.equals(boardId)) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Version not found.");
    }

    // 3. Prepare metadata updates
    const updates: { name?: string; description?: string; isNamed?: boolean } =
      {};

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      updates.name = trimmed;
      updates.isNamed = trimmed.length > 0;
    }

    if (dto.description !== undefined) {
      updates.description = dto.description.trim();
    }

    // 4. Update metadata in repository (snapshot remains unchanged)
    const updated = await historyRepository.updateMetadata(
      versionId,
      boardId,
      updates,
      session
    );

    if (!updated) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Version not found.");
    }

    // 5. Fetch author details
    const userDoc = await UserModel.findById(updated.createdBy);
    const authorDto = userDoc ? this.buildAuthorDto(userDoc) : undefined;

    return HistoryMapper.toResponseDto(updated, authorDto);
  }
}

export const historyService = new HistoryService();
