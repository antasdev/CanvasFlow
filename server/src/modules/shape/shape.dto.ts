import { Types } from "mongoose";

import { ShapeType } from "./shape.types";

/**
 * Shape Visual Style DTO
 */
export type ShapeStyleDto = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
};

/**
 * Shape API Response DTO
 */
export type ShapeResponseDto = {
  id: string;
  canvasId: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Shape Creation DTO (Service/Internal)
 */
export type CreateShapeDto = {
  canvasId: Types.ObjectId;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  style?: ShapeStyleDto;
};

/**
 * Shape Update DTO (Service/Internal)
 */
export type UpdateShapeDto = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  style?: ShapeStyleDto;
};
