import type { ShapeType } from "./shape.types";

export type SelectionPoint = {
  x: number;
  y: number;
};

export type SelectionMode = "replace" | "add" | "toggle";

export type MarqueeDirection = "left-to-right" | "right-to-left";

export type SelectionMatchMode = "containment" | "intersection";

export type MarqueeState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  direction: MarqueeDirection;
  matchMode: SelectionMatchMode;
};

export type LassoState = {
  points: SelectionPoint[];
};

export type SelectionInteractionState = {
  type: "idle" | "marquee" | "lasso";
  marquee: MarqueeState | null;
  lasso: LassoState | null;
};

export type PolygonGeometry = {
  kind: "polygon";
  vertices: SelectionPoint[];
};

export type PolylineGeometry = {
  kind: "polyline";
  points: SelectionPoint[];
  strokeWidth: number;
};

export type CircleGeometryData = {
  kind: "circle";
  centerX: number;
  centerY: number;
  radius: number;
};

export type EllipseGeometryData = {
  kind: "ellipse";
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
};

export type ShapeGeometryDefinition =
  | PolygonGeometry
  | PolylineGeometry
  | CircleGeometryData
  | EllipseGeometryData;

export type WorldShapeGeometry = {
  shapeId: string;
  shapeType: ShapeType;
  geometry: ShapeGeometryDefinition;
};
