import { Request, Response } from "express";
import { Types } from "mongoose";

import { canvasService } from "./canvas.service";

import {
  CreateCanvasDto,
  UpdateCanvasDto,
} from "./canvas.dto";

import {
  HttpStatus,
} from "@/shared/constants";


import {
  IdParams,
  BoardParams,
} from "@/shared/types/route-params.types";


export class CanvasController {


  async createCanvas(
    req: Request,
    res: Response
  ): Promise<void> {

    const result =
      await canvasService.createCanvas(
        req.body as CreateCanvasDto
      );


    res
      .status(HttpStatus.CREATED)
      .json({
        success: true,
        data: result,
      });
  }



  async getCanvas(
    req: Request<IdParams>,
    res: Response
  ): Promise<void> {

    const result =
      await canvasService.getCanvasById(
        new Types.ObjectId(
          req.params.id
        )
      );


    res
      .status(HttpStatus.OK)
      .json({
        success: true,
        data: result,
      });
  }



  async getBoardCanvases(
    req: Request<BoardParams>,
    res: Response
  ): Promise<void> {

    const result =
      await canvasService.getBoardCanvases(
        new Types.ObjectId(
          req.params.boardId
        )
      );


    res
      .status(HttpStatus.OK)
      .json({
        success: true,
        data: result,
      });
  }



  async updateCanvas(
    req: Request<IdParams>,
    res: Response
  ): Promise<void> {

    const result =
      await canvasService.updateCanvas(
        new Types.ObjectId(
          req.params.id
        ),
        req.body as UpdateCanvasDto
      );


    res
      .status(HttpStatus.OK)
      .json({
        success: true,
        data: result,
      });
  }



  async deleteCanvas(
    req: Request<IdParams>,
    res: Response
  ): Promise<void> {

    await canvasService.deleteCanvas(
      new Types.ObjectId(
        req.params.id
      )
    );


    res
      .status(HttpStatus.OK)
      .json({
        success: true,
        message:
          "Canvas deleted successfully.",
      });
  }

}


export const canvasController =
  new CanvasController();