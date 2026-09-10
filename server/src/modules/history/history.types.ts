import { HydratedDocument, Types } from "mongoose";
import {
  ShapeType,
  ShapeConnectorData,
  ShapeConfigData,
} from "@/modules/shape/shape.types";

/**
 * Trigger source for the historical version checkpoint.
 */
export type VersionTrigger = "manual" | "automatic" | "restore";

/**
 * Historical snapshot of an individual shape on a canvas page.
 * Completely self-contained and isolated from live shape documents.
 */
export type VersionShapeSnapshot = {
  id: string;
  canvasId: string;
  type: ShapeType | string;
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
  style?: Record<string, unknown>;
  createdBy: string;
  parentId?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Historical snapshot of a canvas page.
 */
export type VersionCanvasSnapshot = {
  canvasId: string;
  name: string;
  order: number;
  backgroundColor: string;
  thumbnail?: string;
  shapes: VersionShapeSnapshot[];
};

/**
 * Complete self-contained canvas snapshot for the entire board.
 */
export type VersionSnapshot = {
  canvases: VersionCanvasSnapshot[];
  shapeCount: number;
};

/**
 * Structured summary of modifications captured in this version checkpoint.
 */
export type VersionChangeSummary = {
  shapesCreated?: number;
  shapesUpdated?: number;
  shapesDeleted?: number;
  description?: string;
};

/**
 * Persistent Board Version Domain Entity.
 */
export type BoardVersion = {
  _id: Types.ObjectId;
  boardId: Types.ObjectId;
  versionNumber: number;
  name: string;
  description: string;
  trigger: VersionTrigger;
  createdBy: Types.ObjectId;
  collaborationRevision: number;
  snapshot: VersionSnapshot;
  changeSummary?: VersionChangeSummary;
  isNamed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Data payload required to persist a new BoardVersion document.
 */
export type CreateVersionData = {
  boardId: Types.ObjectId;
  versionNumber?: number;
  name?: string;
  description?: string;
  trigger?: VersionTrigger;
  createdBy: Types.ObjectId;
  collaborationRevision: number;
  snapshot: VersionSnapshot;
  changeSummary?: VersionChangeSummary;
  isNamed?: boolean;
};

/**
 * Data payload used for updating version metadata (snapshot is immutable).
 */
export type UpdateVersionMetadataData = {
  name?: string;
  description?: string;
  isNamed?: boolean;
};

/**
 * Query filter parameters for retrieving versions from repository.
 */
export type VersionFilter = {
  trigger?: VersionTrigger;
  isNamed?: boolean;
  cursor?: number;
  limit?: number;
};

/**
 * Hydrated Mongoose Document for BoardVersion.
 */
export type BoardVersionDocument = HydratedDocument<BoardVersion>;
