import { describe, it, expect } from "vitest";

import type { Shape, RectangleShape, GroupShape } from "../types";

import {
  computeGroupBoundingBox,
  worldToLocal,
  localToWorld,
  getShapeWorldTransform,
  getShapeWorldBounds,
  hasCyclicHierarchy,
} from "./group-geometry.utils";

describe("group-geometry.utils", () => {
  const rect1: RectangleShape = {
    id: "rect-1",
    type: "rectangle",
    x: 100,
    y: 100,
    width: 50,
    height: 50,
    rotation: 0,
    zIndex: 1,
    opacity: 1,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  };

  const rect2: RectangleShape = {
    id: "rect-2",
    type: "rectangle",
    x: 200,
    y: 150,
    width: 100,
    height: 50,
    rotation: 0,
    zIndex: 2,
    opacity: 1,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  };

  describe("computeGroupBoundingBox", () => {
    it("returns zero bounding box for empty shapes array", () => {
      expect(computeGroupBoundingBox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    it("computes exact bounding box for unrotated shapes", () => {
      const box = computeGroupBoundingBox([rect1, rect2]);
      expect(box).not.toBeNull();
      expect(box!.x).toBe(100);
      expect(box!.y).toBe(100);
      // rect2 extends to x: 200+100=300, y: 150+50=200
      expect(box!.width).toBe(200);
      expect(box!.height).toBe(100);
    });

    it("computes expanded bounding box for rotated shapes", () => {
      const rotatedRect: RectangleShape = {
        ...rect1,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 45,
      };
      const box = computeGroupBoundingBox([rotatedRect]);
      expect(box).not.toBeNull();
      // 100x100 rotated 45 deg centered at (50, 50) spans ~141.42
      expect(box!.x).toBeLessThan(0);
      expect(box!.y).toBeLessThan(0);
      expect(box!.width).toBeGreaterThan(100);
      expect(box!.height).toBeGreaterThan(100);
    });
  });

  describe("worldToLocal and localToWorld", () => {
    const group: GroupShape = {
      id: "group-1",
      type: "group",
      x: 100,
      y: 150,
      width: 200,
      height: 200,
      rotation: 0,
      zIndex: 1,
      opacity: 1,
    };

    it("converts world point to local space with 0 rotation", () => {
      const local = worldToLocal({ x: 150, y: 200 }, group);
      expect(local.x).toBe(50);
      expect(local.y).toBe(50);
    });

    it("inverts local point back to world space", () => {
      const local = { x: 50, y: 50 };
      const world = localToWorld(local, group);
      expect(world.x).toBe(150);
      expect(world.y).toBe(200);
    });

    it("handles rotated group conversion correctly", () => {
      const rotatedGroup: GroupShape = {
        ...group,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 90,
      };

      const point = { x: 10, y: 20 };
      const local = worldToLocal(point, rotatedGroup);
      const restored = localToWorld(local, rotatedGroup);

      expect(restored.x).toBeCloseTo(point.x);
      expect(restored.y).toBeCloseTo(point.y);
    });
  });

  describe("getShapeWorldTransform and nested groups", () => {
    it("returns shape own transform when parentId is not set", () => {
      const transform = getShapeWorldTransform(rect1, [rect1]);
      expect(transform.x).toBe(rect1.x);
      expect(transform.y).toBe(rect1.y);
      expect(transform.rotation).toBe(rect1.rotation);
    });

    it("accumulates translation and rotation for child in parent group", () => {
      const parentGroup: GroupShape = {
        id: "g1",
        type: "group",
        x: 50,
        y: 50,
        width: 200,
        height: 200,
        rotation: 90,
        zIndex: 1,
        opacity: 1,
      };

      const child: RectangleShape = {
        ...rect1,
        id: "c1",
        parentId: "g1",
        x: 10,
        y: 20,
        rotation: 0,
      };

      const shapes: Shape[] = [parentGroup, child];
      const transform = getShapeWorldTransform(child, shapes);

      // Child rotation should include parent's rotation (0 + 90 = 90)
      expect(transform.rotation).toBe(90);

      // Parent center is at (150, 150)
      // Child center in parent space is (x: 10 + 25 = 35, y: 20 + 25 = 45)
      // Transformed center should match world coordinates
      const worldBounds = getShapeWorldBounds(child, shapes);
      expect(worldBounds.width).toBe(50);
      expect(worldBounds.height).toBe(50);
    });

    it("prevents infinite loops when cyclic hierarchy is detected", () => {
      const s1: Shape = { ...rect1, id: "s1", parentId: "s2" };
      const s2: Shape = { ...rect2, id: "s2", parentId: "s1" };
      const shapes = [s1, s2];

      expect(hasCyclicHierarchy("s1", "s2", shapes)).toBe(true);

      // Should not throw or enter infinite recursion
      const transform = getShapeWorldTransform(s1, shapes);
      expect(transform).toBeDefined();
    });
  });

  describe("hasCyclicHierarchy", () => {
    it("returns false for valid hierarchical nesting", () => {
      const g1: Shape = { ...rect1, id: "g1", parentId: null };
      const g2: Shape = { ...rect2, id: "g2", parentId: "g1" };
      const child: Shape = { ...rect1, id: "child", parentId: "g2" };
      const shapes = [g1, g2, child];

      expect(hasCyclicHierarchy("child", "g2", shapes)).toBe(false);
      expect(hasCyclicHierarchy("child", "g1", shapes)).toBe(false);
    });

    it("returns true if prospective parent is a descendant of shape", () => {
      const g1: Shape = { ...rect1, id: "g1", parentId: null };
      const g2: Shape = { ...rect2, id: "g2", parentId: "g1" };
      const shapes = [g1, g2];

      // Making g1 a child of g2 would create a cycle (g1 -> g2 -> g1)
      expect(hasCyclicHierarchy("g1", "g2", shapes)).toBe(true);
    });
  });
});
