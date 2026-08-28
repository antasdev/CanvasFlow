import type { Shape } from "../types";
import {
  getShapeWorldBounds,
  worldToLocal,
  type Point,
} from "./group-geometry.utils";

export type AlignmentAxis =
  | "left"
  | "center-horizontal"
  | "right"
  | "top"
  | "center-vertical"
  | "bottom";

export type DistributionAxis = "horizontal" | "vertical";

export type AABB = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type ShapeAlignmentDelta = {
  shapeId: string;
  worldDeltaX: number;
  worldDeltaY: number;
  targetLocalX: number;
  targetLocalY: number;
};

/**
 * Calculates the axis-aligned bounding box (AABB) of a shape in world space.
 * Accounts for nested ancestor transforms and rotation.
 */
export function getShapeWorldAABB(
  shape: Shape,
  shapes: Map<string, Shape> | Record<string, Shape> | Shape[]
): AABB {
  const wb = getShapeWorldBounds(shape, shapes);
  const rot = wb.rotation ?? 0;

  if (rot === 0) {
    const minX = wb.x;
    const minY = wb.y;
    const maxX = wb.x + wb.width;
    const maxY = wb.y + wb.height;
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: wb.width,
      height: wb.height,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }

  const cx = wb.x + wb.width / 2;
  const cy = wb.y + wb.height / 2;
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const corners: Point[] = [
    { x: wb.x, y: wb.y },
    { x: wb.x + wb.width, y: wb.y },
    { x: wb.x + wb.width, y: wb.y + wb.height },
    { x: wb.x, y: wb.y + wb.height },
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of corners) {
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    const rx = cos * dx - sin * dy + cx;
    const ry = sin * dx + cos * dy + cy;

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
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function resolveShape(
  id: string,
  shapes: Map<string, Shape> | Record<string, Shape> | Shape[]
): Shape | undefined {
  if (shapes instanceof Map) {
    return shapes.get(id);
  }
  if (Array.isArray(shapes)) {
    return shapes.find((s) => s.id === id);
  }
  return shapes[id];
}

/**
 * Projects a target world position back to the local coordinate system of a shape's parent container.
 * Correctly accounts for nested ancestor rotations and translations.
 */
export function convertWorldPositionToLocal(
  shape: Shape,
  allShapes: Map<string, Shape> | Record<string, Shape> | Shape[],
  targetWorldPosition: Point
): Point {
  if (!shape.parentId) {
    return {
      x: Math.round(targetWorldPosition.x),
      y: Math.round(targetWorldPosition.y),
    };
  }

  // Build ancestor hierarchy from immediate parent up to root ancestor
  const ancestors: Shape[] = [];
  const visited = new Set<string>([shape.id]);
  let currentParentId: string | null | undefined = shape.parentId;

  while (currentParentId) {
    if (visited.has(currentParentId)) break;
    visited.add(currentParentId);
    const parent = resolveShape(currentParentId, allShapes);
    if (!parent) break;
    ancestors.push(parent);
    currentParentId = parent.parentId;
  }

  // To project from world down to immediate parent's local space,
  // traverse from root ancestor down to immediate parent
  let currentPoint: Point = { ...targetWorldPosition };
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];
    currentPoint = worldToLocal(currentPoint, ancestor);
  }

  return {
    x: Math.round(currentPoint.x),
    y: Math.round(currentPoint.y),
  };
}

/**
 * Calculates alignment targets for 2+ shapes.
 * Operates in world-space visual bounds, then converts results to local coordinates.
 */
