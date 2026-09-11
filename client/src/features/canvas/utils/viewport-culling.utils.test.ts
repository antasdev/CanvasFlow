import { describe, it, expect } from "vitest";
import {
  getViewportWorldBounds,
  aabbIntersects,
  computeShapeWorldAABB,
  isShapeVisibleInViewport,
  filterVisibleRootShapes,
  DEFAULT_VIEWPORT_CULLING_MARGIN,
} from "./viewport-culling.utils";
import type { Shape, RectangleShape, LineShape, GroupShape } from "../types";

function createMockRect(id: string, x: number, y: number, width: number, height: number, overrides: Partial<RectangleShape> = {}): RectangleShape {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width,
    height,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 2,
    opacity: 1,
    rotation: 0,
    zIndex: 0,
    version: 1,
    ...overrides,
  };
}

function createMockLine(id: string, x: number, y: number, points: number[], strokeWidth = 2): LineShape {
  return {
    id,
    type: "line",
    x,
    y,
    width: 100,
    height: 50,
    points,
    stroke: "#000000",
    strokeWidth,
    opacity: 1,
    rotation: 0,
    zIndex: 0,
    version: 1,
  };
}

describe("viewport-culling.utils", () => {
  describe("getViewportWorldBounds", () => {
    it("computes exact world bounds for 1:1 viewport with zero pan and zero margin", () => {
      const bounds = getViewportWorldBounds({ width: 800, height: 600 }, { x: 0, y: 0 }, 1, 0);
      expect(bounds).toEqual({
        minX: 0,
        minY: 0,
        maxX: 800,
        maxY: 600,
        width: 800,
        height: 600,
      });
    });

    it("expands bounds symmetrically with margin", () => {
      const bounds = getViewportWorldBounds({ width: 800, height: 600 }, { x: 0, y: 0 }, 1, 100);
      expect(bounds).toEqual({
        minX: -100,
        minY: -100,
        maxX: 900,
        maxY: 700,
        width: 1000,
        height: 800,
      });
    });

    it("handles pan offset correctly", () => {
      // Panning canvas right by 200px and down by 150px means world coordinates shift negative
      const bounds = getViewportWorldBounds({ width: 800, height: 600 }, { x: 200, y: 150 }, 1, 0);
      expect(bounds).toEqual({
        minX: -200,
        minY: -150,
        maxX: 600,
        maxY: 450,
        width: 800,
        height: 600,
      });
    });

    it("handles zoom in (zoom = 2)", () => {
      const bounds = getViewportWorldBounds({ width: 800, height: 600 }, { x: 0, y: 0 }, 2, 0);
      expect(bounds).toEqual({
        minX: 0,
        minY: 0,
        maxX: 400,
        maxY: 300,
        width: 400,
        height: 300,
      });
    });

    it("handles zoom out (zoom = 0.5) and negative pan", () => {
      const bounds = getViewportWorldBounds({ width: 800, height: 600 }, { x: -400, y: -300 }, 0.5, 0);
      expect(bounds).toEqual({
        minX: 800,
        minY: 600,
        maxX: 2400,
        maxY: 1800,
        width: 1600,
        height: 1200,
      });
    });

    it("safely handles non-positive zoom and negative margin", () => {
      const bounds = getViewportWorldBounds({ width: 800, height: 600 }, { x: 0, y: 0 }, 0, -50);
      expect(bounds.width).toBe(800);
      expect(bounds.height).toBe(600);
    });
  });

  describe("aabbIntersects", () => {
    const boxA = { minX: 100, minY: 100, maxX: 200, maxY: 200 };

    it("returns true for overlapping boxes", () => {
      const boxB = { minX: 150, minY: 150, maxX: 250, maxY: 250 };
      expect(aabbIntersects(boxA, boxB)).toBe(true);
    });

    it("returns true for touching edges (boundary touching counts as visible)", () => {
      // Touching right edge
      expect(aabbIntersects(boxA, { minX: 200, minY: 100, maxX: 300, maxY: 200 })).toBe(true);
      // Touching left edge
      expect(aabbIntersects(boxA, { minX: 0, minY: 100, maxX: 100, maxY: 200 })).toBe(true);
      // Touching bottom edge
      expect(aabbIntersects(boxA, { minX: 100, minY: 200, maxX: 200, maxY: 300 })).toBe(true);
      // Touching top edge
      expect(aabbIntersects(boxA, { minX: 100, minY: 0, maxX: 200, maxY: 100 })).toBe(true);
    });

    it("returns false for completely disjoint boxes", () => {
      // Disjoint horizontally
      expect(aabbIntersects(boxA, { minX: 201, minY: 100, maxX: 300, maxY: 200 })).toBe(false);
      expect(aabbIntersects(boxA, { minX: 0, minY: 100, maxX: 99, maxY: 200 })).toBe(false);
      // Disjoint vertically
      expect(aabbIntersects(boxA, { minX: 100, minY: 201, maxX: 200, maxY: 300 })).toBe(false);
      expect(aabbIntersects(boxA, { minX: 100, minY: 0, maxX: 200, maxY: 99 })).toBe(false);
    });
  });

  describe("computeShapeWorldAABB", () => {
    it("computes AABB for unrotated box shape", () => {
      const rect = createMockRect("r1", 50, 60, 120, 80);
      const aabb = computeShapeWorldAABB(rect, new Map());
      expect(aabb).toEqual({
        minX: 50,
        minY: 60,
        maxX: 170,
        maxY: 140,
        width: 120,
        height: 80,
      });
    });

    it("computes AABB for rotated box shape (90 degrees)", () => {
      const rect = createMockRect("r2", 100, 100, 50, 30, { rotation: 90 });
      const aabb = computeShapeWorldAABB(rect, new Map());
      // A 50x30 rect rotated 90 deg clockwise around its top-left (100,100):
      // (0,0) -> (100,100)
      // (50,0) -> (100, 150)
      // (50,30) -> (70, 150)
      // (0,30) -> (70, 100)
      expect(Math.round(aabb.minX)).toBe(70);
      expect(Math.round(aabb.minY)).toBe(100);
      expect(Math.round(aabb.maxX)).toBe(100);
      expect(Math.round(aabb.maxY)).toBe(150);
    });

    it("computes AABB for point-based shape including stroke padding", () => {
      const line = createMockLine("l1", 10, 20, [0, 0, 100, 50], 4);
      const aabb = computeShapeWorldAABB(line, new Map());
      // halfStroke = 2
      // minX = 10 + 0 - 2 = 8, maxX = 10 + 100 + 2 = 112
      // minY = 20 + 0 - 2 = 18, maxY = 20 + 50 + 2 = 72
      expect(aabb.minX).toBe(8);
      expect(aabb.minY).toBe(18);
      expect(aabb.maxX).toBe(112);
      expect(aabb.maxY).toBe(72);
    });
  });

  describe("isShapeVisibleInViewport", () => {
    const vp = {
      minX: 0,
      minY: 0,
      maxX: 800,
      maxY: 600,
      width: 800,
      height: 600,
    };

    it("returns true for shape completely inside viewport", () => {
      const rect = createMockRect("r1", 100, 100, 50, 50);
      expect(isShapeVisibleInViewport(rect, new Map(), vp)).toBe(true);
    });

    it("returns true for shape crossing viewport boundary", () => {
      const rect = createMockRect("r2", -20, 100, 50, 50);
      expect(isShapeVisibleInViewport(rect, new Map(), vp)).toBe(true);
    });

    it("returns false for shape completely outside viewport", () => {
      const rect = createMockRect("r3", 1000, 1000, 50, 50);
      expect(isShapeVisibleInViewport(rect, new Map(), vp)).toBe(false);
    });
  });

  describe("filterVisibleRootShapes", () => {
    const vp = {
      minX: 0,
      minY: 0,
      maxX: 500,
      maxY: 500,
      width: 500,
      height: 500,
    };

    it("returns empty array for empty input", () => {
      expect(filterVisibleRootShapes([], vp)).toEqual([]);
    });

    it("culls offscreen shapes and retains visible root shapes", () => {
      const s1 = createMockRect("s1", 50, 50, 100, 100); // visible
      const s2 = createMockRect("s2", 1500, 1500, 100, 100); // offscreen
      const s3 = createMockRect("s3", 400, 400, 100, 100); // visible (partially crossing)
      const shapes: Shape[] = [s1, s2, s3];

      const visible = filterVisibleRootShapes(shapes, vp);
      expect(visible.map((s) => s.id)).toEqual(["s1", "s3"]);
    });

    it("preserves exact document z-order", () => {
      const s1 = createMockRect("s1", 10, 10, 50, 50);
      const s2 = createMockRect("s2", 2000, 2000, 50, 50); // culled
      const s3 = createMockRect("s3", 20, 20, 50, 50);
      const s4 = createMockRect("s4", 30, 30, 50, 50);

      const visible = filterVisibleRootShapes([s1, s2, s3, s4], vp);
      expect(visible.map((s) => s.id)).toEqual(["s1", "s3", "s4"]);
    });

    it("filters out non-root shapes (parentId is set)", () => {
      const parent = createMockRect("parent", 10, 10, 200, 200);
      const child = createMockRect("child", 20, 20, 50, 50, { parentId: "parent" });

      const visible = filterVisibleRootShapes([parent, child], vp);
      // GroupNode is responsible for rendering child; root filter must only return parent
      expect(visible.map((s) => s.id)).toEqual(["parent"]);
    });

    it("selection override: offscreen selected shape is never culled", () => {
      const s1 = createMockRect("s1", 50, 50, 100, 100); // visible
      const s2 = createMockRect("s2", 2000, 2000, 100, 100); // offscreen but selected
      const s3 = createMockRect("s3", 3000, 3000, 100, 100); // offscreen unselected

      const visible = filterVisibleRootShapes([s1, s2, s3], vp, {
        selectedShapeIds: ["s2"],
      });
      expect(visible.map((s) => s.id)).toEqual(["s1", "s2"]);
    });

    it("selection override: offscreen selected child forces root group to remain mounted", () => {
      const group: GroupShape = {
        id: "group1",
        type: "group",
        x: 2000,
        y: 2000,
        width: 200,
        height: 200,
        opacity: 1,
        rotation: 0,
        zIndex: 0,
        version: 1,
      };
      const child = createMockRect("child1", 2010, 2010, 50, 50, { parentId: "group1" });
      const visibleRect = createMockRect("v1", 10, 10, 50, 50);

      const visible = filterVisibleRootShapes([group, child, visibleRect], vp, {
        selectedShapeIds: ["child1"],
      });
      // group1 must be mounted because child1 is selected
      expect(visible.map((s) => s.id)).toEqual(["group1", "v1"]);
    });

    it("verifies default overscan margin constant is 100px", () => {
      expect(DEFAULT_VIEWPORT_CULLING_MARGIN).toBe(100);
    });

    it("pure function invariant: does not mutate the input array", () => {
      const s1 = createMockRect("s1", 10, 10, 50, 50);
      const s2 = createMockRect("s2", 2000, 2000, 50, 50);
      const original = [s1, s2];
      const copy = [...original];

      filterVisibleRootShapes(original, vp);
      expect(original).toEqual(copy);
    });
  });
});
