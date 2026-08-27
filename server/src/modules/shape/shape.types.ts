import { HydratedDocument, Types } from "mongoose";

/**
 * Supported Shape Types
 */
export enum ShapeType {
  RECTANGLE = "RECTANGLE",
  CIRCLE = "CIRCLE",
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

  points?: number[];

  connector?: ShapeConnectorData;

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

  points?: number[];

  connector?: ShapeConnectorData;

  style?: Record<string, unknown>;

  createdBy: Types.ObjectId;

  version?: number;
};

/**
 * Shape Document
 */
export type ShapeDocument = HydratedDocument<Shape>;