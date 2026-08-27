/**
 * Pure Mathematical Geometry Utilities for Advanced Vector Shapes
 * Circle, Ellipse, Triangle, Polygon, and Star
 */

export type NormalizedBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CircleGeometry = {
  centerX: number;
  centerY: number;
  radius: number;
};

export type EllipseGeometry = {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
};

export const MIN_POLYGON_SIDES = 3;
export const MAX_POLYGON_SIDES = 64;

export const MIN_STAR_POINTS = 3;
export const MAX_STAR_POINTS = 64;

export const MIN_STAR_INNER_RADIUS_RATIO = 0.05;
export const MAX_STAR_INNER_RADIUS_RATIO = 0.95;

/**
 * Normalizes two drag corner points into a canonical top-left AABB (x, y, width, height).
 * Supports dragging in all 4 quadrant directions.
 */
export function normalizeShapeBounds(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): NormalizedBounds {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const width = Math.max(Math.abs(currentX - startX), 1);
  const height = Math.max(Math.abs(currentY - startY), 1);

  return { x, y, width, height };
}

/**
 * Calculates uniform circle center and radius within bounding box.
 */
export function calculateCircleGeometry(
  width: number,
  height: number
): CircleGeometry {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const radius = Math.min(safeWidth, safeHeight) / 2;

  return {
    centerX: safeWidth / 2,
    centerY: safeHeight / 2,
    radius,
  };
}

/**
 * Calculates ellipse center and independent horizontal/vertical radii.
 */
export function calculateEllipseGeometry(
  width: number,
  height: number
): EllipseGeometry {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);

  return {
    centerX: safeWidth / 2,
    centerY: safeHeight / 2,
    radiusX: safeWidth / 2,
    radiusY: safeHeight / 2,
  };
}

/**
 * Calculates local 3 vertices for an upward-pointing isosceles triangle.
 * Local points: [width / 2, 0, width, height, 0, height]
 */
export function calculateTrianglePoints(
  width: number,
  height: number
): number[] {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);

  return [
    safeWidth / 2, 0,
    safeWidth, safeHeight,
    0, safeHeight,
  ];
}

/**
 * Generates local regular polygon vertices centered within bounding box.
 * First vertex starts pointing upward at angle -π / 2.
 */
export function calculatePolygonPoints(
  width: number,
  height: number,
  sides: number = 5
): number[] {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const n = Math.min(
    MAX_POLYGON_SIDES,
    Math.max(MIN_POLYGON_SIDES, Math.round(sides) || 5)
  );

  const cx = safeWidth / 2;
  const cy = safeHeight / 2;
  const rx = safeWidth / 2;
  const ry = safeHeight / 2;

  const points: number[] = [];

  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    points.push(Number(x.toFixed(4)), Number(y.toFixed(4)));
  }

  return points;
}

/**
 * Generates local star vertices with alternating outer and inner radii.
 * For n points, produces 2n vertices (4n coordinates).
 */
export function calculateStarPoints(
  width: number,
  height: number,
  points: number = 5,
  innerRadiusRatio: number = 0.5
): number[] {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const n = Math.min(
    MAX_STAR_POINTS,
    Math.max(MIN_STAR_POINTS, Math.round(points) || 5)
  );

  const safeRatio = Math.min(
    MAX_STAR_INNER_RADIUS_RATIO,
    Math.max(MIN_STAR_INNER_RADIUS_RATIO, innerRadiusRatio || 0.5)
  );

  const totalVertices = n * 2;
  const cx = safeWidth / 2;
  const cy = safeHeight / 2;
  const rx = safeWidth / 2;
  const ry = safeHeight / 2;

  const coords: number[] = [];

  for (let i = 0; i < totalVertices; i++) {
    const angle = -Math.PI / 2 + (Math.PI * i) / n;
    const isOuter = i % 2 === 0;
    const factor = isOuter ? 1 : safeRatio;

    const x = cx + rx * factor * Math.cos(angle);
    const y = cy + ry * factor * Math.sin(angle);
    coords.push(Number(x.toFixed(4)), Number(y.toFixed(4)));
  }

  return coords;
}

/**
 * Bakes Transformer scale factors into normalized width and height.
 * Enforces a minimum dimension (5px) and resets node scale to 1.
 */
export function normalizeTransformedShapeGeometry(
  scaleX: number,
  scaleY: number,
  width: number,
  height: number
): { width: number; height: number } {
  const safeScaleX = Number.isFinite(scaleX) && scaleX !== 0 ? Math.abs(scaleX) : 1;
  const safeScaleY = Number.isFinite(scaleY) && scaleY !== 0 ? Math.abs(scaleY) : 1;

  const nextWidth = Math.max(5, Math.round(width * safeScaleX));
  const nextHeight = Math.max(5, Math.round(height * safeScaleY));

  return {
    width: nextWidth,
    height: nextHeight,
  };
}
