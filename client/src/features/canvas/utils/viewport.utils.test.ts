import { describe, expect, it } from "vitest";

import { screenToWorld } from "./canvas.coordinates";
import {
  clampZoom,
  calculatePointerZoom,
  calculateWheelTransform,
  calculatePanDelta,
  formatZoomPercentage,
} from "./viewport.utils";

describe("viewport.utils", () => {
  describe("clampZoom", () => {
    it("returns clamped zoom within standard bounds", () => {
      expect(clampZoom(1.5)).toBe(1.5);
      expect(clampZoom(0.05)).toBe(0.2); // Below MIN_ZOOM 0.2
      expect(clampZoom(5.0)).toBe(3.0); // Above MAX_ZOOM 3.0
    });

    it("handles invalid or non-finite numbers safely", () => {
      expect(clampZoom(NaN)).toBe(1.0);
      expect(clampZoom(Infinity)).toBe(1.0);
      expect(clampZoom(-1)).toBe(1.0);
      expect(clampZoom(0)).toBe(1.0);
    });

    it("respects custom min and max bounds", () => {
      expect(clampZoom(0.5, 1.0, 2.0)).toBe(1.0);
      expect(clampZoom(2.5, 1.0, 2.0)).toBe(2.0);
    });
  });

  describe("calculatePointerZoom — World Point Invariance", () => {
    it("preserves exact world coordinate under cursor after zoom in", () => {
      const pointer = { x: 400, y: 300 };
      const currentZoom = 1.0;
      const currentPan = { x: 50, y: -20 };
      const targetZoom = 1.5;

      const worldBefore = screenToWorld(pointer, {
        zoom: currentZoom,
        pan: currentPan,
      });

      const { zoom: nextZoom, pan: nextPan } = calculatePointerZoom(
        pointer,
        currentZoom,
        targetZoom,
        currentPan,
      );

      const worldAfter = screenToWorld(pointer, {
        zoom: nextZoom,
        pan: nextPan,
      });

      expect(nextZoom).toBe(1.5);
      expect(worldAfter.x).toBeCloseTo(worldBefore.x, 2);
      expect(worldAfter.y).toBeCloseTo(worldBefore.y, 2);
    });

    it("preserves exact world coordinate under cursor after zoom out", () => {
      const pointer = { x: 100, y: 150 };
      const currentZoom = 2.0;
      const currentPan = { x: -200, y: -100 };
      const targetZoom = 1.2;

      const worldBefore = screenToWorld(pointer, {
        zoom: currentZoom,
        pan: currentPan,
      });

      const { zoom: nextZoom, pan: nextPan } = calculatePointerZoom(
        pointer,
        currentZoom,
        targetZoom,
        currentPan,
      );

      const worldAfter = screenToWorld(pointer, {
        zoom: nextZoom,
        pan: nextPan,
      });

      expect(nextZoom).toBe(1.2);
      expect(worldAfter.x).toBeCloseTo(worldBefore.x, 2);
      expect(worldAfter.y).toBeCloseTo(worldBefore.y, 2);
    });

    it("clamps to MAX_ZOOM while maintaining invariance", () => {
      const pointer = { x: 500, y: 500 };
      const { zoom: nextZoom } = calculatePointerZoom(
        pointer,
        2.5,
        4.0, // Exceeds MAX_ZOOM (3.0)
        { x: 0, y: 0 },
      );
      expect(nextZoom).toBe(3.0);
    });

    it("returns unchanged pan and zoom if target zoom matches current zoom", () => {
      const pointer = { x: 200, y: 200 };
      const currentPan = { x: 10, y: 20 };
      const result = calculatePointerZoom(pointer, 1.0, 1.0, currentPan);
      expect(result).toEqual({ zoom: 1.0, pan: currentPan });
    });
  });

  describe("calculateWheelTransform", () => {
    it("pans canvas by delta when no modifier keys are held (trackpad scrolling)", () => {
      const result = calculateWheelTransform({
        deltaX: 15,
        deltaY: -30,
        ctrlKey: false,
        metaKey: false,
        pointer: { x: 200, y: 200 },
        currentZoom: 1.0,
        currentPan: { x: 100, y: 100 },
      });

      expect(result.zoom).toBe(1.0);
      expect(result.pan).toEqual({ x: 85, y: 130 });
    });

    it("zooms toward pointer when ctrlKey is true (pinch-to-zoom or Ctrl+wheel)", () => {
      const pointer = { x: 300, y: 300 };
      const currentPan = { x: 0, y: 0 };
      const worldBefore = screenToWorld(pointer, { zoom: 1.0, pan: currentPan });

      const result = calculateWheelTransform({
        deltaX: 0,
        deltaY: -100, // Zoom in
        ctrlKey: true,
        metaKey: false,
        pointer,
        currentZoom: 1.0,
        currentPan,
      });

      expect(result.zoom).toBeGreaterThan(1.0);
      const worldAfter = screenToWorld(pointer, { zoom: result.zoom, pan: result.pan });
      expect(worldAfter.x).toBeCloseTo(worldBefore.x, 2);
      expect(worldAfter.y).toBeCloseTo(worldBefore.y, 2);
    });

    it("zooms toward pointer when metaKey is true (Mac Cmd+wheel)", () => {
      const result = calculateWheelTransform({
        deltaX: 0,
        deltaY: 100, // Zoom out
        ctrlKey: false,
        metaKey: true,
        pointer: { x: 100, y: 100 },
        currentZoom: 1.5,
        currentPan: { x: 50, y: 50 },
      });

      expect(result.zoom).toBeLessThan(1.5);
    });
  });

  describe("calculatePanDelta", () => {
    it("computes updated pan correctly based on pointer displacement", () => {
      const startPan = { x: 100, y: 200 };
      const pointerStart = { x: 50, y: 50 };
      const pointerCurrent = { x: 75, y: 40 };

      const result = calculatePanDelta(startPan, pointerStart, pointerCurrent);
      expect(result).toEqual({ x: 125, y: 190 });
    });
  });

  describe("formatZoomPercentage", () => {
    it("formats zoom level to percentage string", () => {
      expect(formatZoomPercentage(1.0)).toBe("100%");
      expect(formatZoomPercentage(0.25)).toBe("25%");
      expect(formatZoomPercentage(1.75)).toBe("175%");
      expect(formatZoomPercentage(3.0)).toBe("300%");
      expect(formatZoomPercentage(NaN)).toBe("100%");
    });
  });
});
