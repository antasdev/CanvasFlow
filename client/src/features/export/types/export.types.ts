import type { Shape } from "@/features/canvas/types";

export type ExportFormat = "png" | "jpeg" | "svg" | "pdf";

export type ExportScope = "canvas" | "selection" | "viewport";

export type ExportBackground = "transparent" | "canvas" | "solid";

export type ExportBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export type ExportDimensions = {
  width: number;
  height: number;
};

export type ExportViewport = {
  zoom: number;
  pan: {
    x: number;
    y: number;
  };
  screenWidth: number;
  screenHeight: number;
};

export type ExportOptions = {
  format: ExportFormat;
  scope: ExportScope;
  scale?: number;
  background?: ExportBackground;
  backgroundColor?: string;
  quality?: number;
  padding?: number;
  selectedShapeIds?: string[];
  viewport?: ExportViewport;
};

export type ExportPreparedShape = {
  id: string;
  type: Shape["type"];
  shape: Shape;
  worldX: number;
  worldY: number;
  normalizedX: number;
  normalizedY: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  parentId?: string | null;
  points?: number[];
  normalizedPoints?: number[];
};

export type ExportPreparedScene = {
  format: ExportFormat;
  scope: ExportScope;
  scale: number;
  quality: number;
  padding: number;
  background: {
    mode: ExportBackground;
    color: string;
  };
  contentBounds: ExportBounds;
  finalBounds: ExportBounds;
  logicalDimensions: ExportDimensions;
  pixelDimensions: ExportDimensions;
  shapes: ExportPreparedShape[];
  metadata: {
    shapeCount: number;
    totalInputShapes: number;
    timestamp: number;
    isSelection: boolean;
    isViewport: boolean;
  };
};

export type ExportErrorCode =
  | "INVALID_EXPORT_OPTIONS"
  | "UNSUPPORTED_FORMAT"
  | "EMPTY_CANVAS"
  | "INVALID_BOUNDS"
  | "EXPORT_TOO_LARGE";
