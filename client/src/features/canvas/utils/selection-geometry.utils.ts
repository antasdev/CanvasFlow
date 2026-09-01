import type {
  Shape,
  SelectionPoint,
  SelectionMatchMode,
  MarqueeState,
  ShapeGeometryDefinition,
} from "../types";

import type { AABB } from "./alignment.utils";
import { getShapeWorldBounds } from "./group-geometry.utils";
import {
  calculateCircleGeometry,
  calculateEllipseGeometry,
  calculateTrianglePoints,
  calculatePolygonPoints,
  calculateStarPoints,
} from "./shape-geometry.utils";

const EPSILON = 1e-6;

/**
 * Returns true if a point is collinear with segment (a, b) and lies on it.
 */
export function isPointOnSegment(
  p: SelectionPoint,
  a: SelectionPoint,
  b: SelectionPoint,
  tolerance = 1e-4
): boolean {
  const minX = Math.min(a.x, b.x) - tolerance;
  const maxX = Math.max(a.x, b.x) + tolerance;
  const minY = Math.min(a.y, b.y) - tolerance;
  const maxY = Math.max(a.y, b.y) + tolerance;

  if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
    return false;
  }

  // Cross product (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  return Math.abs(cross) <= tolerance;
}

/**
 * Robust Point-in-Polygon test using the ray-casting algorithm (even-odd rule).
 * Points lying directly on polygon edges or vertices are treated as inside.
 */
export function pointInPolygon(
  point: SelectionPoint,
  polygon: SelectionPoint[]
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];

    // Check if the point lies exactly on edge (pj, pi)
    if (isPointOnSegment(point, pj, pi)) {
      return true;
    }

    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x <
        ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y + EPSILON) + pi.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Calculates distance squared from point p to segment (v, w).
 */
export function distToSegmentSquared(
  p: SelectionPoint,
  v: SelectionPoint,
  w: SelectionPoint
): number {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) {
    return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
  }
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = v.x + t * (w.x - v.x);
  const projY = v.y + t * (w.y - v.y);
  return (p.x - projX) ** 2 + (p.y - projY) ** 2;
}

/**
 * Calculates 2D cross product of vectors OA and OB.
 * Positive if O->A->B is CCW, negative if CW, 0 if collinear.
 */
function crossProduct(
  o: SelectionPoint,
  a: SelectionPoint,
  b: SelectionPoint
): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Tests if line segment (p1, p2) intersects line segment (p3, p4).
 * Handles collinear, touching, and crossing cases.
 */
export function segmentsIntersect(
  p1: SelectionPoint,
  p2: SelectionPoint,
  p3: SelectionPoint,
  p4: SelectionPoint
): boolean {
  // AABB pre-check
  if (
    Math.max(p1.x, p2.x) < Math.min(p3.x, p4.x) ||
    Math.min(p1.x, p2.x) > Math.max(p3.x, p4.x) ||
    Math.max(p1.y, p2.y) < Math.min(p3.y, p4.y) ||
    Math.min(p1.y, p2.y) > Math.max(p3.y, p4.y)
  ) {
    return false;
  }

  const cp1 = crossProduct(p3, p4, p1);
  const cp2 = crossProduct(p3, p4, p2);
  const cp3 = crossProduct(p1, p2, p3);
  const cp4 = crossProduct(p1, p2, p4);

  // General case
  if (
    ((cp1 > 0 && cp2 < 0) || (cp1 < 0 && cp2 > 0)) &&
    ((cp3 > 0 && cp4 < 0) || (cp3 < 0 && cp4 > 0))
  ) {
    return true;
  }

  // Collinear or endpoint touching checks
  if (isPointOnSegment(p1, p3, p4)) return true;
  if (isPointOnSegment(p2, p3, p4)) return true;
  if (isPointOnSegment(p3, p1, p2)) return true;
  if (isPointOnSegment(p4, p1, p2)) return true;

  return false;
}

/**
 * Tests if two polygons intersect (either edges cross, or one contains the other).
 */
export function polygonIntersectsPolygon(
  polyA: SelectionPoint[],
  polyB: SelectionPoint[]
): boolean {
  if (polyA.length < 3 || polyB.length < 3) {
    return false;
  }

  // 1. Check if any edge of polyA intersects any edge of polyB
  const lenA = polyA.length;
  const lenB = polyB.length;

  for (let i = 0; i < lenA; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % lenA];

    for (let j = 0; j < lenB; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % lenB];

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }

  // 2. Check if polyA is completely inside polyB
  if (pointInPolygon(polyA[0], polyB)) {
    return true;
  }

  // 3. Check if polyB is completely inside polyA
  if (pointInPolygon(polyB[0], polyA)) {
    return true;
  }

  return false;
}

