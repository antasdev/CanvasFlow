import { describe, it, expect } from "vitest";

import type { Shape, RectangleShape, LineShape } from "../types";

import {
  rotatePoint,
  getShapeCenter,
  getShapeAnchorPoint,
  getShapeAnchors,
  isConnectableShape,
  findNearestAnchor,
} from "./anchor.utils";

describe("anchor.utils", () => {
  const rectShape: RectangleShape = {
    id: "rect-1",
    type: "rectangle",
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    rotation: 0,
    zIndex: 1,
    opacity: 1,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 2,
  };

  describe("Shape center computation", () => {
    it("calculates shape center correctly", () => {
      const center = getShapeCenter(rectShape);
      expect(center.x).toBeCloseTo(200);
      expect(center.y).toBeCloseTo(150);
    });
  });

  describe("Anchor positions at 0° rotation", () => {
    it("calculates top anchor correctly", () => {
      const top = getShapeAnchorPoint(rectShape, "top");
      expect(top.x).toBeCloseTo(200);
      expect(top.y).toBeCloseTo(100);
    });

    it("calculates right anchor correctly", () => {
      const right = getShapeAnchorPoint(rectShape, "right");
      expect(right.x).toBeCloseTo(300);
      expect(right.y).toBeCloseTo(150);
    });

    it("calculates bottom anchor correctly", () => {
      const bottom = getShapeAnchorPoint(rectShape, "bottom");
      expect(bottom.x).toBeCloseTo(200);
      expect(bottom.y).toBeCloseTo(200);
    });

    it("calculates left anchor correctly", () => {
      const left = getShapeAnchorPoint(rectShape, "left");
      expect(left.x).toBeCloseTo(100);
      expect(left.y).toBeCloseTo(150);
    });

    it("calculates center anchor correctly", () => {
      const center = getShapeAnchorPoint(rectShape, "center");
      expect(center.x).toBeCloseTo(200);
      expect(center.y).toBeCloseTo(150);
    });

    it("returns all 5 anchors via getShapeAnchors", () => {
      const anchors = getShapeAnchors(rectShape);
      expect(anchors.top).toEqual({ x: 200, y: 100 });
      expect(anchors.right).toEqual({ x: 300, y: 150 });
      expect(anchors.bottom).toEqual({ x: 200, y: 200 });
      expect(anchors.left).toEqual({ x: 100, y: 150 });
      expect(anchors.center).toEqual({ x: 200, y: 150 });
    });
  });

  describe("Rotation mathematics", () => {
    // Square at (0, 0) with width 100, height 100, center at (50, 50)
    const square = { x: 0, y: 0, width: 100, height: 100, rotation: 0 };

    it("leaves points invariant at 0° rotation", () => {
      const p = rotatePoint({ x: 50, y: 0 }, { x: 50, y: 50 }, 0);
      expect(p.x).toBeCloseTo(50);
      expect(p.y).toBeCloseTo(0);
    });

    it("rotates top anchor by 90° clockwise to the right position", () => {
      const rotatedSquare = { ...square, rotation: 90 };
      const topRotated = getShapeAnchorPoint(rotatedSquare, "top");
      // Original top is (50, 0). Center is (50, 50).
      // Rotating 90° clockwise around (50, 50): dx = 0, dy = -50.
      // x' = 0 - (-50) + 50 = 100; y' = 0 + 0 + 50 = 50.
      expect(topRotated.x).toBeCloseTo(100);
      expect(topRotated.y).toBeCloseTo(50);
    });

    it("rotates top anchor by 180° to the bottom position", () => {
      const rotatedSquare = { ...square, rotation: 180 };
      const topRotated = getShapeAnchorPoint(rotatedSquare, "top");
      expect(topRotated.x).toBeCloseTo(50);
      expect(topRotated.y).toBeCloseTo(100);
    });

    it("rotates top anchor by 45°", () => {
      const rotatedSquare = { ...square, rotation: 45 };
      const topRotated = getShapeAnchorPoint(rotatedSquare, "top");
      const rad45 = (45 * Math.PI) / 180;
      // dx = 0, dy = -50
      // x' = cos(45)*0 - sin(45)*(-50) + 50 = 50 * sin(45) + 50
      // y' = sin(45)*0 + cos(45)*(-50) + 50 = -50 * cos(45) + 50
      const expectedX = 50 * Math.sin(rad45) + 50;
      const expectedY = -50 * Math.cos(rad45) + 50;
      expect(topRotated.x).toBeCloseTo(expectedX);
      expect(topRotated.y).toBeCloseTo(expectedY);
    });
  });

  describe("findNearestAnchor", () => {
    const shapes: Shape[] = [
      rectShape,
      {
        id: "sticky-1",
        type: "sticky_note",
        x: 500,
        y: 500,
        width: 100,
        height: 100,
        rotation: 0,
        zIndex: 2,
        opacity: 1,
        text: "Note",
        fontSize: 14,
        backgroundColor: "#ffeb3b",
        textColor: "#000000",
      },
    ];

    it("finds the nearest anchor when within threshold", () => {
      // Top anchor of rectShape is at (200, 100)
      const query = { x: 205, y: 105 };
      const nearest = findNearestAnchor(query, shapes, 20);
      expect(nearest).not.toBeNull();
      expect(nearest?.shapeId).toBe("rect-1");
      expect(nearest?.anchor).toBe("top");
      expect(nearest?.point.x).toBeCloseTo(200);
      expect(nearest?.point.y).toBeCloseTo(100);
    });

    it("returns null when no anchor is within threshold", () => {
      const farAway = { x: 999, y: 999 };
      const nearest = findNearestAnchor(farAway, shapes, 20);
      expect(nearest).toBeNull();
    });

    it("respects custom threshold limits", () => {
      // Right anchor is at (300, 150). Query at (315, 150) is 15px away.
      const query = { x: 315, y: 150 };
      // Within threshold 20:
      expect(findNearestAnchor(query, shapes, 20)).not.toBeNull();
      // Outside threshold 10:
      expect(findNearestAnchor(query, shapes, 10)).toBeNull();
    });

    it("ignores unsupported shape types (like line or freehand)", () => {
      const lineShape: LineShape = {
        id: "line-1",
        type: "line",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        zIndex: 3,
        opacity: 1,
        points: [0, 0, 100, 100],
        stroke: "#000",
        strokeWidth: 2,
      };

      expect(isConnectableShape(lineShape)).toBe(false);
      const nearest = findNearestAnchor({ x: 0, y: 0 }, [lineShape], 50);
      expect(nearest).toBeNull();
    });

    it("correctly snaps to anchors of rotated shapes", () => {
      const rotatedRect: RectangleShape = {
        ...rectShape,
        id: "rotated-rect",
        rotation: 90,
      };
      // Center of rect is (200, 150).
      // Top anchor was at (200, 100), rotated 90° around (200, 150):
      // dx = 0, dy = -50 -> x' = 250, y' = 150.
      const query = { x: 252, y: 151 };
      const nearest = findNearestAnchor(query, [rotatedRect], 20);
      expect(nearest).not.toBeNull();
      expect(nearest?.anchor).toBe("top");
      expect(nearest?.point.x).toBeCloseTo(250);
      expect(nearest?.point.y).toBeCloseTo(150);
    });
  });
});
