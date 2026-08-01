import { HydratedDocument, Types } from "mongoose";

/**
 * Canvas Entity
 */
export type Canvas = {
  _id: Types.ObjectId;

  boardId: Types.ObjectId;

  name: string;

  /**
   * Position of the page within the board.
   */
  order: number;

  backgroundColor: string;

  thumbnail?: string;

  createdAt: Date;
  updatedAt: Date;
};

/**
 * Data used to create a canvas.
 */
export type CreateCanvasData = {
  boardId: Types.ObjectId;

  name: string;

  order: number;

  backgroundColor?: string;
};

/**
 * Canvas Document
 */
export type CanvasDocument =
  HydratedDocument<Canvas>;