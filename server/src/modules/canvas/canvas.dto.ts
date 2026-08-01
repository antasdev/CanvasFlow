import { Types } from "mongoose";

/**
 * Canvas DTOs
 */

export type CreateCanvasDto = {
  boardId: Types.ObjectId;

  name: string;

  backgroundColor?: string;
};


export type UpdateCanvasDto = {
  name?: string;

  backgroundColor?: string;
};