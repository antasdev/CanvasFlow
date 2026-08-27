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

  // Text / Rich Text / Sticky Note styles
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  padding?: number;
  lineHeight?: number;
  backgroundColor?: string;
  textColor?: string;

  // Freehand styles / points fallback
  points?: number[];
  strokeStyle?: "solid" | "dashed";
  arrowHeadEnd?: boolean;
  arrowHeadStart?: boolean;
  pointerLength?: number;
  pointerWidth?: number;
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
  version: number;
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
  text: string;
  style: {
    fontSize: number;
    fontFamily: string;
    fontWeight: string | number;
    fontStyle: "normal" | "italic";
    textDecoration: "none" | "underline";
    textAlign: "left" | "center" | "right";
    verticalAlign: "top" | "middle" | "bottom";
    fill: string;
    opacity: number;
    padding: number;
    lineHeight: number;
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
 * Freehand Shape Response DTO
 */
export type FreehandShapeResponseDto = BaseShapeResponseDto & {
  type: "freehand";
  points: number[];
  style: {
    stroke: string;
    strokeWidth: number;
    opacity: number;
  };
};

export type ShapeConnectorDto = {
  sourceShapeId?: string | null;
  sourceAnchor?: "top" | "right" | "bottom" | "left" | "center" | null;
  targetShapeId?: string | null;
  targetAnchor?: "top" | "right" | "bottom" | "left" | "center" | null;
  routing?: "straight" | "orthogonal" | "curved";
};

/**
 * Line Shape Response DTO
 */
export type LineShapeResponseDto = BaseShapeResponseDto & {
  type: "line";
  points: number[];
  style: {
    stroke: string;
    strokeWidth: number;
    opacity: number;
    strokeStyle?: "solid" | "dashed";
  };
};

/**
 * Arrow Shape Response DTO
 */
export type ArrowShapeResponseDto = BaseShapeResponseDto & {
  type: "arrow";
  points: number[];
  style: {
    stroke: string;
    strokeWidth: number;
    opacity: number;
    arrowHeadEnd: boolean;
    arrowHeadStart?: boolean;
    pointerLength?: number;
    pointerWidth?: number;
  };
};

/**
 * Connector Shape Response DTO
 */
export type ConnectorShapeResponseDto = BaseShapeResponseDto & {
  type: "connector";
  points: number[];
  connector?: ShapeConnectorDto;
  style: {
    stroke: string;
    strokeWidth: number;
    opacity: number;
    arrowHeadEnd?: boolean;
    arrowHeadStart?: boolean;
    pointerLength?: number;
    pointerWidth?: number;
  };
};

/**
 * Discriminated Union of Shape API Response DTOs
 */
export type ShapeResponseDto =
  | RectangleShapeResponseDto
  | TextShapeResponseDto
  | StickyNoteShapeResponseDto
  | FreehandShapeResponseDto
  | LineShapeResponseDto
  | ArrowShapeResponseDto
  | ConnectorShapeResponseDto;

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
  text?: string;
  points?: number[];
  connector?: ShapeConnectorDto;
  style?: ShapeStyleDto;
};

/**
 * Shape Update DTO (Service/Internal)
 */
export type UpdateShapeDto = {
  expectedVersion?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  text?: string;
  points?: number[];
  connector?: ShapeConnectorDto;
  style?: ShapeStyleDto;
};
