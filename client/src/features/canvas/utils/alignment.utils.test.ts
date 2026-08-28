import { describe, expect, it } from "vitest";
import type { RectangleShape, GroupShape } from "../types";
import {
  calculateAlignmentTargets,
  calculateDistributionTargets,
  convertWorldPositionToLocal,
  getShapeWorldAABB,
} from "./alignment.utils";

describe("alignment.utils", () => {
  // Test shapes
  const rectA: RectangleShape = {
    id: "rect-a",
    type: "rectangle",
    x: 100,
    y: 100,
    width: 60,
    height: 40,
    rotation: 0,
    zIndex: 1,
    opacity: 1,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  };

  const rectB: RectangleShape = {
    id: "rect-b",
    type: "rectangle",
    x: 200,
    y: 150,
    width: 80,
    height: 50,
    rotation: 0,
    zIndex: 2,
    opacity: 1,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  };

  const rectC: RectangleShape = {
    id: "rect-c",
    type: "rectangle",
    x: 350,
    y: 300,
    width: 50,
    height: 50,
    rotation: 0,
    zIndex: 3,
    opacity: 1,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  };

  describe("getShapeWorldAABB", () => {
    it("returns correct axis-aligned bounding box for unrotated shape", () => {
      const aabb = getShapeWorldAABB(rectA, [rectA]);
      expect(aabb.minX).toBe(100);
      expect(aabb.minY).toBe(100);
      expect(aabb.maxX).toBe(160);
      expect(aabb.maxY).toBe(140);
      expect(aabb.width).toBe(60);
      expect(aabb.height).toBe(40);
      expect(aabb.centerX).toBe(130);
      expect(aabb.centerY).toBe(120);
    });

    it("returns correct axis-aligned bounding box for rotated shape", () => {
      // 100x100 square rotated 45 degrees around center (150, 150)
      const rotatedRect: RectangleShape = {
        id: "r-rot",
        type: "rectangle",
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        rotation: 45,
        zIndex: 1,
        opacity: 1,
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 1,
      };

      const aabb = getShapeWorldAABB(rotatedRect, [rotatedRect]);
      // diagonal of 100x100 is 141.42
      expect(aabb.centerX).toBe(150);
      expect(aabb.centerY).toBe(150);
      expect(aabb.width).toBeCloseTo(141.42, 1);
      expect(aabb.height).toBeCloseTo(141.42, 1);
    });
  });

  describe("Alignment calculations", () => {
    const shapes = [rectA, rectB, rectC];

    it("aligns left correctly", () => {
      const targets = calculateAlignmentTargets(shapes, shapes, "left");
      // overallMinX is 100 (rectA.x)
      expect(targets.get("rect-a")?.targetLocalX).toBe(100);
      expect(targets.get("rect-b")?.targetLocalX).toBe(100);
      expect(targets.get("rect-c")?.targetLocalX).toBe(100);
    });

    it("aligns right correctly", () => {
      const targets = calculateAlignmentTargets(shapes, shapes, "right");
      // overallMaxX is 400 (rectC.maxX: 350 + 50)
      // rectA width is 60 -> targetX = 400 - 60 = 340
      expect(targets.get("rect-a")?.targetLocalX).toBe(340);
      // rectB width is 80 -> targetX = 400 - 80 = 320
      expect(targets.get("rect-b")?.targetLocalX).toBe(320);
      // rectC width is 50 -> targetX = 400 - 50 = 350
      expect(targets.get("rect-c")?.targetLocalX).toBe(350);
    });

    it("aligns center horizontally using overall bounds center", () => {
      const targets = calculateAlignmentTargets(shapes, shapes, "center-horizontal");
      // overallMinX = 100, overallMaxX = 400 -> overallCenterX = 250
      // rectA width = 60 -> targetX = 250 - 30 = 220
      expect(targets.get("rect-a")?.targetLocalX).toBe(220);
      // rectB width = 80 -> targetX = 250 - 40 = 210
      expect(targets.get("rect-b")?.targetLocalX).toBe(210);
      // rectC width = 50 -> targetX = 250 - 25 = 225
      expect(targets.get("rect-c")?.targetLocalX).toBe(225);
    });

    it("aligns top correctly", () => {
      const targets = calculateAlignmentTargets(shapes, shapes, "top");
      // overallMinY is 100 (rectA.y)
      expect(targets.get("rect-a")?.targetLocalY).toBe(100);
      expect(targets.get("rect-b")?.targetLocalY).toBe(100);
      expect(targets.get("rect-c")?.targetLocalY).toBe(100);
    });

    it("aligns bottom correctly", () => {
      const targets = calculateAlignmentTargets(shapes, shapes, "bottom");
      // overallMaxY is 350 (rectC: 300 + 50)
      // rectA height is 40 -> targetY = 350 - 40 = 310
      expect(targets.get("rect-a")?.targetLocalY).toBe(310);
      // rectB height is 50 -> targetY = 350 - 50 = 300
      expect(targets.get("rect-b")?.targetLocalY).toBe(300);
      // rectC height is 50 -> targetY = 350 - 50 = 300
      expect(targets.get("rect-c")?.targetLocalY).toBe(300);
    });

    it("aligns center vertically correctly", () => {
      const targets = calculateAlignmentTargets(shapes, shapes, "center-vertical");
      // overallMinY = 100, overallMaxY = 350 -> overallCenterY = 225
      // rectA height = 40 -> targetY = 225 - 20 = 205
      expect(targets.get("rect-a")?.targetLocalY).toBe(205);
      // rectB height = 50 -> targetY = 225 - 25 = 200
      expect(targets.get("rect-b")?.targetLocalY).toBe(200);
      // rectC height = 50 -> targetY = 225 - 25 = 200
      expect(targets.get("rect-c")?.targetLocalY).toBe(200);
    });
  });

  describe("Distribution calculations", () => {
    // 3 rectangles along X:
    // s1: x=0, width=40 (right=40)
    // s2: x=70, width=40 (right=110)
    // s3: x=200, width=40 (right=240)
    // totalSpan = 240, sumWidths = 120, totalGap = 120, gapCount = 2 -> gap = 60
    const s1: RectangleShape = { id: "s1", type: "rectangle", x: 0, y: 50, width: 40, height: 40, rotation: 0, zIndex: 1, opacity: 1, fill: "#ffffff", stroke: "#000000", strokeWidth: 1 };
    const s2: RectangleShape = { id: "s2", type: "rectangle", x: 70, y: 50, width: 40, height: 40, rotation: 0, zIndex: 2, opacity: 1, fill: "#ffffff", stroke: "#000000", strokeWidth: 1 };
    const s3: RectangleShape = { id: "s3", type: "rectangle", x: 200, y: 50, width: 40, height: 40, rotation: 0, zIndex: 3, opacity: 1, fill: "#ffffff", stroke: "#000000", strokeWidth: 1 };
    const shapes = [s1, s2, s3];

    it("distributes horizontal spacing evenly", () => {
      const targets = calculateDistributionTargets(shapes, shapes, "horizontal");
      // s1 fixed at x=0
      expect(targets.get("s1")?.targetLocalX).toBe(0);
      // s2 placed at s1.right(40) + gap(60) = 100
      expect(targets.get("s2")?.targetLocalX).toBe(100);
      // s3 fixed at x=200
      expect(targets.get("s3")?.targetLocalX).toBe(200);
    });

    it("distributes vertical spacing evenly", () => {
      const v1: RectangleShape = { id: "v1", type: "rectangle", x: 50, y: 0, width: 40, height: 40, rotation: 0, zIndex: 1, opacity: 1, fill: "#ffffff", stroke: "#000000", strokeWidth: 1 };
      const v2: RectangleShape = { id: "v2", type: "rectangle", x: 50, y: 50, width: 40, height: 40, rotation: 0, zIndex: 2, opacity: 1, fill: "#ffffff", stroke: "#000000", strokeWidth: 1 };
      const v3: RectangleShape = { id: "v3", type: "rectangle", x: 50, y: 200, width: 40, height: 40, rotation: 0, zIndex: 3, opacity: 1, fill: "#ffffff", stroke: "#000000", strokeWidth: 1 };
      const vShapes = [v1, v2, v3];

      const targets = calculateDistributionTargets(vShapes, vShapes, "vertical");
      expect(targets.get("v1")?.targetLocalY).toBe(0);
      expect(targets.get("v2")?.targetLocalY).toBe(100);
      expect(targets.get("v3")?.targetLocalY).toBe(200);
    });

    it("handles negative / overlapping spacing gracefully without NaN", () => {
      // Overlapping shapes where sum of widths exceeds span
      const o1: RectangleShape = { id: "o1", type: "rectangle", x: 0, y: 0, width: 100, height: 50, rotation: 0, zIndex: 1, opacity: 1, fill: "#ffffff", stroke: "#000000", strokeWidth: 1 };
      const o2: RectangleShape = { id: "o2", type: "rectangle", x: 20, y: 0, width: 100, height: 50, rotation: 0, zIndex: 2, opacity: 1, fill: "#ffffff", stroke: "#000000", strokeWidth: 1 };
      const o3: RectangleShape = { id: "o3", type: "rectangle", x: 50, y: 0, width: 100, height: 50, rotation: 0, zIndex: 3, opacity: 1, fill: "#ffffff", stroke: "#000000", strokeWidth: 1 };
      const oShapes = [o1, o2, o3];

      const targets = calculateDistributionTargets(oShapes, oShapes, "horizontal");
      expect(targets.get("o1")?.targetLocalX).toBe(0);
      expect(targets.get("o3")?.targetLocalX).toBe(50);
      // o2 should be placed at the center midpoint (centerSpan / 2)
      expect(Number.isFinite(targets.get("o2")?.targetLocalX)).toBe(true);
      expect(targets.get("o2")?.targetLocalX).toBe(25);
    });
  });

  describe("Group & Nested Group coordinate transformations", () => {
    // Parent group at (200, 200)
    const group: GroupShape = {
      id: "grp-1",
      type: "group",
      x: 200,
      y: 200,
      width: 300,
      height: 300,
      rotation: 0,
      zIndex: 1,
      opacity: 1,
    };

    // Child shape inside group with local x=20, y=30 -> world x=220, y=230
    const childShape: RectangleShape = {
      id: "child-1",
      type: "rectangle",
      x: 20,
      y: 30,
      width: 50,
      height: 50,
      parentId: "grp-1",
      rotation: 0,
      zIndex: 2,
      opacity: 1,
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 1,
    };

    // Root shape at world x=100, y=100
    const rootShape: RectangleShape = {
      id: "root-1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 50,
      height: 50,
      rotation: 0,
      zIndex: 3,
      opacity: 1,
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 1,
    };

    const allShapes = [group, childShape, rootShape];

    it("calculates correct world AABB for grouped child", () => {
      const aabb = getShapeWorldAABB(childShape, allShapes);
      expect(aabb.minX).toBe(220);
      expect(aabb.minY).toBe(230);
      expect(aabb.maxX).toBe(270);
      expect(aabb.maxY).toBe(280);
    });

    it("aligns child inside group while preserving group coordinate system", () => {
      // Align rootShape (worldX: 100) and childShape (worldX: 220) to Left
      // Leftmost edge is 100 (rootShape).
      // childShape target worldX is 100.
      // Since childShape parent is grp-1 at worldX: 200, child's local x must become: 100 - 200 = -100!
      const targets = calculateAlignmentTargets([rootShape, childShape], allShapes, "left");

      expect(targets.get("root-1")?.targetLocalX).toBe(100);
      expect(targets.get("child-1")?.targetLocalX).toBe(-100);
    });

    it("round-trips world to local conversion with precision", () => {
      const worldPos = { x: 350, y: 450 };
      const localPos = convertWorldPositionToLocal(childShape, allShapes, worldPos);
      // Group is at (200, 200), so local should be (150, 250)
      expect(localPos.x).toBe(150);
      expect(localPos.y).toBe(250);
    });
  });
});
