import { Types } from "mongoose";

import { ShapeType } from "./shape.types";

/**
 * Shape Visual Style DTO
 */
export type ShapeStyleDto = {
  // Rectangle / Generic styles
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;

  // Text / Sticky Note styles
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  textAlign?: "left" | "center" | "right";
  backgroundColor?: string;
  textColor?: string;
};

/**
 * Base Shape API Response DTO
 */
export type BaseShapeResponseDto = {
  id: string;
  canvasId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Rectangle Shape Response DTO
 */
export type RectangleShapeResponseDto = BaseShapeResponseDto & {
  type: "rectangle";
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
  };
};

/**
 * Text Shape Response DTO
 */
export type TextShapeResponseDto = BaseShapeResponseDto & {
  type: "text";
  style: {
    text: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: string | number;
    fontStyle: string;
    textAlign: "left" | "center" | "right";
    fill: string;
    opacity: number;
  };
};

/**
 * Sticky Note Shape Response DTO
 */
export type StickyNoteShapeResponseDto = BaseShapeResponseDto & {
  type: "sticky_note";
  style: {
    text: string;
    fontSize: number;
    backgroundColor: string;
    textColor: string;
    opacity: number;
  };
};

/**
 * Discriminated Union of Shape API Response DTOs
 */
export type ShapeResponseDto =
  | RectangleShapeResponseDto
  | TextShapeResponseDto
  | StickyNoteShapeResponseDto;

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