export function calculateAlignmentTargets(
  selectedShapes: Shape[],
  allShapes: Map<string, Shape> | Record<string, Shape> | Shape[],
  alignment: AlignmentAxis
): Map<string, ShapeAlignmentDelta> {
  const result = new Map<string, ShapeAlignmentDelta>();

  if (selectedShapes.length < 2) {
    return result;
  }

  // 1. Calculate world AABB for each shape
  const aabbMap = new Map<string, AABB>();
  let overallMinX = Infinity;
  let overallMinY = Infinity;
  let overallMaxX = -Infinity;
  let overallMaxY = -Infinity;

  for (const s of selectedShapes) {
    const aabb = getShapeWorldAABB(s, allShapes);
    aabbMap.set(s.id, aabb);

    overallMinX = Math.min(overallMinX, aabb.minX);
    overallMinY = Math.min(overallMinY, aabb.minY);
    overallMaxX = Math.max(overallMaxX, aabb.maxX);
    overallMaxY = Math.max(overallMaxY, aabb.maxY);
  }

  const overallCenterX = (overallMinX + overallMaxX) / 2;
  const overallCenterY = (overallMinY + overallMaxY) / 2;

  // 2. Compute world translation for each shape
  for (const s of selectedShapes) {
    const aabb = aabbMap.get(s.id)!;
    const wb = getShapeWorldBounds(s, allShapes);

    let worldDeltaX = 0;
    let worldDeltaY = 0;

    switch (alignment) {
      case "left":
        worldDeltaX = overallMinX - aabb.minX;
        break;
      case "center-horizontal":
        worldDeltaX = overallCenterX - aabb.centerX;
        break;
      case "right":
        worldDeltaX = overallMaxX - aabb.maxX;
        break;
      case "top":
        worldDeltaY = overallMinY - aabb.minY;
        break;
      case "center-vertical":
        worldDeltaY = overallCenterY - aabb.centerY;
        break;
      case "bottom":
        worldDeltaY = overallMaxY - aabb.maxY;
        break;
    }

    const targetWorldX = wb.x + worldDeltaX;
    const targetWorldY = wb.y + worldDeltaY;

    const targetLocal = convertWorldPositionToLocal(s, allShapes, {
      x: targetWorldX,
      y: targetWorldY,
    });

    result.set(s.id, {
      shapeId: s.id,
      worldDeltaX,
      worldDeltaY,
      targetLocalX: targetLocal.x,
      targetLocalY: targetLocal.y,
    });
  }

  return result;
}

/**
 * Calculates distribution targets for 3+ shapes.
 * Spaces shapes evenly along the chosen axis (horizontal or vertical).
 * Anchors the first and last shapes; redistributes intermediate shapes.
 * If available gap space is negative or insufficient, monotonically spaces centers.
 */
