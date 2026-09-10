import crypto from "crypto";
import { ClientSession, Types } from "mongoose";
import { boardRepository, boardService } from "@/modules/board";
import { CanvasModel, canvasRepository } from "@/modules/canvas";
import {
  CreateShapeData,
  ShapeConfigData,
  ShapeMapper,
  ShapeModel,
  shapeService,
  ShapeType,
} from "@/modules/shape";
import { UserModel } from "@/modules/user/user.model";
import { mutationService } from "@/modules/mutation";
import { collaborationVersionService } from "@/socket/services/collaboration-version.service";
import { getBoardRoom, getIO, SocketEvents } from "@/socket";
import { ApiError } from "@/shared/utils";
import { HttpStatus } from "@/shared/constants";
import { historyRepository } from "./history.repository";
import { HistoryMapper } from "./history.mapper";
import { SnapshotBuilder } from "./pipeline/history.snapshot";
import {
  CreateManualVersionDto,
  PaginatedVersionsResponseDto,
  RestoreVersionDto,
  RestoreVersionResponseDto,
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

  /**
   * Restores a historical version checkpoint.
   * Atomically replaces the authoritative document state with the snapshot,
   * advances the board collaboration revision, records the mutation,
   * generates a new BoardVersion checkpoint, and broadcasts CANVAS_SYNC.
   * Enforces strict OCC and RBAC boundaries.
   */
  async restoreVersion(
    boardId: Types.ObjectId,
    versionId: Types.ObjectId,
    userId: Types.ObjectId,
    dto?: RestoreVersionDto
  ): Promise<RestoreVersionResponseDto> {
    // 1. Authorize canvas mutation rights (OWNER, ADMIN, EDITOR allowed; VIEWER forbidden)
    const { board } = await boardService.authorizeCanvasMutation(
      boardId,
      userId
    );

    // 2. Fetch the target historical version (strictly scoped by boardId)
    const historicalVersion = await historyRepository.findById(versionId);

    if (!historicalVersion || !historicalVersion.boardId.equals(boardId)) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Version not found.");
    }

    const mutationId = dto?.mutationId ?? crypto.randomUUID();
    const idempotencyPayload = {
      versionId: versionId.toString(),
      versionNumber: historicalVersion.versionNumber,
      expectedCollaborationRevision: dto?.expectedCollaborationRevision,
    };

    // 3. Execute atomic document replacement and revision increment
    const { result, meta } = await collaborationVersionService.executeWithRevision(
      boardId,
      userId,
      "system:restore",
      async (session?: ClientSession) => {
        // a. Optimistic Concurrency Control (OCC) Check inside atomic session
        if (dto?.expectedCollaborationRevision !== undefined) {
          const currentBoard = await boardRepository.findById(boardId, session);
          if (
            currentBoard &&
            currentBoard.collaborationRevision !== dto.expectedCollaborationRevision
          ) {
            throw new ApiError(
              HttpStatus.CONFLICT,
              "Collaboration revision conflict: board has been modified by another collaborator.",
              "OCC_CONFLICT"
            );
          }
        }

        // b. Retrieve current canvases for this board
        const existingCanvases = await canvasRepository.findByBoardId(
          boardId,
          session
        );
        const existingCanvasIds = existingCanvases.map((c) => c._id);

        // b. Remove all existing shapes on this board's canvases
        if (existingCanvasIds.length > 0) {
          await ShapeModel.deleteMany(
            { canvasId: { $in: existingCanvasIds } },
            { session }
          );
        }

        // c. Reconstruct canvases from snapshot
        const snapshotCanvases = historicalVersion.snapshot?.canvases ?? [];
        const snapshotCanvasIds = new Set<string>();

        for (const snapCanvas of snapshotCanvases) {
          snapshotCanvasIds.add(snapCanvas.canvasId);
          const canvasObjectId = new Types.ObjectId(snapCanvas.canvasId);
          const existing = existingCanvases.find((c) =>
            c._id.equals(canvasObjectId)
          );

          const canvasOrder =
            typeof snapCanvas.order === "number" && snapCanvas.order >= 1
              ? snapCanvas.order
              : 1;

          if (existing) {
            await CanvasModel.findByIdAndUpdate(
              canvasObjectId,
              {
                name: snapCanvas.name,
                order: canvasOrder,
                backgroundColor: snapCanvas.backgroundColor ?? "#FFFFFF",
                thumbnail: snapCanvas.thumbnail,
              },
              { session }
            );
          } else {
            await CanvasModel.create(
              [
                {
                  _id: canvasObjectId,
                  boardId,
                  name: snapCanvas.name,
                  order: canvasOrder,
                  backgroundColor: snapCanvas.backgroundColor ?? "#FFFFFF",
                  thumbnail: snapCanvas.thumbnail,
                },
              ],
              { session }
            );
          }
        }

        // Delete any extraneous canvases that did not exist in the snapshot
        for (const existing of existingCanvases) {
          if (!snapshotCanvasIds.has(existing._id.toString())) {
            await CanvasModel.findByIdAndDelete(existing._id, { session });
          }
        }

        // d. Reconstruct shapes from snapshot
        const shapesToInsert: (CreateShapeData & { _id: Types.ObjectId })[] = [];

        for (const snapCanvas of snapshotCanvases) {
          const canvasObjectId = new Types.ObjectId(snapCanvas.canvasId);

          for (const snapShape of snapCanvas.shapes) {
            const shapeObjectId = new Types.ObjectId(snapShape.id);
            const parentId = snapShape.parentId
              ? new Types.ObjectId(snapShape.parentId)
              : null;
            const createdBy = snapShape.createdBy
              ? new Types.ObjectId(snapShape.createdBy)
              : userId;

            const connector = snapShape.connector
              ? {
                  sourceShapeId: snapShape.connector.sourceShapeId
                    ? new Types.ObjectId(snapShape.connector.sourceShapeId)
                    : null,
                  sourceAnchor: snapShape.connector.sourceAnchor ?? null,
                  targetShapeId: snapShape.connector.targetShapeId
                    ? new Types.ObjectId(snapShape.connector.targetShapeId)
                    : null,
                  targetAnchor: snapShape.connector.targetAnchor ?? null,
                  routing: snapShape.connector.routing ?? "straight",
                }
              : undefined;

            shapesToInsert.push({
              _id: shapeObjectId,
              canvasId: canvasObjectId,
              type: snapShape.type as ShapeType,
              x: snapShape.x,
              y: snapShape.y,
              width: snapShape.width,
              height: snapShape.height,
              rotation: snapShape.rotation ?? 0,
              zIndex: snapShape.zIndex ?? 0,
              text: snapShape.text,
              points: snapShape.points,
              connector,
              shapeConfig: snapShape.shapeConfig as ShapeConfigData | undefined,
              style: snapShape.style ?? {},
              createdBy,
              parentId,
              version: 1, // Fresh OCC generation for restored shapes
            });
          }
        }

        if (shapesToInsert.length > 0) {
          await ShapeModel.insertMany(shapesToInsert, { session, ordered: true });
        }

        return {
          restoredFromVersionId: versionId.toString(),
          restoredFromVersionNumber: historicalVersion.versionNumber,
        };
      },
      mutationId,
      "version:restore",
      idempotencyPayload
    );

    // 4. Handle Idempotent Replay (Zero duplicate side-effects)
    if (meta.isIdempotentReplay) {
      const latestVersion = await historyRepository.findLatestByBoard(boardId);
      const newVersionSummary = latestVersion
        ? HistoryMapper.toSummaryDto(latestVersion)
        : HistoryMapper.toSummaryDto(historicalVersion);

      return {
        restoredVersionId:
          result?.restoredFromVersionId ?? versionId.toString(),
        restoredVersionNumber:
          result?.restoredFromVersionNumber ?? historicalVersion.versionNumber,
        newVersion: newVersionSummary,
        collaborationRevision: meta.revision,
      };
    }

    // 5. Post-commit: Capture committed restored state into a NEW BoardVersion document
    const committedSnapshot = await SnapshotBuilder.buildBoardSnapshot(boardId);
    const restoreDescription =
      dto?.description?.trim() ||
      `Restored from Version ${historicalVersion.versionNumber}${
        historicalVersion.name ? ` (${historicalVersion.name})` : ""
      }`;

    const newVersionDoc = await historyRepository.create({
      boardId,
      versionNumber: 0, // Concurrency-safe monotonic allocation
      name: `Restored from Version ${historicalVersion.versionNumber}`,
      description: restoreDescription,
      trigger: "restore",
      createdBy: userId,
      collaborationRevision: meta.revision,
      snapshot: committedSnapshot,
      changeSummary: {
        description: `Restored from Version ${historicalVersion.versionNumber}`,
      },
      isNamed: true,
    });

    // 7. Broadcast CANVAS_SYNC to connected collaborators in the board room
    try {
      const io = getIO();
      if (io) {
        const room = getBoardRoom(boardId.toString());

        for (const canvasSnap of committedSnapshot.canvases) {
          const shapes = await shapeService.getCanvasShapes(
            new Types.ObjectId(canvasSnap.canvasId)
          );
          const shapeDtos = shapes.map((s) => ShapeMapper.toResponseDto(s));

          io.to(room).emit(SocketEvents.CANVAS_SYNC, {
            boardId: boardId.toString(),
            canvasId: canvasSnap.canvasId,
            shapes: shapeDtos,
          });
        }
      }
    } catch {
      // Non-blocking broadcast error in standalone/test environments without initialized socket server
    }

    const newVersionSummary = HistoryMapper.toSummaryDto(newVersionDoc);

    const finalResponse: RestoreVersionResponseDto = {
      restoredVersionId: result.restoredFromVersionId,
      restoredVersionNumber: result.restoredFromVersionNumber,
      newVersion: newVersionSummary,
      collaborationRevision: meta.revision,
    };

    if (dto?.mutationId) {
      await mutationService.completeMutation(
        userId,
        boardId,
        mutationId,
        finalResponse,
        meta.eventId ?? "",
        meta.revision
      );
    }

    return finalResponse;
  }
}

export const historyService = new HistoryService();
