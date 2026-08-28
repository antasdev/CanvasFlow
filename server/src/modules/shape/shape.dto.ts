import { Types } from "mongoose";

import { ShapeType, ShapeConfigData, StrokeStyle } from "./shape.types";

export type ShapeShadowDto = {
  enabled?: boolean;
  color?: string;
  blur?: number;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
};

export type ShapeAppearanceStyleDto = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  opacity?: number;
  shadow?: ShapeShadowDto;
};

/**
 * Shape Visual Style DTO
 */
export type ShapeStyleDto = ShapeAppearanceStyleDto & {
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
  parentId?: string | null;
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
    strokeStyle?: StrokeStyle;
    opacity: number;
    shadow?: ShapeShadowDto;
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
    shadow?: ShapeShadowDto;
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
    shadow?: ShapeShadowDto;
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
    strokeStyle?: StrokeStyle;
    opacity: number;
    shadow?: ShapeShadowDto;
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
    strokeStyle?: StrokeStyle;
    shadow?: ShapeShadowDto;
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
    strokeStyle?: StrokeStyle;
    shadow?: ShapeShadowDto;
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
    strokeStyle?: StrokeStyle;
    shadow?: ShapeShadowDto;
    arrowHeadEnd?: boolean;
    arrowHeadStart?: boolean;
    pointerLength?: number;
    pointerWidth?: number;
  };
};

/**
 * Circle Shape Response DTO
 */
export type CircleShapeResponseDto = BaseShapeResponseDto & {
  type: "circle";
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    opacity: number;
    shadow?: ShapeShadowDto;
  };
};

/**
 * Ellipse Shape Response DTO
 */
export type EllipseShapeResponseDto = BaseShapeResponseDto & {
  type: "ellipse";
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    opacity: number;
    shadow?: ShapeShadowDto;
  };
};

/**
 * Triangle Shape Response DTO
 */
export type TriangleShapeResponseDto = BaseShapeResponseDto & {
  type: "triangle";
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    opacity: number;
    shadow?: ShapeShadowDto;
  };
};

/**
 * Polygon Shape Response DTO
 */
export type PolygonShapeResponseDto = BaseShapeResponseDto & {
  type: "polygon";
  shapeConfig: {
    sides: number;
  };
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    opacity: number;
    shadow?: ShapeShadowDto;
  };
};

/**
 * Star Shape Response DTO
 */
export type StarShapeResponseDto = BaseShapeResponseDto & {
  type: "star";
  shapeConfig: {
    points: number;
    innerRadiusRatio: number;
  };
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    opacity: number;
    shadow?: ShapeShadowDto;
  };
};

/**
 * Group Shape Response DTO
 */
export type GroupShapeResponseDto = BaseShapeResponseDto & {
  type: "group";
  style?: Record<string, unknown>;
};

/**
 * Discriminated Union of Shape API Response DTOs
 */
export type ShapeResponseDto =
  | RectangleShapeResponseDto
  | CircleShapeResponseDto
  | EllipseShapeResponseDto
  | TriangleShapeResponseDto
  | PolygonShapeResponseDto
  | StarShapeResponseDto
  | TextShapeResponseDto
  | StickyNoteShapeResponseDto
  | FreehandShapeResponseDto
  | LineShapeResponseDto
  | ArrowShapeResponseDto
  | ConnectorShapeResponseDto
  | GroupShapeResponseDto;

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
  shapeConfig?: ShapeConfigData;
  style?: ShapeStyleDto;
  parentId?: Types.ObjectId | null;
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
  shapeConfig?: ShapeConfigData;
  style?: ShapeStyleDto;
  parentId?: Types.ObjectId | null;
};

/**
 * Group Shapes DTO (Service/Internal)
 */
export type GroupShapesDto = {
  canvasId: Types.ObjectId;
  shapeIds: Types.ObjectId[];
  expectedVersions?: Record<string, number>;
};

/**
 * Ungroup Shape DTO (Service/Internal)
 */
export type UngroupShapeDto = {
  canvasId: Types.ObjectId;
  groupId: Types.ObjectId;
  expectedVersion?: number;
};
