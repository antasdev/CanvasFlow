import { describe, it, expect } from "vitest";

import {
  normalizeShapeBounds,
  calculateCircleGeometry,
  calculateEllipseGeometry,
  calculateTrianglePoints,
  calculatePolygonPoints,
  calculateStarPoints,
  normalizeTransformedShapeGeometry,
  MIN_POLYGON_SIDES,
  MAX_POLYGON_SIDES,
  MIN_STAR_POINTS,
  MAX_STAR_POINTS,
} from "./shape-geometry.utils";

describe("shape-geometry.utils", () => {
  describe("normalizeShapeBounds", () => {
    it("should correctly handle dragging down-right", () => {
      const bounds = normalizeShapeBounds(10, 20, 110, 120);
      expect(bounds).toEqual({ x: 10, y: 20, width: 100, height: 100 });
    });

    it("should correctly handle dragging up-left", () => {
      const bounds = normalizeShapeBounds(110, 120, 10, 20);
      expect(bounds).toEqual({ x: 10, y: 20, width: 100, height: 100 });
    });

    it("should correctly handle dragging up-right", () => {
      const bounds = normalizeShapeBounds(10, 120, 110, 20);
      expect(bounds).toEqual({ x: 10, y: 20, width: 100, height: 100 });
    });

    it("should correctly handle dragging down-left", () => {
      const bounds = normalizeShapeBounds(110, 20, 10, 120);
      expect(bounds).toEqual({ x: 10, y: 20, width: 100, height: 100 });
    });

    it("should enforce a minimum dimension of 1 for zero-distance drag", () => {
      const bounds = normalizeShapeBounds(50, 50, 50, 50);
      expect(bounds).toEqual({ x: 50, y: 50, width: 1, height: 1 });
    });
  });

  describe("calculateCircleGeometry", () => {
    it("should compute uniform radius and center for square bounding box", () => {
      const geom = calculateCircleGeometry(100, 100);
      expect(geom).toEqual({
        centerX: 50,
        centerY: 50,
        radius: 50,
      });
    });

    it("should use smaller dimension for non-square bounding box to keep circle uniform", () => {
      const geom = calculateCircleGeometry(200, 100);
      expect(geom).toEqual({
        centerX: 100,
        centerY: 50,
        radius: 50,
      });
    });
  });

  describe("calculateEllipseGeometry", () => {
    it("should compute independent horizontal and vertical radii", () => {
      const geom = calculateEllipseGeometry(200, 100);
      expect(geom).toEqual({
        centerX: 100,
        centerY: 50,
        radiusX: 100,
        radiusY: 50,
      });
    });
  });

  describe("calculateTrianglePoints", () => {
    it("should produce exact upward-pointing isosceles triangle coordinates", () => {
      const points = calculateTrianglePoints(100, 80);
      expect(points).toEqual([
        50, 0,    // Top apex
        100, 80,  // Bottom right
        0, 80,    // Bottom left
      ]);
    });
  });

  describe("calculatePolygonPoints", () => {
    it("should generate 3 vertices (6 coordinates) for triangle polygon", () => {
      const points = calculatePolygonPoints(100, 100, 3);
      expect(points.length).toBe(6);
      // First point at top apex (angle -π / 2): x = cx = 50, y = cy - ry = 0
      expect(points[0]).toBeCloseTo(50, 2);
      expect(points[1]).toBeCloseTo(0, 2);
    });

    it("should generate 5 vertices (10 coordinates) for regular pentagon", () => {
      const points = calculatePolygonPoints(100, 100, 5);
      expect(points.length).toBe(10);
      // Top apex
      expect(points[0]).toBeCloseTo(50, 2);
      expect(points[1]).toBeCloseTo(0, 2);
    });

    it("should clamp sides to MIN_POLYGON_SIDES (3) and MAX_POLYGON_SIDES (64)", () => {
      const minPoints = calculatePolygonPoints(100, 100, 1);
      expect(minPoints.length).toBe(MIN_POLYGON_SIDES * 2);

      const maxPoints = calculatePolygonPoints(100, 100, 100);
      expect(maxPoints.length).toBe(MAX_POLYGON_SIDES * 2);
    });

    it("should produce deterministic coordinates", () => {
      const p1 = calculatePolygonPoints(120, 120, 6);
      const p2 = calculatePolygonPoints(120, 120, 6);
      expect(p1).toEqual(p2);
    });
  });

  describe("calculateStarPoints", () => {
    it("should generate 2n vertices (4n coordinates) with alternating radii", () => {
      const points = calculateStarPoints(100, 100, 5, 0.5);
      expect(points.length).toBe(20); // 10 vertices * 2 coordinates

      // Vertex 0 (outer tip pointing straight up): x = 50, y = 0
      expect(points[0]).toBeCloseTo(50, 2);
      expect(points[1]).toBeCloseTo(0, 2);

      // Vertex 1 (inner valley): factor = 0.5, radius = 25
      const angle1 = -Math.PI / 2 + Math.PI / 5;
      const expectedX1 = 50 + 25 * Math.cos(angle1);
      const expectedY1 = 50 + 25 * Math.sin(angle1);
      expect(points[2]).toBeCloseTo(expectedX1, 2);
      expect(points[3]).toBeCloseTo(expectedY1, 2);
    });

    it("should clamp points to MIN_STAR_POINTS (3) and MAX_STAR_POINTS (64)", () => {
      const minPoints = calculateStarPoints(100, 100, 2);
      expect(minPoints.length).toBe(MIN_STAR_POINTS * 4);

      const maxPoints = calculateStarPoints(100, 100, 99);
      expect(maxPoints.length).toBe(MAX_STAR_POINTS * 4);
    });

    it("should clamp innerRadiusRatio between 0.05 and 0.95", () => {
      const ratioLow = calculateStarPoints(100, 100, 5, 0.001);
      const ratioValidMin = calculateStarPoints(100, 100, 5, 0.05);
      expect(ratioLow).toEqual(ratioValidMin);

      const ratioHigh = calculateStarPoints(100, 100, 5, 0.999);
      const ratioValidMax = calculateStarPoints(100, 100, 5, 0.95);
      expect(ratioHigh).toEqual(ratioValidMax);
    });
  });

  describe("normalizeTransformedShapeGeometry", () => {
    it("should accurately bake scale into width and height", () => {
      const norm = normalizeTransformedShapeGeometry(1.5, 2, 100, 80);
      expect(norm).toEqual({ width: 150, height: 160 });
    });

    it("should enforce minimum dimension of 5px", () => {
      const norm = normalizeTransformedShapeGeometry(0.01, 0.01, 100, 100);
      expect(norm.width).toBeGreaterThanOrEqual(5);
      expect(norm.height).toBeGreaterThanOrEqual(5);
    });

    it("should handle negative or non-finite scales safely", () => {
      const norm = normalizeTransformedShapeGeometry(-2, NaN, 50, 40);
      expect(norm.width).toBe(100);
      expect(norm.height).toBe(40);
    });
  });
});