export function calculateDistributionTargets(
  selectedShapes: Shape[],
  allShapes: Map<string, Shape> | Record<string, Shape> | Shape[],
  axis: DistributionAxis
): Map<string, ShapeAlignmentDelta> {
  const result = new Map<string, ShapeAlignmentDelta>();

  if (selectedShapes.length < 3) {
    return result;
  }

  type ShapeWithAABB = {
    shape: Shape;
    aabb: AABB;
  };

  const items: ShapeWithAABB[] = selectedShapes.map((s) => ({
    shape: s,
    aabb: getShapeWorldAABB(s, allShapes),
  }));

  // Sort items along the chosen axis
  if (axis === "horizontal") {
    items.sort((a, b) => a.aabb.minX - b.aabb.minX || a.aabb.centerX - b.aabb.centerX);
  } else {
    items.sort((a, b) => a.aabb.minY - b.aabb.minY || a.aabb.centerY - b.aabb.centerY);
  }

  const n = items.length;
  const first = items[0];
  const last = items[n - 1];

  if (axis === "horizontal") {
    const totalSpan = last.aabb.maxX - first.aabb.minX;
    const sumShapeWidths = items.reduce((sum, item) => sum + item.aabb.width, 0);
    const totalGap = totalSpan - sumShapeWidths;
    const gapCount = n - 1;

    if (totalGap > 0) {
      // Standard positive gap distribution
      const gap = totalGap / gapCount;
      let currentRight = first.aabb.maxX;

      // First shape remains fixed
      result.set(first.shape.id, {
        shapeId: first.shape.id,
        worldDeltaX: 0,
        worldDeltaY: 0,
        targetLocalX: first.shape.x,
        targetLocalY: first.shape.y,
      });

      for (let i = 1; i < n - 1; i++) {
        const item = items[i];
        const targetMinX = currentRight + gap;
        const worldDeltaX = targetMinX - item.aabb.minX;
        const wb = getShapeWorldBounds(item.shape, allShapes);
        const targetWorldX = wb.x + worldDeltaX;
        const targetLocal = convertWorldPositionToLocal(item.shape, allShapes, {
          x: targetWorldX,
          y: wb.y,
        });

        result.set(item.shape.id, {
          shapeId: item.shape.id,
          worldDeltaX,
          worldDeltaY: 0,
          targetLocalX: targetLocal.x,
          targetLocalY: targetLocal.y,
        });

        currentRight = targetMinX + item.aabb.width;
      }

      // Last shape remains fixed
      result.set(last.shape.id, {
        shapeId: last.shape.id,
        worldDeltaX: 0,
        worldDeltaY: 0,
        targetLocalX: last.shape.x,
        targetLocalY: last.shape.y,
      });
    } else {
      // Overlapping / insufficient space: evenly distribute centers between first and last
      const centerSpan = last.aabb.centerX - first.aabb.centerX;
      const centerStep = centerSpan / gapCount;

      result.set(first.shape.id, {
        shapeId: first.shape.id,
        worldDeltaX: 0,
        worldDeltaY: 0,
        targetLocalX: first.shape.x,
        targetLocalY: first.shape.y,
      });

      for (let i = 1; i < n - 1; i++) {
        const item = items[i];
        const targetCenterX = first.aabb.centerX + i * centerStep;
        const worldDeltaX = targetCenterX - item.aabb.centerX;
        const wb = getShapeWorldBounds(item.shape, allShapes);
        const targetWorldX = wb.x + worldDeltaX;
        const targetLocal = convertWorldPositionToLocal(item.shape, allShapes, {
          x: targetWorldX,
          y: wb.y,
        });

        result.set(item.shape.id, {
          shapeId: item.shape.id,
          worldDeltaX,
          worldDeltaY: 0,
          targetLocalX: targetLocal.x,
          targetLocalY: targetLocal.y,
        });
      }

      result.set(last.shape.id, {
        shapeId: last.shape.id,
        worldDeltaX: 0,
        worldDeltaY: 0,
        targetLocalX: last.shape.x,
        targetLocalY: last.shape.y,
      });
    }
  } else {
    // Vertical distribution
    const totalSpan = last.aabb.maxY - first.aabb.minY;
    const sumShapeHeights = items.reduce((sum, item) => sum + item.aabb.height, 0);
    const totalGap = totalSpan - sumShapeHeights;
    const gapCount = n - 1;

    if (totalGap > 0) {
      const gap = totalGap / gapCount;
      let currentBottom = first.aabb.maxY;

      result.set(first.shape.id, {
        shapeId: first.shape.id,
        worldDeltaX: 0,
        worldDeltaY: 0,
        targetLocalX: first.shape.x,
        targetLocalY: first.shape.y,
      });

      for (let i = 1; i < n - 1; i++) {
        const item = items[i];
        const targetMinY = currentBottom + gap;
        const worldDeltaY = targetMinY - item.aabb.minY;
        const wb = getShapeWorldBounds(item.shape, allShapes);
        const targetWorldY = wb.y + worldDeltaY;
        const targetLocal = convertWorldPositionToLocal(item.shape, allShapes, {
          x: wb.x,
          y: targetWorldY,
        });

        result.set(item.shape.id, {
          shapeId: item.shape.id,
          worldDeltaX: 0,
          worldDeltaY,
          targetLocalX: targetLocal.x,
          targetLocalY: targetLocal.y,
        });

        currentBottom = targetMinY + item.aabb.height;
      }

      result.set(last.shape.id, {
        shapeId: last.shape.id,
        worldDeltaX: 0,
        worldDeltaY: 0,
        targetLocalX: last.shape.x,
        targetLocalY: last.shape.y,
      });
    } else {
      const centerSpan = last.aabb.centerY - first.aabb.centerY;
      const centerStep = centerSpan / gapCount;

      result.set(first.shape.id, {
        shapeId: first.shape.id,
        worldDeltaX: 0,
        worldDeltaY: 0,
        targetLocalX: first.shape.x,
        targetLocalY: first.shape.y,
      });

      for (let i = 1; i < n - 1; i++) {
        const item = items[i];
        const targetCenterY = first.aabb.centerY + i * centerStep;
        const worldDeltaY = targetCenterY - item.aabb.centerY;
        const wb = getShapeWorldBounds(item.shape, allShapes);
        const targetWorldY = wb.y + worldDeltaY;
        const targetLocal = convertWorldPositionToLocal(item.shape, allShapes, {
          x: wb.x,
          y: targetWorldY,
        });

        result.set(item.shape.id, {
          shapeId: item.shape.id,
          worldDeltaX: 0,
          worldDeltaY,
          targetLocalX: targetLocal.x,
          targetLocalY: targetLocal.y,
        });
      }

      result.set(last.shape.id, {
        shapeId: last.shape.id,
        worldDeltaX: 0,
        worldDeltaY: 0,
        targetLocalX: last.shape.x,
        targetLocalY: last.shape.y,
      });
    }
  }

  return result;
}
