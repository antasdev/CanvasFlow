import {
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  ZOOM_STEP,
} from "../constants";

import type { CanvasPoint, CanvasTransform } from "./canvas.coordinates";
import { screenToWorld } from "./canvas.coordinates";

export type WheelTransformParams = {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  pointer: CanvasPoint;
  currentZoom: number;
  currentPan: CanvasPoint;
  minZoom?: number;
  maxZoom?: number;
  zoomStep?: number;
};

/**
 * Clamps a zoom level within minimum and maximum limits, rounding to 3 decimal places.
 */
export function clampZoom(
  zoom: number,
  minZoom: number = MIN_ZOOM,
  maxZoom: number = MAX_ZOOM,
): number {
  if (!Number.isFinite(zoom) || Number.isNaN(zoom) || zoom <= 0) {
    return DEFAULT_ZOOM;
  }
  const clamped = Math.min(maxZoom, Math.max(minZoom, zoom));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * Calculates a new pan and zoom such that the world coordinate under `pointer`
 * remains stationary before and after the zoom transformation.
 */
export function calculatePointerZoom(
  pointer: CanvasPoint,
  currentZoom: number,
  targetZoom: number,
  currentPan: CanvasPoint,
  minZoom: number = MIN_ZOOM,
  maxZoom: number = MAX_ZOOM,
): CanvasTransform {
  const nextZoom = clampZoom(targetZoom, minZoom, maxZoom);

  if (nextZoom === currentZoom) {
    return { zoom: currentZoom, pan: currentPan };
  }

  const world = screenToWorld(pointer, {
    zoom: currentZoom,
    pan: currentPan,
  });

  const nextPanX = pointer.x - world.x * nextZoom;
  const nextPanY = pointer.y - world.y * nextZoom;

  return {
    zoom: nextZoom,
    pan: {
      x: Math.round(nextPanX * 100) / 100,
      y: Math.round(nextPanY * 100) / 100,
    },
  };
}

/**
 * Interprets a browser wheel event:
 * - When `ctrlKey` or `metaKey` is active (pinch-to-zoom or Ctrl+scroll), zooms toward pointer.
 * - Otherwise (trackpad two-finger scroll), pans the canvas by `-deltaX` and `-deltaY`.
 */
export function calculateWheelTransform({
  deltaX,
  deltaY,
  ctrlKey,
  metaKey,
  pointer,
  currentZoom,
  currentPan,
  minZoom = MIN_ZOOM,
  maxZoom = MAX_ZOOM,
  zoomStep = ZOOM_STEP,
}: WheelTransformParams): CanvasTransform {
  const isZoomGesture = ctrlKey || metaKey;

  if (isZoomGesture) {
    const direction = deltaY > 0 ? -1 : 1;
    const factor = direction > 0 ? zoomStep : 1 / zoomStep;
    const targetZoom = currentZoom * factor;
    return calculatePointerZoom(
      pointer,
      currentZoom,
      targetZoom,
      currentPan,
      minZoom,
      maxZoom,
    );
  }

  return {
    zoom: currentZoom,
    pan: {
      x: Math.round((currentPan.x - deltaX) * 100) / 100,
      y: Math.round((currentPan.y - deltaY) * 100) / 100,
    },
  };
}

/**
 * Calculates updated pan from an initial pan and a pointer movement vector.
 */
export function calculatePanDelta(
  startPan: CanvasPoint,
  pointerStart: CanvasPoint,
  pointerCurrent: CanvasPoint,
): CanvasPoint {
  const dx = pointerCurrent.x - pointerStart.x;
  const dy = pointerCurrent.y - pointerStart.y;

  return {
    x: Math.round((startPan.x + dx) * 100) / 100,
    y: Math.round((startPan.y + dy) * 100) / 100,
  };
}

/**
 * Formats a zoom value as a human-readable percentage string (e.g. 100%).
 */
export function formatZoomPercentage(zoom: number): string {
  if (!Number.isFinite(zoom) || Number.isNaN(zoom)) {
    return "100%";
  }
  return `${Math.round(zoom * 100)}%`;
}
