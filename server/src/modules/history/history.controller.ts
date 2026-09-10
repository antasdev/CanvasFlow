import { Request, Response } from "express";
import { Types } from "mongoose";
import { HttpStatus } from "@/shared/constants";
import { historyService } from "./history.service";
import {
  CreateManualVersionDto,
  UpdateVersionMetadataDto,
  VersionFilterDto,
} from "./history.dto";
import { VersionTrigger } from "./history.types";

export class HistoryController {
  /**
   * Create Manual Named Version Checkpoint
   * POST /api/v1/boards/:boardId/versions
   */
  async createManualVersion(req: Request, res: Response): Promise<void> {
    const userId = new Types.ObjectId(req.user!.userId);
    const boardId = new Types.ObjectId(req.params.boardId as string);

    const dto: CreateManualVersionDto = {
      name: req.body?.name,
      description: req.body?.description,
    };

    const version = await historyService.createManualVersion(
      boardId,
      userId,
      dto
    );

    res.status(HttpStatus.CREATED).json({
      success: true,
      data: version,
    });
  }

  /**
   * List Versions for a Board (paginated summaries)
   * GET /api/v1/boards/:boardId/versions
   */
  async getBoardVersions(req: Request, res: Response): Promise<void> {
    const userId = new Types.ObjectId(req.user!.userId);
    const boardId = new Types.ObjectId(req.params.boardId as string);

    const filterDto: VersionFilterDto = {
      trigger: req.query.trigger as VersionTrigger | undefined,
      isNamed:
        req.query.isNamed === "true"
          ? true
          : req.query.isNamed === "false"
          ? false
          : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor ? Number(req.query.cursor) : undefined,
    };

    const result = await historyService.getBoardVersions(
      boardId,
      userId,
      filterDto
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: result.versions,
      pagination: {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        totalCount: result.totalCount,
      },
    });
  }

  /**
   * Get Single Version with Complete Historical Snapshot
   * GET /api/v1/boards/:boardId/versions/:versionId
   */
  async getVersionById(req: Request, res: Response): Promise<void> {
    const userId = new Types.ObjectId(req.user!.userId);
    const boardId = new Types.ObjectId(req.params.boardId as string);
    const versionId = new Types.ObjectId(req.params.versionId as string);

    const version = await historyService.getVersionById(
      boardId,
      versionId,
      userId
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: version,
    });
  }

  /**
   * Update Version Metadata (name / description)
   * PATCH /api/v1/boards/:boardId/versions/:versionId
   */
  async updateVersionMetadata(req: Request, res: Response): Promise<void> {
    const userId = new Types.ObjectId(req.user!.userId);
    const boardId = new Types.ObjectId(req.params.boardId as string);
    const versionId = new Types.ObjectId(req.params.versionId as string);

    const dto: UpdateVersionMetadataDto = {
      name: req.body?.name,
      description: req.body?.description,
    };

    const updated = await historyService.updateVersionMetadata(
      boardId,
      versionId,
      userId,
      dto
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: updated,
    });
  }
}

export const historyController = new HistoryController();
