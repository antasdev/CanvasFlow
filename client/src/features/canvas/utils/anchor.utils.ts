import type { Shape, AnchorPosition } from "../types";
import { getShapeWorldBounds } from "./group-geometry.utils";

export type { AnchorPosition };

export type Point = {
  x: number;
  y: number;
};

export type AnchorInfo = {
  position: AnchorPosition;
  point: Point;
};

export type NearestAnchorResult = {
  shapeId: string;
  anchor: AnchorPosition;
  point: Point;
  distance: number;
};

export const ANCHOR_POSITIONS: readonly AnchorPosition[] = [
  "top",
  "right",
  "bottom",
  "left",
  "center",
] as const;

/**
 * Rotates a 2D point around a center point by an angle specified in degrees.
 * Uses radians internally:
 * x' = cos(theta) * (x - cx) - sin(theta) * (y - cy) + cx
 * y' = sin(theta) * (x - cx) + cos(theta) * (y - cy) + cy
 */
export function rotatePoint(
  point: Point,
  center: Point,
  rotationDegrees: number
): Point {
  if (rotationDegrees === 0) {
    return { x: point.x, y: point.y };
  }

  const rad = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: cos * dx - sin * dy + center.x,
    y: sin * dx + cos * dy + center.y,
  };
}

/**
 * Calculates the bounding box center of a shape.
 */
export function getShapeCenter(
  shape: Pick<Shape, "x" | "y" | "width" | "height">
): Point {
  return {
    x: shape.x + shape.width / 2,
    y: shape.y + shape.height / 2,
  };
}

/**
 * Calculates the coordinates of a specific anchor for a shape,
 * accounting for rotation around the shape's center.
 */
export function getShapeAnchorPoint(
  shape: Pick<Shape, "x" | "y" | "width" | "height" | "rotation">,
  anchor: AnchorPosition
): Point {
  const { x, y, width, height, rotation = 0 } = shape;
  const center = getShapeCenter(shape);

  let unrotatedPoint: Point;
  switch (anchor) {
    case "top":
      unrotatedPoint = { x: x + width / 2, y };
      break;
    case "right":
      unrotatedPoint = { x: x + width, y: y + height / 2 };
      break;
    case "bottom":
      unrotatedPoint = { x: x + width / 2, y: y + height };
      break;
    case "left":
      unrotatedPoint = { x, y: y + height / 2 };
      break;
    case "center":
      unrotatedPoint = { x: center.x, y: center.y };
      break;
  }

  return rotatePoint(unrotatedPoint, center, rotation);
}

/**
 * Resolves the world-space anchor point for a shape, correctly accounting for
 * local-to-world ancestor transformations if the shape is grouped in nested groups.
 */
export function getShapeWorldAnchorPoint(
  shape: Shape,
  shapes: Map<string, Shape> | Record<string, Shape> | Shape[],
  anchor: AnchorPosition
): Point {
  if (!shape.parentId) {
    return getShapeAnchorPoint(shape, anchor);
  }

  const worldBounds = getShapeWorldBounds(shape, shapes);
  return getShapeAnchorPoint(worldBounds, anchor);
}

/**
 * Returns all 5 anchor points in coordinates for a given shape.
 */
export function getShapeAnchors(
  shape: Pick<Shape, "x" | "y" | "width" | "height" | "rotation">
): Record<AnchorPosition, Point> {
  return {
    top: getShapeAnchorPoint(shape, "top"),
    right: getShapeAnchorPoint(shape, "right"),
    bottom: getShapeAnchorPoint(shape, "bottom"),
    left: getShapeAnchorPoint(shape, "left"),
    center: getShapeAnchorPoint(shape, "center"),
  };
}

/**
 * Checks if a shape is a valid target for connector attachments.
 * Connectors can attach to rectangle, text, sticky_note, and group.
 */
export function isConnectableShape(shape: Shape): boolean {
  return (
    shape.type === "rectangle" ||
    shape.type === "text" ||
    shape.type === "sticky_note" ||
    shape.type === "group"
  );
}

/**
 * Finds the nearest anchor point to a target world-space coordinate.
 *
 * Requirements:
 * - ignore unsupported shape types
 * - early bounding-box rejection (candidateMargin)
 * - evaluate five anchors
 * - calculate Euclidean distance
 * - return nearest valid anchor within threshold
 * - return null when nothing is within threshold
 */
export function findNearestAnchor(
  point: Point,
  shapes: Shape[],
  threshold: number = 20,
  candidateMargin: number = 30
): NearestAnchorResult | null {
  let nearest: NearestAnchorResult | null = null;
  let minDistance = threshold;

  for (const shape of shapes) {
    if (!isConnectableShape(shape)) {
      continue;
    }

    const worldBounds = shape.parentId ? getShapeWorldBounds(shape, shapes) : shape;

    // Early bounding-box rejection: expand bounding box by candidateMargin
    const maxDim = Math.max(worldBounds.width, worldBounds.height);
    const candidateRadius = maxDim / 2 + candidateMargin;
    const center = getShapeCenter(worldBounds);

    const distToCenter = Math.hypot(point.x - center.x, point.y - center.y);
    if (distToCenter > candidateRadius) {
      continue;
    }

    // Evaluate the 5 canonical anchors
    for (const anchor of ANCHOR_POSITIONS) {
      const anchorPoint = getShapeAnchorPoint(worldBounds, anchor);
      const dist = Math.hypot(point.x - anchorPoint.x, point.y - anchorPoint.y);

      if (dist <= minDistance) {
        minDistance = dist;
        nearest = {
          shapeId: shape.id,
          anchor,
          point: anchorPoint,
          distance: dist,
        };
      }
    }
  }

  return nearest;
}
