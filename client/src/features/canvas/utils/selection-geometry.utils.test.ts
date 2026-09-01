import { describe, expect, it } from "vitest";

import type {
  RectangleShape,
  CircleShape,
  TriangleShape,
  LineShape,
  Shape,
} from "../types";

import {
  pointInPolygon,
  segmentsIntersect,
  polygonIntersectsPolygon,
  polygonContainsPolygon,
  polylineIntersectsPolygon,
  polylineInsidePolygon,
  circleIntersectsPolygon,
  circleContainedInPolygon,
  getShapeGeometryInWorld,
  hitTestShapeGeometry,
  hitTestPointWithShape,
  marqueeToPolygon,
} from "./selection-geometry.utils";

describe("selection-geometry.utils", () => {
  describe("pointInPolygon", () => {
    // 100x100 square from (0,0) to (100,100)
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    it("returns true for a point strictly inside", () => {
      expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    });

    it("returns false for a point strictly outside", () => {
      expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
      expect(pointInPolygon({ x: -10, y: 50 }, square)).toBe(false);
    });

    it("returns true for points on vertices", () => {
      expect(pointInPolygon({ x: 0, y: 0 }, square)).toBe(true);
      expect(pointInPolygon({ x: 100, y: 100 }, square)).toBe(true);
    });

    it("returns true for points on edges", () => {
      expect(pointInPolygon({ x: 50, y: 0 }, square)).toBe(true);
      expect(pointInPolygon({ x: 100, y: 50 }, square)).toBe(true);
    });

    it("handles concave polygons correctly (L-shape)", () => {
      // L-shape polygon
      const lShape = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 50 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      // (25, 25) is inside the vertical stem
      expect(pointInPolygon({ x: 25, y: 25 }, lShape)).toBe(true);
      // (75, 25) is in the cut-out corner (outside)
      expect(pointInPolygon({ x: 75, y: 25 }, lShape)).toBe(false);
      // (75, 75) is inside the base
      expect(pointInPolygon({ x: 75, y: 75 }, lShape)).toBe(true);
    });

    it("returns false for degenerate polygons (< 3 vertices)", () => {
      expect(pointInPolygon({ x: 5, y: 5 }, [])).toBe(false);
      expect(pointInPolygon({ x: 5, y: 5 }, [{ x: 0, y: 0 }])).toBe(false);
      expect(pointInPolygon({ x: 5, y: 5 }, [{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe(false);
    });
  });

  describe("segmentsIntersect", () => {
    it("detects regular crossing segments", () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 10 };
      const p3 = { x: 0, y: 10 };
      const p4 = { x: 10, y: 0 };
      expect(segmentsIntersect(p1, p2, p3, p4)).toBe(true);
    });

    it("detects non-intersecting parallel segments", () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 0 };
      const p3 = { x: 0, y: 5 };
      const p4 = { x: 10, y: 5 };
      expect(segmentsIntersect(p1, p2, p3, p4)).toBe(false);
    });

    it("detects collinear overlapping segments", () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 0 };
      const p3 = { x: 5, y: 0 };
      const p4 = { x: 15, y: 0 };
      expect(segmentsIntersect(p1, p2, p3, p4)).toBe(true);
    });

    it("detects shared endpoint / T-junction", () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 0 };
      const p3 = { x: 5, y: 0 };
      const p4 = { x: 5, y: 5 };
      expect(segmentsIntersect(p1, p2, p3, p4)).toBe(true);
    });
  });

  describe("polygonIntersectsPolygon & polygonContainsPolygon", () => {
    const boxA = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    it("detects partial overlap intersection", () => {
      const boxB = [
        { x: 50, y: 50 },
        { x: 150, y: 50 },
        { x: 150, y: 150 },
        { x: 50, y: 150 },
      ];
      expect(polygonIntersectsPolygon(boxA, boxB)).toBe(true);
      expect(polygonContainsPolygon(boxA, boxB)).toBe(false);
    });

    it("detects full containment", () => {
      const inner = [
        { x: 20, y: 20 },
        { x: 80, y: 20 },
        { x: 80, y: 80 },
        { x: 20, y: 80 },
      ];
      expect(polygonIntersectsPolygon(boxA, inner)).toBe(true);
      expect(polygonContainsPolygon(boxA, inner)).toBe(true);
      expect(polygonContainsPolygon(inner, boxA)).toBe(false);
    });

    it("returns false for completely disjoint polygons", () => {
      const farBox = [
        { x: 200, y: 200 },
        { x: 300, y: 200 },
        { x: 300, y: 300 },
        { x: 200, y: 300 },
      ];
      expect(polygonIntersectsPolygon(boxA, farBox)).toBe(false);
      expect(polygonContainsPolygon(boxA, farBox)).toBe(false);
    });

    it("correctly handles rotated rectangle intersection vs containment", () => {
      // 100x100 square centered at (150, 150) rotated 45 degrees
      // Diagonals reach approx (150 +- 70.71, 150 +- 70.71)
      const marqueeContainment = [
        { x: 50, y: 50 },
        { x: 250, y: 50 },
        { x: 250, y: 250 },
        { x: 50, y: 250 },
      ];
      const marqueePartial = [
        { x: 0, y: 0 },
        { x: 140, y: 0 },
        { x: 140, y: 150 },
        { x: 0, y: 150 },
      ];

      const rotatedDiamond = [
        { x: 150, y: 79.29 },
        { x: 220.71, y: 150 },
        { x: 150, y: 220.71 },
        { x: 79.29, y: 150 },
      ];

      expect(polygonContainsPolygon(marqueeContainment, rotatedDiamond)).toBe(true);
      expect(polygonIntersectsPolygon(marqueePartial, rotatedDiamond)).toBe(true);
      expect(polygonContainsPolygon(marqueePartial, rotatedDiamond)).toBe(false);
    });
  });

  describe("polylineIntersectsPolygon & polylineInsidePolygon", () => {
    const marquee = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ];

    it("detects polyline completely inside polygon", () => {
      const lineInside = [{ x: 120, y: 120 }, { x: 180, y: 180 }];
      expect(polylineInsidePolygon(lineInside, marquee)).toBe(true);
      expect(polylineIntersectsPolygon(lineInside, marquee)).toBe(true);
    });

    it("detects polyline crossing polygon boundary", () => {
      const lineCrossing = [{ x: 50, y: 150 }, { x: 250, y: 150 }];
      expect(polylineInsidePolygon(lineCrossing, marquee)).toBe(false);
      expect(polylineIntersectsPolygon(lineCrossing, marquee)).toBe(true);
    });

    it("returns false for polyline completely outside", () => {
      const lineOutside = [{ x: 10, y: 10 }, { x: 50, y: 50 }];
      expect(polylineInsidePolygon(lineOutside, marquee)).toBe(false);
      expect(polylineIntersectsPolygon(lineOutside, marquee)).toBe(false);
    });
  });

  describe("circleIntersectsPolygon & circleContainedInPolygon", () => {
    const marquee = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 300 },
      { x: 100, y: 300 },
    ];

    it("detects circle completely inside", () => {
      const center = { x: 200, y: 200 };
      const radius = 40;
      expect(circleContainedInPolygon(center, radius, marquee)).toBe(true);
      expect(circleIntersectsPolygon(center, radius, marquee)).toBe(true);
    });

    it("detects circle crossing marquee boundary", () => {
      const center = { x: 100, y: 200 }; // Center on left edge
      const radius = 30;
      expect(circleContainedInPolygon(center, radius, marquee)).toBe(false);
      expect(circleIntersectsPolygon(center, radius, marquee)).toBe(true);
    });

    it("returns false for distant circle", () => {
      const center = { x: 500, y: 500 };
      const radius = 20;
      expect(circleContainedInPolygon(center, radius, marquee)).toBe(false);
      expect(circleIntersectsPolygon(center, radius, marquee)).toBe(false);
    });
  });

  describe("marqueeToPolygon", () => {
    it("handles normal left-to-right top-to-bottom drag", () => {
      const poly = marqueeToPolygon({
        startX: 10,
        startY: 20,
        currentX: 110,
        currentY: 120,
        direction: "left-to-right",
        matchMode: "containment",
      });
      expect(poly).toEqual([
        { x: 10, y: 20 },
        { x: 110, y: 20 },
        { x: 110, y: 120 },
        { x: 10, y: 120 },
      ]);
    });

    it("handles reverse right-to-left bottom-to-top drag", () => {
      const poly = marqueeToPolygon({
        startX: 110,
        startY: 120,
        currentX: 10,
        currentY: 20,
        direction: "right-to-left",
        matchMode: "intersection",
      });
      expect(poly).toEqual([
        { x: 10, y: 20 },
        { x: 110, y: 20 },
        { x: 110, y: 120 },
        { x: 10, y: 120 },
      ]);
    });
  });

  describe("getShapeGeometryInWorld & hit testing for all shape types", () => {
    const rect: RectangleShape = {
      id: "r1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 50,
      height: 50,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      fill: "#fff",
      stroke: "#000",
      strokeWidth: 1,
    };

    const circle: CircleShape = {
      id: "c1",
      type: "circle",
      x: 200,
      y: 100,
      width: 60,
      height: 60,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      fill: "#fff",
      stroke: "#000",
      strokeWidth: 1,
    };

    const triangle: TriangleShape = {
      id: "t1",
      type: "triangle",
      x: 300,
      y: 100,
      width: 60,
      height: 60,
      rotation: 0,
      opacity: 1,
      zIndex: 3,
      fill: "#fff",
      stroke: "#000",
      strokeWidth: 1,
    };

    const line: LineShape = {
      id: "l1",
      type: "line",
      x: 400,
      y: 100,
      width: 80,
      height: 40,
      rotation: 0,
      opacity: 1,
      zIndex: 4,
      points: [0, 0, 80, 40],
      stroke: "#000",
      strokeWidth: 2,
    };

    const allShapes: Shape[] = [rect, circle, triangle, line];

    it("extracts world geometry for rectangle, circle, triangle, line", () => {
      const rGeom = getShapeGeometryInWorld(rect, allShapes);
      expect(rGeom.kind).toBe("polygon");

      const cGeom = getShapeGeometryInWorld(circle, allShapes);
      expect(cGeom.kind).toBe("circle");

      const tGeom = getShapeGeometryInWorld(triangle, allShapes);
      expect(tGeom.kind).toBe("polygon");

      const lGeom = getShapeGeometryInWorld(line, allShapes);
      expect(lGeom.kind).toBe("polyline");
    });

    it("tests containment and intersection against a marquee enclosing rect and circle", () => {
      // Marquee from (80, 80) to (280, 180) encloses r1 and c1 completely
      const marquee = [
        { x: 80, y: 80 },
        { x: 280, y: 80 },
        { x: 280, y: 180 },
        { x: 80, y: 180 },
      ];

      const rGeom = getShapeGeometryInWorld(rect, allShapes);
      const cGeom = getShapeGeometryInWorld(circle, allShapes);
      const tGeom = getShapeGeometryInWorld(triangle, allShapes);

      expect(hitTestShapeGeometry(rGeom, marquee, "containment")).toBe(true);
      expect(hitTestShapeGeometry(cGeom, marquee, "containment")).toBe(true);
      expect(hitTestShapeGeometry(tGeom, marquee, "containment")).toBe(false);

      expect(hitTestShapeGeometry(rGeom, marquee, "intersection")).toBe(true);
      expect(hitTestShapeGeometry(cGeom, marquee, "intersection")).toBe(true);
      expect(hitTestShapeGeometry(tGeom, marquee, "intersection")).toBe(false);
    });

    it("tests hitTestPointWithShape for precise point clicks", () => {
      const rGeom = getShapeGeometryInWorld(rect, allShapes);
      expect(hitTestPointWithShape({ x: 125, y: 125 }, rGeom)).toBe(true);
      expect(hitTestPointWithShape({ x: 90, y: 90 }, rGeom)).toBe(false);

      const cGeom = getShapeGeometryInWorld(circle, allShapes);
      expect(hitTestPointWithShape({ x: 230, y: 130 }, cGeom)).toBe(true); // center
      expect(hitTestPointWithShape({ x: 201, y: 101 }, cGeom)).toBe(false); // corner of bounding box, outside circle
    });
  });
});
