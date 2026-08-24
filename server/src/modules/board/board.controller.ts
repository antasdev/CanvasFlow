import { Request, Response } from "express";
import { Types } from "mongoose";

import { boardService } from "./board.service";
import {
  CreateBoardDto,
  UpdateBoardDto,
} from "./board.dto";

import { HttpStatus } from "@/shared/constants";
import {
  IdParams,
} from "@/shared/types/route-params.types";

export class BoardController {
  async createBoard(
    req: Request,
    res: Response
  ): Promise<void> {
    const dto: CreateBoardDto = {
      ...req.body,
      workspaceId: new Types.ObjectId(
        req.body.workspaceId
      ),
    };

    const result =
      await boardService.createBoard(
        new Types.ObjectId(req.user.userId),
        dto
      );

    res.status(HttpStatus.CREATED).json({
      success: true,
      data: result,
    });
  }

  async getBoard(
    req: Request<IdParams>,
    res: Response
  ): Promise<void> {
    const result =
      await boardService.getBoardById(
        new Types.ObjectId(req.params.id),
        new Types.ObjectId(req.user.userId)
      );

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
    });
  }

  async getBoardsByWorkspace(
    req: Request<{ workspaceId: string }>,
    res: Response
  ): Promise<void> {
    const result =
      await boardService.getBoardsByWorkspace(
        new Types.ObjectId(
          req.params.workspaceId
        ),
        new Types.ObjectId(req.user.userId)
      );

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
    });
  }

  async updateBoard(
    req: Request<IdParams>,
    res: Response
  ): Promise<void> {
    const result =
      await boardService.updateBoard(
        new Types.ObjectId(req.params.id),
        new Types.ObjectId(req.user.userId),
        req.body as UpdateBoardDto
      );

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
    });
  }

  async deleteBoard(
    req: Request<IdParams>,
    res: Response
  ): Promise<void> {
    await boardService.deleteBoard(
      new Types.ObjectId(req.params.id),
      new Types.ObjectId(req.user.userId)
    );

    res.status(HttpStatus.OK).json({
      success: true,
      message:
        "Board deleted successfully.",
    });
  }
}

export const boardController =
  new BoardController();