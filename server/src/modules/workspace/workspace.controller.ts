import { Request, Response } from "express";
import { Types } from "mongoose";

import { workspaceService } from "./workspace.service";
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
} from "./workspace.dto";

import { HttpStatus } from "@/shared/constants/http-status";
import { IdParams } from "@/shared/types/route-params.types";

export class WorkspaceController {
  async createWorkspace(
    req: Request,
    res: Response
  ): Promise<void> {
    const result = await workspaceService.createWorkspace(
      new Types.ObjectId(req.user.userId),
      req.body as CreateWorkspaceDto
    );

    res.status(HttpStatus.CREATED).json({
      success: true,
      data: result,
    });
  }

  async getWorkspace(
  req: Request<IdParams>,
  res: Response
): Promise<void> {
    const result = await workspaceService.getWorkspaceById(
      new Types.ObjectId(req.params.id)
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
    });
  }

  async getUserWorkspaces(
    req: Request,
    res: Response
  ): Promise<void> {
    const result = await workspaceService.getUserWorkspaces(
      new Types.ObjectId(req.user.userId)
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
    });
  }

  async updateWorkspace(
  req: Request<IdParams>,
  res: Response
): Promise<void> {
    const result = await workspaceService.updateWorkspace(
      new Types.ObjectId(req.params.id),
      req.body as UpdateWorkspaceDto
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
    });
  }

  async deleteWorkspace(
  req: Request<IdParams>,
  res: Response
): Promise<void> {
    await workspaceService.deleteWorkspace(
      new Types.ObjectId(req.params.id)
    );

    res.status(HttpStatus.OK).json({
      success: true,
      message: "Workspace deleted successfully.",
    });
  }
}

export const workspaceController =
  new WorkspaceController();