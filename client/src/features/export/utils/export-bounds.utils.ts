import type { Shape } from "@/features/canvas/types";
import { getShapeWorldTransform } from "@/features/canvas/utils/group-geometry.utils";
import type { ExportBounds } from "../types/export.types";
import { ExportError } from "./export-validation.utils";

export type ShapePoint = {
  x: number;
  y: number;
};

/**
 * Calculates accurate world-space bounding box for a single shape,
 * factoring in its ancestor group hierarchy, rotation, and shape-specific geometries.
 */
export function calculateShapeWorldBounds(
  shape: Shape,
  shapesMap: Map<string, Shape>
): ExportBounds {
  // If the shape is a pure group container without renderable visual geometry itself,
  // its bounds are defined by its descendants. If it has width/height, we also consider it.
  const worldTransform = getShapeWorldTransform(shape, shapesMap);
  const rad = ((worldTransform.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Check if shape has custom points (e.g. line, arrow, connector, freehand)
  const hasPoints =
    "points" in shape &&
    Array.isArray(shape.points) &&
    shape.points.length >= 2;

  if (hasPoints) {
    const rawPoints = shape.points as number[];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < rawPoints.length; i += 2) {
      const px = rawPoints[i];
      const py = rawPoints[i + 1];

      // Points are defined relative to the shape origin (worldTransform.x, worldTransform.y)
      // and rotated by worldTransform.rotation
      const rotatedX = cos * px - sin * py + worldTransform.x;
      const rotatedY = sin * px + cos * py + worldTransform.y;

      minX = Math.min(minX, rotatedX);
      minY = Math.min(minY, rotatedY);
      maxX = Math.max(maxX, rotatedX);
      maxY = Math.max(maxY, rotatedY);
    }

    // Account for stroke width expansion if available
    const strokeWidth = "strokeWidth" in shape && typeof shape.strokeWidth === "number"
      ? shape.strokeWidth
      : 1;
    const halfStroke = strokeWidth / 2;

    minX -= halfStroke;
    minY -= halfStroke;
    maxX += halfStroke;
    maxY += halfStroke;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }

  // Box-based shapes: rectangle, circle, ellipse, triangle, polygon, star, text, sticky_note, group
  const w = Math.max(shape.width, 1);
  const h = Math.max(shape.height, 1);

  if ((worldTransform.rotation ?? 0) === 0) {
    return {
      minX: worldTransform.x,
      minY: worldTransform.y,
      maxX: worldTransform.x + w,
      maxY: worldTransform.y + h,
      width: w,
      height: h,
    };
  }

  // Rotated bounding box calculation
  // Local corners relative to (worldTransform.x, worldTransform.y)
  const corners: ShapePoint[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const corner of corners) {
    const rx = cos * corner.x - sin * corner.y + worldTransform.x;
    const ry = sin * corner.x + cos * corner.y + worldTransform.y;

    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/**
 * Calculates the content bounds encompassing all target shapes.
 * Guaranteed zero-safe: Throws EMPTY_CANVAS if no shapes provided or invalid coordinates.
 */
export function calculateContentBounds(
  shapes: Shape[],
  shapesMap: Map<string, Shape>
): ExportBounds {
  // Filter out pure "group" objects if they have children, because their children's world bounds
  // will represent the geometry accurately.
  const visualShapes = shapes.filter((s) => s.type !== "group");
  const targetShapes = visualShapes.length > 0 ? visualShapes : shapes;

  if (targetShapes.length === 0) {
    throw new ExportError(
      "EMPTY_CANVAS",
      "No exportable shapes found to calculate bounds."
    );
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of targetShapes) {
    const bounds = calculateShapeWorldBounds(shape, shapesMap);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    throw new ExportError(
      "INVALID_BOUNDS",
      "Calculated export bounds contain non-finite coordinate values."
    );
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/**
 * Applies uniform padding around the content bounds to produce final export bounds.
 * Does not double-count padding: Content Bounds + Padding = Final Export Bounds.
 */
export function applyExportPadding(
  contentBounds: ExportBounds,
  padding: number
): ExportBounds {
  const safePadding = Math.max(0, padding);

  return {
    minX: contentBounds.minX - safePadding,
    minY: contentBounds.minY - safePadding,
    maxX: contentBounds.maxX + safePadding,
    maxY: contentBounds.maxY + safePadding,
    width: contentBounds.width + safePadding * 2,
    height: contentBounds.height + safePadding * 2,
  };
}
