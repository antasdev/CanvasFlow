import { Types } from "mongoose";

import { ShapeType } from "./shape.types";

/**
 * Shape DTOs
 */

export type CreateShapeDto = {
  canvasId: Types.ObjectId;

  type: ShapeType;

  x: number;
  y: number;

  width: number;
  height: number;

  rotation?: number;

  style?: Record<string, unknown>;
};

export type UpdateShapeDto = {
  x?: number;
  y?: number;

  width?: number;
  height?: number;

  rotation?: number;

  style?: Record<string, unknown>;
};