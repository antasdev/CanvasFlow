import { describe, it, expect } from "vitest";
import {
  simplifyStroke,
  computeBoundingBox,
  normalizePointsToLocal,
} from "./stroke-simplification";

describe("stroke-simplification utilities", () => {
  describe("simplifyStroke", () => {
    it("returns empty or short arrays unchanged", () => {
      expect(simplifyStroke([])).toEqual([]);
      expect(simplifyStroke([10, 20])).toEqual([10, 20]);
      expect(simplifyStroke([10, 20, 30, 40])).toEqual([10, 20, 30, 40]);
    });

    it("eliminates redundant collinear points along a straight line", () => {
      // 5 collinear points from (0,0) to (40, 40)
      const line = [0, 0, 10, 10, 20, 20, 30, 30, 40, 40];
      const simplified = simplifyStroke(line, 1.2, 1.0);
      // Collinear points should be reduced to start and end
      expect(simplified).toEqual([0, 0, 40, 40]);
    });

    it("preserves sharp corners that exceed the tolerance", () => {
      // Triangle path: (0,0) -> (50, 100) -> (100, 0)
      const cornerPath = [0, 0, 25, 50, 50, 100, 75, 50, 100, 0];
      const simplified = simplifyStroke(cornerPath, 1.2, 1.0);
      expect(simplified.length).toBeLessThan(cornerPath.length);
      // The peak vertex (50, 100) must be preserved
      expect(simplified).toContain(50);
      expect(simplified).toContain(100);
    });

    it("simplifies smooth curves while maintaining overall shape contour", () => {
      // Circular arc sampled at 100 points
      const arc: number[] = [];
      const radius = 50;
      for (let i = 0; i <= 100; i++) {
        const theta = (i / 100) * Math.PI;
        arc.push(radius * Math.cos(theta), radius * Math.sin(theta));
      }
      const simplified = simplifyStroke(arc, 1.2, 1.0);
      // Retains key curve geometry with reduced density
      expect(simplified.length).toBeLessThan(arc.length);
      expect(simplified.length).toBeGreaterThanOrEqual(8);
      // Start and end points preserved
      expect(simplified[0]).toBeCloseTo(radius, 1);
      expect(simplified[simplified.length - 2]).toBeCloseTo(-radius, 1);
    });

    it("filters out noisy jitter below radial distance threshold", () => {
      // Points fluctuating within 0.3px of each other
      const noisyStroke = [
        0, 0,
        0.2, 0.1,
        0.1, 0.3,
        0.2, 0.2,
        20, 20,
      ];
      const simplified = simplifyStroke(noisyStroke, 1.2, 1.0);
      // Jitter points should be filtered, leaving start and end
      expect(simplified).toEqual([0, 0, 20, 20]);
    });

    it("handles large strokes with 1000 points efficiently without stack overflow", () => {
      const largeStroke: number[] = [];
      for (let i = 0; i < 500; i++) {
        largeStroke.push(i, i * 0.5);
      }
      const start = performance.now();
      const simplified = simplifyStroke(largeStroke, 1.5, 1.0);
      const elapsed = performance.now() - start;

      expect(simplified.length).toBeLessThan(largeStroke.length);
      expect(simplified.length % 2).toBe(0);
      expect(elapsed).toBeLessThan(100); // Sub-100ms execution
    });

    it("filters out NaN and Infinity coordinates safely", () => {
      const dirty = [0, 0, NaN, 10, 10, Infinity, 20, 20];
      const simplified = simplifyStroke(dirty, 1.2, 1.0);
      for (const val of simplified) {
        expect(Number.isFinite(val)).toBe(true);
      }
    });

    it("is strictly deterministic across multiple runs", () => {
      const noisyPath: number[] = [];
      for (let i = 0; i < 100; i++) {
        noisyPath.push(i * 2, Math.sin(i * 0.1) * 20);
      }
      const run1 = simplifyStroke(noisyPath);
      const run2 = simplifyStroke(noisyPath);
      expect(run1).toEqual(run2);
    });
  });

  describe("computeBoundingBox", () => {
    it("computes accurate minX, minY, width, and height", () => {
      const points = [100, 200, 150, 280, 80, 220, 120, 300];
      const bbox = computeBoundingBox(points, 2);
      expect(bbox.x).toBe(80);
      expect(bbox.y).toBe(200);
      expect(bbox.width).toBe(70); // 150 - 80
      expect(bbox.height).toBe(100); // 300 - 200
    });

    it("enforces minimum dimensions using strokeWidth for single points or flat strokes", () => {
      const singlePoint = [50, 50];
      const bbox = computeBoundingBox(singlePoint, 4);
      expect(bbox.x).toBe(50);
      expect(bbox.y).toBe(50);
      expect(bbox.width).toBe(4);
      expect(bbox.height).toBe(4);
    });
  });

  describe("normalizePointsToLocal", () => {
    it("translates world coordinates to local shape coordinates relative to (originX, originY)", () => {
      const worldPoints = [100, 150, 120, 180, 200, 250];
      const localPoints = normalizePointsToLocal(worldPoints, 100, 150);
      expect(localPoints).toEqual([0, 0, 20, 30, 100, 100]);
    });
  });
});
