import { Types } from "mongoose";

import {
  CreateCanvasDto,
  UpdateCanvasDto,
} from "./canvas.dto";

import {
  CreateCanvasData,
} from "./canvas.types";

import {
  canvasRepository,
} from "./canvas.repository";

import {
  boardRepository,
} from "../board/board.repository";

import {
  ApiError,
} from "@/shared/utils";

import {
  HttpStatus,
  Messages,
} from "@/shared/constants";


export class CanvasService {

  async createCanvas(
    dto: CreateCanvasDto
  ) {

    const board =
      await boardRepository.findById(
        dto.boardId
      );


    if (!board) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.BOARD_NOT_FOUND
      );
    }


    const lastOrder =
      await canvasRepository.findLastOrder(
        dto.boardId
      );


    const canvasData: CreateCanvasData = {
      boardId: dto.boardId,

      name: dto.name,

      order: lastOrder + 1,

      backgroundColor:
        dto.backgroundColor ?? "#FFFFFF",
    };


    return canvasRepository.create(
      canvasData
    );
  }


  async getCanvasById(
    id: Types.ObjectId
  ) {

    const canvas =
      await canvasRepository.findById(
        id
      );


    if (!canvas) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.CANVAS_NOT_FOUND
      );
    }


    return canvas;
  }


  async getBoardCanvases(
    boardId: Types.ObjectId
  ) {

    return canvasRepository.findByBoardId(
      boardId
    );
  }


  async updateCanvas(
    id: Types.ObjectId,
    dto: UpdateCanvasDto
  ) {

    const canvas =
      await canvasRepository.findById(
        id
      );


    if (!canvas) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.CANVAS_NOT_FOUND
      );
    }


    return canvasRepository.updateById(
      id,
      dto
    );
  }


  async deleteCanvas(
    id: Types.ObjectId
  ): Promise<void> {

    const canvas =
      await canvasRepository.findById(
        id
      );


    if (!canvas) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.CANVAS_NOT_FOUND
      );
    }


    await canvasRepository.deleteById(
      id
    );
  }
}


export const canvasService =
  new CanvasService();