import { HydratedDocument, Types } from "mongoose";

/**
 * Supported Shape Types
 */
export enum ShapeType {
  RECTANGLE = "RECTANGLE",
  CIRCLE = "CIRCLE",
  ELLIPSE = "ELLIPSE",
  TRIANGLE = "TRIANGLE",
  POLYGON = "POLYGON",
  STAR = "STAR",
  TEXT = "TEXT",
  LINE = "LINE",
  ARROW = "ARROW",
  IMAGE = "IMAGE",
  STICKY_NOTE = "STICKY_NOTE",
  FREEHAND = "FREEHAND",
  CONNECTOR = "CONNECTOR",
}

export type AnchorPosition = "top" | "right" | "bottom" | "left" | "center";
export type ConnectorRouting = "straight" | "orthogonal" | "curved";

export type ShapeConnectorData = {
  sourceShapeId?: Types.ObjectId | string | null;
  sourceAnchor?: AnchorPosition | null;
  targetShapeId?: Types.ObjectId | string | null;
  targetAnchor?: AnchorPosition | null;
  routing?: ConnectorRouting;
};

export type TextFontStyle = "normal" | "italic";
export type TextDecoration = "none" | "underline";
export type TextAlign = "left" | "center" | "right";
export type TextVerticalAlign = "top" | "middle" | "bottom";

export type TextStyleData = {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: TextFontStyle;
  textDecoration?: TextDecoration;
  textAlign?: TextAlign;
  verticalAlign?: TextVerticalAlign;
  fill?: string;
  opacity?: number;
  padding?: number;
  lineHeight?: number;
};

export type ShapeConfigData = {
  sides?: number;
  points?: number;
  innerRadiusRatio?: number;
};

/**
 * Shape Entity
 */
export type Shape = {
  _id: Types.ObjectId;

  canvasId: Types.ObjectId;

  type: ShapeType;

  x: number;
  y: number;

  width: number;
  height: number;

  rotation: number;

  zIndex: number;

  text?: string;

  points?: number[];

  connector?: ShapeConnectorData;

  shapeConfig?: ShapeConfigData;

  style: Record<string, unknown>;

  createdBy: Types.ObjectId;

  version: number;

  createdAt: Date;
  updatedAt: Date;
};

/**
 * Data used to create a Shape
 */
export type CreateShapeData = {
  canvasId: Types.ObjectId;

  type: ShapeType;

  x: number;
  y: number;

  width: number;
  height: number;

  rotation?: number;

  zIndex: number;

  text?: string;

  points?: number[];

  connector?: ShapeConnectorData;

  shapeConfig?: ShapeConfigData;

  style?: Record<string, unknown>;

  createdBy: Types.ObjectId;

  version?: number;
};

/**
 * Shape Document
 */
export type ShapeDocument = HydratedDocument<Shape>;