/**
 * Tests if subject polygon is completely contained inside container polygon.
 */
export function polygonContainsPolygon(
  container: SelectionPoint[],
  subject: SelectionPoint[]
): boolean {
  if (container.length < 3 || subject.length < 3) {
    return false;
  }

  // All subject vertices must be inside container
  for (const pt of subject) {
    if (!pointInPolygon(pt, container)) {
      return false;
    }
  }

  // No edges may cross (proper crossings would imply parts sticking out)
  const cLen = container.length;
  const sLen = subject.length;

  for (let i = 0; i < cLen; i++) {
    const c1 = container[i];
    const c2 = container[(i + 1) % cLen];

    for (let j = 0; j < sLen; j++) {
      const s1 = subject[j];
      const s2 = subject[(j + 1) % sLen];

      // Check for proper crossing
      const cp1 = crossProduct(s1, s2, c1);
      const cp2 = crossProduct(s1, s2, c2);
      const cp3 = crossProduct(c1, c2, s1);
      const cp4 = crossProduct(c1, c2, s2);

      if (
        ((cp1 > 0 && cp2 < 0) || (cp1 < 0 && cp2 > 0)) &&
        ((cp3 > 0 && cp4 < 0) || (cp3 < 0 && cp4 > 0))
      ) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Tests if polyline intersects polygon.
 */
export function polylineIntersectsPolygon(
  points: SelectionPoint[],
  polygon: SelectionPoint[]
): boolean {
  if (points.length === 0 || polygon.length < 3) {
    return false;
  }

  // Single point case
  if (points.length === 1) {
    return pointInPolygon(points[0], polygon);
  }

  // Check if any point is inside
  for (const pt of points) {
    if (pointInPolygon(pt, polygon)) {
      return true;
    }
  }

  // Check segment intersections with polygon edges
  const pLen = polygon.length;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    for (let j = 0; j < pLen; j++) {
      const c1 = polygon[j];
      const c2 = polygon[(j + 1) % pLen];

      if (segmentsIntersect(p1, p2, c1, c2)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Tests if polyline is completely inside polygon.
 */
export function polylineInsidePolygon(
  points: SelectionPoint[],
  polygon: SelectionPoint[]
): boolean {
  if (points.length === 0 || polygon.length < 3) {
    return false;
  }

  // All vertices must be inside polygon
  for (const pt of points) {
    if (!pointInPolygon(pt, polygon)) {
      return false;
    }
  }

  // No polyline segment may intersect polygon edges
  const pLen = polygon.length;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    for (let j = 0; j < pLen; j++) {
      const c1 = polygon[j];
      const c2 = polygon[(j + 1) % pLen];

      // Check proper crossing
      const cp1 = crossProduct(p1, p2, c1);
      const cp2 = crossProduct(p1, p2, c2);
      const cp3 = crossProduct(c1, c2, p1);
      const cp4 = crossProduct(c1, c2, p2);

      if (
        ((cp1 > 0 && cp2 < 0) || (cp1 < 0 && cp2 > 0)) &&
        ((cp3 > 0 && cp4 < 0) || (cp3 < 0 && cp4 > 0))
      ) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Tests if a circle intersects a polygon.
 */
export function circleIntersectsPolygon(
  center: SelectionPoint,
  radius: number,
  polygon: SelectionPoint[]
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  // Center inside polygon
  if (pointInPolygon(center, polygon)) {
    return true;
  }

  const r2 = radius * radius;
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    // Check distance from center to segment
    if (distToSegmentSquared(center, p1, p2) <= r2) {
      return true;
    }
  }

  return false;
}

/**
 * Tests if a circle is completely contained within a polygon.
 */
export function circleContainedInPolygon(
  center: SelectionPoint,
  radius: number,
  polygon: SelectionPoint[]
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  // Center must be inside polygon
  if (!pointInPolygon(center, polygon)) {
    return false;
  }

  const r2 = radius * radius;
  const n = polygon.length;

  // Distance to every edge must be at least radius
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    if (distToSegmentSquared(center, p1, p2) < r2) {
      return false;
    }
  }

  return true;
}

/**
 * Generates an approximated polygon for an ellipse in world space.
 */
export function sampleEllipseToPolygon(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  rotationDegrees: number,
  steps = 32
): SelectionPoint[] {
  const rad = (rotationDegrees * Math.PI) / 180;
  const cosRot = Math.cos(rad);
  const sinRot = Math.sin(rad);
  const points: SelectionPoint[] = [];

  for (let i = 0; i < steps; i++) {
    const theta = (2 * Math.PI * i) / steps;
    const localX = radiusX * Math.cos(theta);
    const localY = radiusY * Math.sin(theta);

    const worldX = cosRot * localX - sinRot * localY + centerX;
    const worldY = sinRot * localX + cosRot * localY + centerY;

    points.push({ x: Number(worldX.toFixed(4)), y: Number(worldY.toFixed(4)) });
  }

  return points;
}

/**
 * Converts a marquee state into a 4-point world-space polygon.
 */
export function marqueeToPolygon(marquee: MarqueeState): SelectionPoint[] {
  const minX = Math.min(marquee.startX, marquee.currentX);
  const maxX = Math.max(marquee.startX, marquee.currentX);
  const minY = Math.min(marquee.startY, marquee.currentY);
  const maxY = Math.max(marquee.startY, marquee.currentY);

  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/**
 * Rotates a local point around center (cx, cy) and returns the world point.
 */
function rotatePointAround(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rotDegrees: number
): SelectionPoint {
  if (rotDegrees === 0) {
    return { x: px, y: py };
  }

  const rad = (rotDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const dx = px - cx;
  const dy = py - cy;

  return {
    x: Number((cos * dx - sin * dy + cx).toFixed(4)),
    y: Number((sin * dx + cos * dy + cy).toFixed(4)),
  };
}

/**
 * Extracts world-space geometry for any shape type.
 */
export function getShapeGeometryInWorld(
  shape: Shape,
  shapes: Shape[]
): ShapeGeometryDefinition {
  const wb = getShapeWorldBounds(shape, shapes);
  const rot = wb.rotation ?? 0;
  const cx = wb.x + wb.width / 2;
  const cy = wb.y + wb.height / 2;

  switch (shape.type) {
    case "rectangle":
    case "text":
    case "sticky_note":
    case "group": {
      const corners = [
        rotatePointAround(wb.x, wb.y, cx, cy, rot),
        rotatePointAround(wb.x + wb.width, wb.y, cx, cy, rot),
        rotatePointAround(wb.x + wb.width, wb.y + wb.height, cx, cy, rot),
        rotatePointAround(wb.x, wb.y + wb.height, cx, cy, rot),
      ];
      return { kind: "polygon", vertices: corners };
    }

    case "circle": {
      const geom = calculateCircleGeometry(wb.width, wb.height);
      return {
        kind: "circle",
        centerX: cx,
        centerY: cy,
        radius: geom.radius,
      };
    }

    case "ellipse": {
      const geom = calculateEllipseGeometry(wb.width, wb.height);
      return {
        kind: "ellipse",
        centerX: cx,
        centerY: cy,
        radiusX: geom.radiusX,
        radiusY: geom.radiusY,
        rotation: rot,
      };
    }

    case "triangle": {
      const localPoints = calculateTrianglePoints(wb.width, wb.height);
      const vertices: SelectionPoint[] = [];
      for (let i = 0; i < localPoints.length; i += 2) {
        const px = wb.x + localPoints[i];
        const py = wb.y + localPoints[i + 1];
        vertices.push(rotatePointAround(px, py, cx, cy, rot));
      }
      return { kind: "polygon", vertices };
    }

    case "polygon": {
      const sides = shape.shapeConfig?.sides ?? shape.sides ?? 5;
      const localPoints = calculatePolygonPoints(wb.width, wb.height, sides);
      const vertices: SelectionPoint[] = [];
      for (let i = 0; i < localPoints.length; i += 2) {
        const px = wb.x + localPoints[i];
        const py = wb.y + localPoints[i + 1];
        vertices.push(rotatePointAround(px, py, cx, cy, rot));
      }
      return { kind: "polygon", vertices };
    }

    case "star": {
      const pointsCount = shape.shapeConfig?.points ?? 5;
      const innerRatio = shape.shapeConfig?.innerRadiusRatio ?? 0.5;
      const localPoints = calculateStarPoints(wb.width, wb.height, pointsCount, innerRatio);
      const vertices: SelectionPoint[] = [];
      for (let i = 0; i < localPoints.length; i += 2) {
        const px = wb.x + localPoints[i];
        const py = wb.y + localPoints[i + 1];
        vertices.push(rotatePointAround(px, py, cx, cy, rot));
      }
      return { kind: "polygon", vertices };
    }

    case "line":
    case "arrow":
    case "connector":
    case "freehand": {
      const rawPoints = shape.points ?? [];
      const worldPoints: SelectionPoint[] = [];
      for (let i = 0; i < rawPoints.length; i += 2) {
        const px = wb.x + rawPoints[i];
        const py = wb.y + rawPoints[i + 1];
        worldPoints.push(rotatePointAround(px, py, cx, cy, rot));
      }
      return {
        kind: "polyline",
        points: worldPoints,
        strokeWidth: shape.strokeWidth ?? 2,
      };
    }

    default: {
      const corners = [
        rotatePointAround(wb.x, wb.y, cx, cy, rot),
        rotatePointAround(wb.x + wb.width, wb.y, cx, cy, rot),
        rotatePointAround(wb.x + wb.width, wb.y + wb.height, cx, cy, rot),
        rotatePointAround(wb.x, wb.y + wb.height, cx, cy, rot),
      ];
      return { kind: "polygon", vertices: corners };
    }
  }
}

/**
 * Checks whether selection geometry intersects or contains the candidate AABB bounding box.
 */
export function aabbIntersectsPolygon(
  aabb: AABB,
  polygon: SelectionPoint[]
): boolean {
  const aabbPoly: SelectionPoint[] = [
    { x: aabb.minX, y: aabb.minY },
    { x: aabb.maxX, y: aabb.minY },
    { x: aabb.maxX, y: aabb.maxY },
    { x: aabb.minX, y: aabb.maxY },
  ];
  return polygonIntersectsPolygon(aabbPoly, polygon);
}

/**
 * Tests whether a shape matches a selection polygon under containment or intersection mode.
 */
export function hitTestShapeGeometry(
  geometry: ShapeGeometryDefinition,
  selectionPolygon: SelectionPoint[],
  mode: SelectionMatchMode
): boolean {
  if (selectionPolygon.length < 3) {
    return false;
  }

  switch (geometry.kind) {
    case "polygon": {
      if (mode === "containment") {
        return polygonContainsPolygon(selectionPolygon, geometry.vertices);
      }
      return polygonIntersectsPolygon(geometry.vertices, selectionPolygon);
    }

    case "polyline": {
      if (mode === "containment") {
        return polylineInsidePolygon(geometry.points, selectionPolygon);
      }
      return polylineIntersectsPolygon(geometry.points, selectionPolygon);
    }

    case "circle": {
      const center: SelectionPoint = {
        x: geometry.centerX,
        y: geometry.centerY,
      };
      if (mode === "containment") {
        return circleContainedInPolygon(center, geometry.radius, selectionPolygon);
      }
      return circleIntersectsPolygon(center, geometry.radius, selectionPolygon);
    }

    case "ellipse": {
      const poly = sampleEllipseToPolygon(
        geometry.centerX,
        geometry.centerY,
        geometry.radiusX,
        geometry.radiusY,
        geometry.rotation
      );
      if (mode === "containment") {
        return polygonContainsPolygon(selectionPolygon, poly);
      }
      return polygonIntersectsPolygon(poly, selectionPolygon);
    }
  }
}

/**
 * Performs a point hit test against a shape geometry in world space.
 */
export function hitTestPointWithShape(
  point: SelectionPoint,
  geometry: ShapeGeometryDefinition,
  tolerance = 4
): boolean {
  switch (geometry.kind) {
    case "polygon":
      return pointInPolygon(point, geometry.vertices);

    case "polyline": {
      const tol2 = Math.max(tolerance, geometry.strokeWidth / 2) ** 2;
      for (let i = 0; i < geometry.points.length - 1; i++) {
        if (distToSegmentSquared(point, geometry.points[i], geometry.points[i + 1]) <= tol2) {
          return true;
        }
      }
      return false;
    }

    case "circle": {
      const d2 =
        (point.x - geometry.centerX) ** 2 +
        (point.y - geometry.centerY) ** 2;
      return d2 <= geometry.radius ** 2;
    }

    case "ellipse": {
      const poly = sampleEllipseToPolygon(
        geometry.centerX,
        geometry.centerY,
        geometry.radiusX,
        geometry.radiusY,
        geometry.rotation
      );
      return pointInPolygon(point, poly);
    }
  }
}
