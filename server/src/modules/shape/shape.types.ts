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
}

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

  style?: Record<string, unknown>;

  createdBy: Types.ObjectId;

  version?: number;
};

/**
 * Shape Document
 */
export type ShapeDocument = HydratedDocument<Shape>;