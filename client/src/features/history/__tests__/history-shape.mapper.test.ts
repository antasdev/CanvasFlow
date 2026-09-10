import { describe, expect, it } from "vitest";

import type {
  ArrowShape,
  CircleShape,
  ConnectorShape,
  EllipseShape,
  FreehandShape,
  GroupShape,
  LineShape,
  PolygonShape,
  RectangleShape,
  StarShape,
  StickyNoteShape,
  TextShape,
  TriangleShape,
} from "@/features/canvas/types";

import type { VersionShapeSnapshot } from "../types/history.types";
import { mapVersionShapeSnapshotToShape } from "../utils/history-shape.mapper";

describe("History Shape Mapper (mapVersionShapeSnapshotToShape)", () => {
  it("maps rectangle snapshot to RectangleShape with style & shadow", () => {
    const snapshot: VersionShapeSnapshot = {
      id: "rect-1",
      canvasId: "c-1",
      type: "rectangle",
      x: 100,
      y: 150,
      width: 200,
      height: 120,
      rotation: 45,
      zIndex: 1,
      style: {
        fill: "#3b82f6",
        stroke: "#1e40af",
        strokeWidth: 3,
        strokeStyle: "dashed",
        opacity: 0.9,
        shadow: {
          enabled: true,
          color: "#000000",
          blur: 12,
          offsetX: 4,
          offsetY: 8,
          opacity: 0.25,
        },
      },
      version: 2,
    };

    const shape = mapVersionShapeSnapshotToShape(snapshot) as RectangleShape;
    expect(shape.id).toBe("rect-1");
    expect(shape.type).toBe("rectangle");
    expect(shape.x).toBe(100);
    expect(shape.y).toBe(150);
    expect(shape.width).toBe(200);
    expect(shape.height).toBe(120);
    expect(shape.rotation).toBe(45);
    expect(shape.fill).toBe("#3b82f6");
    expect(shape.stroke).toBe("#1e40af");
    expect(shape.strokeWidth).toBe(3);
    expect(shape.strokeStyle).toBe("dashed");
    expect(shape.opacity).toBe(0.9);
    expect(shape.shadow?.enabled).toBe(true);
    expect(shape.shadow?.blur).toBe(12);
  });

  it("maps circle, ellipse, and triangle shapes correctly", () => {
    const circleSnap: VersionShapeSnapshot = {
      id: "circle-1",
      canvasId: "c-1",
      type: "circle",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      style: { fill: "#10b981", stroke: "#047857" },
    };
    const circle = mapVersionShapeSnapshotToShape(circleSnap) as CircleShape;
    expect(circle.type).toBe("circle");
    expect(circle.fill).toBe("#10b981");

    const ellipseSnap: VersionShapeSnapshot = {
      id: "ellipse-1",
      canvasId: "c-1",
      type: "ellipse",
      x: 200,
      y: 200,
      width: 150,
      height: 80,
      style: { fill: "#f59e0b" },
    };
    const ellipse = mapVersionShapeSnapshotToShape(ellipseSnap) as EllipseShape;
    expect(ellipse.type).toBe("ellipse");
    expect(ellipse.width).toBe(150);
    expect(ellipse.height).toBe(80);

    const triSnap: VersionShapeSnapshot = {
      id: "tri-1",
      canvasId: "c-1",
      type: "triangle",
      x: 300,
      y: 300,
      width: 120,
      height: 100,
      style: { fill: "#ec4899" },
    };
    const tri = mapVersionShapeSnapshotToShape(triSnap) as TriangleShape;
    expect(tri.type).toBe("triangle");
    expect(tri.fill).toBe("#ec4899");
  });

  it("maps polygon and star shapes with shapeConfig parameters", () => {
    const polygonSnap: VersionShapeSnapshot = {
      id: "poly-1",
      canvasId: "c-1",
      type: "polygon",
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      shapeConfig: { sides: 6 },
    };
    const poly = mapVersionShapeSnapshotToShape(polygonSnap) as PolygonShape;
    expect(poly.type).toBe("polygon");
    expect(poly.sides).toBe(6);
    expect(poly.shapeConfig?.sides).toBe(6);

    const starSnap: VersionShapeSnapshot = {
      id: "star-1",
      canvasId: "c-1",
      type: "star",
      x: 50,
      y: 60,
      width: 120,
      height: 120,
      shapeConfig: { points: 8, innerRadiusRatio: 0.4 },
    };
    const star = mapVersionShapeSnapshotToShape(starSnap) as StarShape;
    expect(star.type).toBe("star");
    expect(star.shapeConfig?.points).toBe(8);
    expect(star.shapeConfig?.innerRadiusRatio).toBe(0.4);
  });

  it("maps line, arrow, and connector shapes with geometry & anchors", () => {
    const lineSnap: VersionShapeSnapshot = {
      id: "line-1",
      canvasId: "c-1",
      type: "line",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      points: [10, 20, 210, 120],
      style: { stroke: "#6366f1", strokeWidth: 4 },
    };
    const line = mapVersionShapeSnapshotToShape(lineSnap) as LineShape;
    expect(line.type).toBe("line");
    expect(line.points).toEqual([10, 20, 210, 120]);

    const arrowSnap: VersionShapeSnapshot = {
      id: "arrow-1",
      canvasId: "c-1",
      type: "arrow",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      points: [0, 0, 100, 100],
      style: {
        arrowHeadEnd: true,
        arrowHeadStart: true,
        pointerLength: 14,
        pointerWidth: 12,
      },
    };
    const arrow = mapVersionShapeSnapshotToShape(arrowSnap) as ArrowShape;
    expect(arrow.type).toBe("arrow");
    expect(arrow.arrowHeadEnd).toBe(true);
    expect(arrow.arrowHeadStart).toBe(true);
    expect(arrow.pointerLength).toBe(14);

    const connSnap: VersionShapeSnapshot = {
      id: "conn-1",
      canvasId: "c-1",
      type: "connector",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      connector: {
        sourceShapeId: "s-1",
        sourceAnchor: "right",
        targetShapeId: "s-2",
        targetAnchor: "left",
        routing: "orthogonal",
      },
    };
    const conn = mapVersionShapeSnapshotToShape(connSnap) as ConnectorShape;
    expect(conn.type).toBe("connector");
    expect(conn.connector?.sourceShapeId).toBe("s-1");
    expect(conn.connector?.sourceAnchor).toBe("right");
    expect(conn.connector?.targetShapeId).toBe("s-2");
    expect(conn.connector?.targetAnchor).toBe("left");
    expect(conn.connector?.routing).toBe("orthogonal");
  });

  it("maps text and sticky_note shapes with rich typography properties", () => {
    const textSnap: VersionShapeSnapshot = {
      id: "text-1",
      canvasId: "c-1",
      type: "text",
      x: 40,
      y: 40,
      width: 300,
      height: 80,
      text: "CanvasFlow Historical Snapshot",
      style: {
        fontSize: 28,
        fontFamily: "Roboto",
        fontWeight: "bold",
        fontStyle: "italic",
        textDecoration: "underline",
        textAlign: "center",
        verticalAlign: "middle",
        fill: "#0f172a",
        padding: 12,
        lineHeight: 1.4,
      },
    };
    const text = mapVersionShapeSnapshotToShape(textSnap) as TextShape;
    expect(text.type).toBe("text");
    expect(text.text).toBe("CanvasFlow Historical Snapshot");
    expect(text.fontSize).toBe(28);
    expect(text.fontFamily).toBe("Roboto");
    expect(text.fontWeight).toBe("bold");
    expect(text.fontStyle).toBe("italic");
    expect(text.textDecoration).toBe("underline");
    expect(text.textAlign).toBe("center");
    expect(text.verticalAlign).toBe("middle");

    const stickySnap: VersionShapeSnapshot = {
      id: "sticky-1",
      canvasId: "c-1",
      type: "sticky_note",
      x: 500,
      y: 100,
      width: 200,
      height: 200,
      text: "Architecture Review Notes",
      style: {
        backgroundColor: "#fef08a",
        textColor: "#854d0e",
        fontSize: 16,
      },
    };
    const sticky = mapVersionShapeSnapshotToShape(stickySnap) as StickyNoteShape;
    expect(sticky.type).toBe("sticky_note");
    expect(sticky.text).toBe("Architecture Review Notes");
    expect(sticky.backgroundColor).toBe("#fef08a");
    expect(sticky.textColor).toBe("#854d0e");
    expect(sticky.fontSize).toBe(16);
  });

  it("maps freehand and group shapes preserving hierarchy", () => {
    const freehandSnap: VersionShapeSnapshot = {
      id: "freehand-1",
      canvasId: "c-1",
      type: "freehand",
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      points: [10, 10, 20, 25, 35, 40, 50, 60],
      parentId: "grp-1",
    };
    const freehand = mapVersionShapeSnapshotToShape(freehandSnap) as FreehandShape;
    expect(freehand.type).toBe("freehand");
    expect(freehand.points).toEqual([10, 10, 20, 25, 35, 40, 50, 60]);
    expect(freehand.parentId).toBe("grp-1");

    const groupSnap: VersionShapeSnapshot = {
      id: "grp-1",
      canvasId: "c-1",
      type: "group",
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      rotation: 0,
      zIndex: 5,
    };
    const group = mapVersionShapeSnapshotToShape(groupSnap) as GroupShape;
    expect(group.type).toBe("group");
    expect(group.id).toBe("grp-1");
    expect(group.zIndex).toBe(5);
  });
});
