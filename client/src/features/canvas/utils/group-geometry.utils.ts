import type { Shape } from "../types";

export type Point = {
  x: number;
  y: number;
};

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorldTransform = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

export type WorldBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

/**
 * Computes the axis-aligned bounding box enclosing all supplied shapes.
 * Correctly accounts for shape position, width, height, and rotation.
 */
export function computeGroupBoundingBox(shapes: Shape[]): BoundingBox {
  if (shapes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of shapes) {
    const rot = shape.rotation ?? 0;
    if (rot === 0) {
      minX = Math.min(minX, shape.x);
      minY = Math.min(minY, shape.y);
      maxX = Math.max(maxX, shape.x + shape.width);
      maxY = Math.max(maxY, shape.y + shape.height);
    } else {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const rad = (rot * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const corners: Point[] = [
        { x: shape.x, y: shape.y },
        { x: shape.x + shape.width, y: shape.y },
        { x: shape.x + shape.width, y: shape.y + shape.height },
        { x: shape.x, y: shape.y + shape.height },
      ];

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
    }
  }

  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY)),
  };
}

/**
 * Converts a world-space point into a group's local-space coordinate system.
 */
export function worldToLocal(
  point: Point,
  group: { x: number; y: number; rotation?: number }
): Point {
  const rot = group.rotation ?? 0;
  const dx = point.x - group.x;
  const dy = point.y - group.y;

  if (rot === 0) {
    return { x: dx, y: dy };
  }

  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return {
    x: cos * dx + sin * dy,
    y: -sin * dx + cos * dy,
  };
}

/**
 * Converts a group's local-space point into the world-space coordinate system.
 */
export function localToWorld(
  localPoint: Point,
  group: { x: number; y: number; rotation?: number }
): Point {
  const rot = group.rotation ?? 0;

  if (rot === 0) {
    return {
      x: localPoint.x + group.x,
      y: localPoint.y + group.y,
    };
  }

  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return {
    x: cos * localPoint.x - sin * localPoint.y + group.x,
    y: sin * localPoint.x + cos * localPoint.y + group.y,
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
 * Computes accumulated world-space transform by traversing ancestor parent groups.
 */
export function getShapeWorldTransform(
  shape: Shape,
  shapes: Map<string, Shape> | Record<string, Shape> | Shape[]
): WorldTransform {
  if (!shape.parentId) {
    return {
      x: shape.x,
      y: shape.y,
      rotation: shape.rotation ?? 0,
      scaleX: 1,
      scaleY: 1,
    };
  }

  // Traverse ancestor hierarchy with cycle protection (from immediate parent to root)
  const ancestors: Shape[] = [];
  const visited = new Set<string>([shape.id]);
  let currentParentId: string | null | undefined = shape.parentId;

  while (currentParentId) {
    if (visited.has(currentParentId)) {
      break;
    }
    visited.add(currentParentId);
    const parent = resolveShape(currentParentId, shapes);
    if (!parent) {
      break;
    }
    ancestors.push(parent);
    currentParentId = parent.parentId;
  }

  // Accumulate transforms from immediate parent up to root
  let currentPoint: Point = { x: shape.x, y: shape.y };
  let accumulatedRotation = shape.rotation ?? 0;

  for (const ancestor of ancestors) {
    currentPoint = localToWorld(currentPoint, ancestor);
    accumulatedRotation = (accumulatedRotation + (ancestor.rotation ?? 0)) % 360;
  }

  return {
    x: currentPoint.x,
    y: currentPoint.y,
    rotation: accumulatedRotation,
    scaleX: 1,
    scaleY: 1,
  };
}

/**
 * Returns world-space bounding box and rotation for any shape (root or nested child).
 */
export function getShapeWorldBounds(
  shape: Shape,
  shapes: Map<string, Shape> | Record<string, Shape> | Shape[]
): WorldBounds {
  const worldTransform = getShapeWorldTransform(shape, shapes);
  return {
    x: worldTransform.x,
    y: worldTransform.y,
    width: shape.width,
    height: shape.height,
    rotation: worldTransform.rotation,
  };
}

/**
 * Detects whether making `candidateParentId` the parent of `targetShapeId` would introduce a cycle.
 */
export function hasCyclicHierarchy(
  targetShapeId: string,
  candidateParentId: string | null | undefined,
  shapes: Map<string, Shape> | Record<string, Shape> | Shape[]
): boolean {
  if (!candidateParentId) {
    return false;
  }

  if (targetShapeId === candidateParentId) {
    return true;
  }

  let currentId: string | null | undefined = candidateParentId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === targetShapeId) {
      return true;
    }
    if (visited.has(currentId)) {
      return true;
    }
    visited.add(currentId);
    const shape = resolveShape(currentId, shapes);
    if (!shape) {
      break;
    }
    currentId = shape.parentId;
  }

  return false;
}
