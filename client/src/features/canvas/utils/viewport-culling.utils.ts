import type { Shape } from "../types";
import { getShapeWorldTransform } from "./group-geometry.utils";

export interface ViewportWorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface ShapeAABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface ViewportCullingOptions {
  margin?: number;
  selectedShapeIds?: string[];
}

/**
 * Default overscan margin in screen pixels.
 * 100px provides a smooth pan cushion without premature edge clipping or popping.
 */
export const DEFAULT_VIEWPORT_CULLING_MARGIN = 100;

/**
 * Calculates the visible viewport rectangle converted into world coordinates,
 * expanded by an overscan margin in screen space.
 */
export function getViewportWorldBounds(
  size: { width: number; height: number },
  pan: { x: number; y: number },
  zoom: number,
  margin: number = DEFAULT_VIEWPORT_CULLING_MARGIN
): ViewportWorldBounds {
  const safeZoom = zoom > 0 ? zoom : 1;
  const safeMargin = Math.max(0, margin);

  // Screen-space bounds expanded symmetrically by margin
  const screenMinX = -safeMargin;
  const screenMinY = -safeMargin;
  const screenMaxX = size.width + safeMargin;
  const screenMaxY = size.height + safeMargin;

  const normalizeZero = (val: number): number => (val === 0 ? 0 : val);

  // Convert expanded screen rectangle to world coordinates
  const minX = normalizeZero((screenMinX - pan.x) / safeZoom);
  const minY = normalizeZero((screenMinY - pan.y) / safeZoom);
  const maxX = normalizeZero((screenMaxX - pan.x) / safeZoom);
  const maxY = normalizeZero((screenMaxY - pan.y) / safeZoom);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

/**
 * Tests whether two 2D Axis-Aligned Bounding Boxes intersect (including touching edges).
 */
export function aabbIntersects(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

/**
 * Computes the world-space bounding box for any shape.
 * Fast-paths unrotated root shapes and handles rotated shapes, point-based shapes,
 * and groups.
 */
export function computeShapeWorldAABB(
  shape: Shape,
  shapesMap?: Map<string, Shape>
): ShapeAABB {
  const rot = shape.rotation ?? 0;
  const worldX = !shape.parentId || !shapesMap ? shape.x : getShapeWorldTransform(shape, shapesMap).x;
  const worldY = !shape.parentId || !shapesMap ? shape.y : getShapeWorldTransform(shape, shapesMap).y;

  // Point-based shapes: line, arrow, connector, freehand
  if ("points" in shape && Array.isArray(shape.points) && shape.points.length >= 2) {
    const rawPoints = shape.points as number[];
    const rad = (rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < rawPoints.length; i += 2) {
      const px = rawPoints[i] ?? 0;
      const py = rawPoints[i + 1] ?? 0;

      const rx = cos * px - sin * py + worldX;
      const ry = sin * px + cos * py + worldY;

      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }

    const strokeWidth = "strokeWidth" in shape && typeof shape.strokeWidth === "number"
      ? shape.strokeWidth
      : 2;
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
  const w = Math.max(shape.width ?? 1, 1);
  const h = Math.max(shape.height ?? 1, 1);

  // Fast-path for unrotated shapes (dominant case on large boards)
  if (rot === 0) {
    return {
      minX: worldX,
      minY: worldY,
      maxX: worldX + w,
      maxY: worldY + h,
      width: w,
      height: h,
    };
  }

  // Rotated bounding box calculation
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const corners = [
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
    const rx = cos * corner.x - sin * corner.y + worldX;
    const ry = sin * corner.x + cos * corner.y + worldY;

    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
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
 * Checks whether a single shape's world bounding box intersects the visible viewport bounds.
 */
export function isShapeVisibleInViewport(
  shape: Shape,
  shapesMap: Map<string, Shape> | undefined,
  viewportBounds: ViewportWorldBounds
): boolean {
  const shapeAABB = computeShapeWorldAABB(shape, shapesMap);
  return aabbIntersects(shapeAABB, viewportBounds);
}

/**
 * Pure function to filter root shapes for canvas rendering.
 *
 * Guarantees:
 * 1. Root shapes intersecting the viewport world bounds (plus overscan margin) are included.
 * 2. Selection override: Any selected shape or root ancestor of a selected shape is NEVER culled.
 * 3. Preserves original document z-order exactly.
 * 4. Strictly read-only; never mutates document state, versions, or history.
 */
export function filterVisibleRootShapes(
  shapes: Shape[],
  viewportBounds: ViewportWorldBounds,
  options: ViewportCullingOptions = {}
): Shape[] {
  if (shapes.length === 0) {
    return [];
  }

  // 1. Resolve selection overrides: Find all root ancestors of selected shapes lazily
  const forceVisibleRootIds = new Set<string>();
  const selectedIds = options.selectedShapeIds;

  if (selectedIds && selectedIds.length > 0) {
    const shapesMap = new Map<string, Shape>();
    for (const s of shapes) {
      shapesMap.set(s.id, s);
    }

    for (const selId of selectedIds) {
      let current = shapesMap.get(selId);
      const visited = new Set<string>();

      while (current) {
        if (visited.has(current.id)) {
          break; // Cycle protection
        }
        visited.add(current.id);

        if (!current.parentId) {
          forceVisibleRootIds.add(current.id);
          break;
        }
        current = shapesMap.get(current.parentId);
      }
    }
  }

  // 2. Filter root shapes preserving document order (fast-path for root shapes without Map lookups)
  return shapes.filter((shape) => {
    // Only process root shapes at the top-level scene graph
    if (shape.parentId) {
      return false;
    }

    // Selection override: always mount selected shapes or groups containing selected children
    if (forceVisibleRootIds.has(shape.id)) {
      return true;
    }

    // Viewport intersection test
    return isShapeVisibleInViewport(shape, undefined, viewportBounds);
  });
}
