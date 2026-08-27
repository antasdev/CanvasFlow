import { describe, expect, it } from "vitest";

import { mapShapeResponseToShape, mapShapeResponseToRectangleShape } from "./shape.mapper";
import type {
  ShapeResponseDto,
  RectangleShapeResponseDto,
  TextShapeResponseDto,
  StickyNoteShapeResponseDto,
} from "./shape.api";

describe("Shape Mapper", () => {
  it("maps ShapeResponseDto to RectangleShape correctly", () => {
    const dto: RectangleShapeResponseDto = {
      id: "6789abcdef0123456789abcd",
      canvasId: "1234567890abcdef12345678",
      type: "rectangle",
      x: 150,
      y: 250,
      width: 300,
      height: 180,
      rotation: 90,
      zIndex: 2,
      version: 1,
      style: {
        fill: "#ff5500",
        stroke: "#222222",
        strokeWidth: 3,
        opacity: 0.9,
      },
      createdBy: "user-123",
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    };

    const shape = mapShapeResponseToShape(dto);

    expect(shape).toEqual({
      id: "6789abcdef0123456789abcd",
      type: "rectangle",
      x: 150,
      y: 250,
      width: 300,
      height: 180,
      rotation: 90,
      zIndex: 2,
      version: 1,
      fill: "#ff5500",
      stroke: "#222222",
      strokeWidth: 3,
      opacity: 0.9,
    });
  });

  it("maps ShapeResponseDto to TextShape correctly", () => {
    const dto: TextShapeResponseDto = {
      id: "text-1",
      canvasId: "canvas-1",
      type: "text",
      x: 100,
      y: 200,
      width: 180,
      height: 40,
      rotation: 0,
      zIndex: 3,
      version: 1,
      style: {
        text: "Hello World",
        fontSize: 24,
        fontFamily: "Inter",
        fontWeight: "bold",
        fontStyle: "normal",
        textAlign: "left",
        fill: "#1f2937",
        opacity: 1,
      },
      createdBy: "user-123",
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    };

    const shape = mapShapeResponseToShape(dto);

    expect(shape).toEqual({
      id: "text-1",
      type: "text",
      x: 100,
      y: 200,
      width: 180,
      height: 40,
      rotation: 0,
      zIndex: 3,
      version: 1,
      opacity: 1,
      text: "Hello World",
      fontSize: 24,
      fontFamily: "Inter",
      fontWeight: "bold",
      fontStyle: "normal",
      textDecoration: "none",
      textAlign: "left",
      verticalAlign: "top",
      fill: "#1f2937",
      padding: 4,
      lineHeight: 1.2,
    });
  });

  it("maps ShapeResponseDto to TextShape with root text and rich styles", () => {
    const dto: TextShapeResponseDto = {
      id: "text-2",
      canvasId: "canvas-1",
      type: "text",
      x: 50,
      y: 80,
      width: 220,
      height: 60,
      rotation: 15,
      zIndex: 5,
      version: 2,
      text: "Root Text Content",
      style: {
        fontSize: 32,
        fontFamily: "Georgia",
        fontWeight: "bold",
        fontStyle: "italic",
        textDecoration: "underline",
        textAlign: "center",
        verticalAlign: "middle",
        fill: "#dc2626",
        opacity: 0.8,
        padding: 12,
        lineHeight: 1.5,
      },
      createdBy: "user-123",
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    };

    const shape = mapShapeResponseToShape(dto);

    expect(shape).toEqual({
      id: "text-2",
      type: "text",
      x: 50,
      y: 80,
      width: 220,
      height: 60,
      rotation: 15,
      zIndex: 5,
      version: 2,
      opacity: 0.8,
      text: "Root Text Content",
      fontSize: 32,
      fontFamily: "Georgia",
      fontWeight: "bold",
      fontStyle: "italic",
      textDecoration: "underline",
      textAlign: "center",
      verticalAlign: "middle",
      fill: "#dc2626",
      padding: 12,
      lineHeight: 1.5,
    });
  });

  it("falls back to legacy style.text when root text is absent", () => {
    const dto: TextShapeResponseDto = {
      id: "text-legacy",
      canvasId: "canvas-1",
      type: "text",
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      rotation: 0,
      zIndex: 1,
      version: 1,
      style: {
        text: "Legacy Style Text",
      },
      createdBy: "user-123",
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    };

    const shape = mapShapeResponseToShape(dto);
    expect(shape.type).toBe("text");
    if (shape.type === "text") {
      expect(shape.text).toBe("Legacy Style Text");
      expect(shape.fontSize).toBe(24);
      expect(shape.fontFamily).toBe("Inter");
      expect(shape.fontStyle).toBe("normal");
      expect(shape.textDecoration).toBe("none");
      expect(shape.textAlign).toBe("left");
      expect(shape.verticalAlign).toBe("top");
    }
  });

  it("maps ShapeResponseDto to StickyNoteShape correctly", () => {
    const dto: StickyNoteShapeResponseDto = {
      id: "sticky-1",
      canvasId: "canvas-1",
      type: "sticky_note",
      x: 300,
      y: 400,
      width: 200,
      height: 200,
      rotation: 0,
      zIndex: 4,
      version: 1,
      style: {
        text: "Important reminder",
        fontSize: 18,
        backgroundColor: "#fef08a",
        textColor: "#1f2937",
        opacity: 1,
      },
      createdBy: "user-123",
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    };

    const shape = mapShapeResponseToShape(dto);

    expect(shape).toEqual({
      id: "sticky-1",
      type: "sticky_note",
      x: 300,
      y: 400,
      width: 200,
      height: 200,
      rotation: 0,
      zIndex: 4,
      version: 1,
      opacity: 1,
      text: "Important reminder",
      fontSize: 18,
      backgroundColor: "#fef08a",
      textColor: "#1f2937",
    });
  });

  it("applies default styles if style properties are missing", () => {
    const dto: ShapeResponseDto = {
      id: "6789abcdef0123456789abcd",
      canvasId: "1234567890abcdef12345678",
      type: "rectangle",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
      version: 1,
      style: {} as unknown as RectangleShapeResponseDto["style"],
      createdBy: "user-123",
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    };

    const rectangle = mapShapeResponseToRectangleShape(dto);

    expect(rectangle.fill).toBe("#ffffff");
    expect(rectangle.stroke).toBe("#1f2937");
    expect(rectangle.strokeWidth).toBe(2);
    expect(rectangle.opacity).toBe(1);
  });

  it("maps ShapeResponseDto to FreehandShape correctly", () => {
    const dto = {
      id: "freehand-1",
      canvasId: "canvas-1",
      type: "freehand" as const,
      x: 50,
      y: 80,
      width: 120,
      height: 90,
      rotation: 0,
      zIndex: 3,
      version: 1,
      points: [0, 0, 40, 30, 120, 90],
      style: {
        stroke: "#3b82f6",
        strokeWidth: 4,
        opacity: 0.8,
      },
      createdBy: "user-123",
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    };

    const shape = mapShapeResponseToShape(dto);

    expect(shape).toEqual({
      id: "freehand-1",
      type: "freehand",
      x: 50,
      y: 80,
      width: 120,
      height: 90,
      rotation: 0,
      zIndex: 3,
      version: 1,
      points: [0, 0, 40, 30, 120, 90],
      stroke: "#3b82f6",
      strokeWidth: 4,
      opacity: 0.8,
    });
  });

  it("maps FreehandShape from style.points fallback if top-level points is omitted", () => {
    const dto = {
      id: "freehand-fallback",
      canvasId: "canvas-1",
      type: "freehand" as const,
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 0,
      zIndex: 1,
      version: 1,
      style: {
        stroke: "#ef4444",
        strokeWidth: 3,
        opacity: 1,
        points: [0, 0, 50, 25, 100, 50],
      },
      createdBy: "user-123",
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    };

    const shape = mapShapeResponseToShape(dto as unknown as ShapeResponseDto);

    if (shape.type === "freehand") {
      expect(shape.points).toEqual([0, 0, 50, 25, 100, 50]);
      expect(shape.stroke).toBe("#ef4444");
      expect(shape.strokeWidth).toBe(3);
    } else {
      throw new Error("Expected shape type to be freehand");
    }
  });

  it("maps LineShape correctly with points and style", () => {
    const dto = {
      id: "line-1",
      canvasId: "canvas-1",
      type: "line" as const,
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      rotation: 0,
      zIndex: 4,
      version: 1,
      points: [0, 0, 200, 150],
      style: {
        stroke: "#2563eb",
        strokeWidth: 3,
        opacity: 0.9,
        strokeStyle: "dashed" as const,
      },
      createdBy: "user-123",
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    };

    const shape = mapShapeResponseToShape(dto);

    expect(shape).toEqual({
      id: "line-1",
      type: "line",
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      rotation: 0,
      zIndex: 4,
      version: 1,
      opacity: 0.9,
      points: [0, 0, 200, 150],
      stroke: "#2563eb",
      strokeWidth: 3,
      strokeStyle: "dashed",
    });
  });

  it("maps ArrowShape correctly with arrow styling", () => {
    const dto = {
      id: "arrow-1",
      canvasId: "canvas-1",
      type: "arrow" as const,
      x: 50,
      y: 50,
      width: 100,
      height: 80,
      rotation: 45,
      zIndex: 5,
      version: 2,
      points: [0, 0, 100, 80],
      style: {
        stroke: "#dc2626",
        strokeWidth: 2,
        opacity: 1,
        arrowHeadEnd: true,
        arrowHeadStart: false,
        pointerLength: 12,
        pointerWidth: 12,
      },
      createdBy: "user-123",
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    };

    const shape = mapShapeResponseToShape(dto);

    expect(shape).toEqual({
      id: "arrow-1",
      type: "arrow",
      x: 50,
      y: 50,
      width: 100,
      height: 80,
      rotation: 45,
      zIndex: 5,
      version: 2,
      opacity: 1,
      points: [0, 0, 100, 80],
      stroke: "#dc2626",
      strokeWidth: 2,
      arrowHeadEnd: true,
      arrowHeadStart: false,
      pointerLength: 12,
      pointerWidth: 12,
    });
  });

  it("maps ConnectorShape correctly with connector relational metadata", () => {
    const dto = {
      id: "conn-1",
      canvasId: "canvas-1",
      type: "connector" as const,
      x: 200,
      y: 150,
      width: 120,
      height: 40,
      rotation: 0,
      zIndex: 6,
      version: 1,
      points: [0, 0, 120, 40],
      connector: {
        sourceShapeId: "shape-a",
        sourceAnchor: "right" as const,
        targetShapeId: "shape-b",
        targetAnchor: "left" as const,
        routing: "straight" as const,
      },
      style: {
        stroke: "#059669",
        strokeWidth: 2,
        opacity: 1,
        arrowHeadEnd: true,
        arrowHeadStart: false,
        pointerLength: 10,
        pointerWidth: 10,
      },
      createdBy: "user-123",
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    };

    const shape = mapShapeResponseToShape(dto);

    expect(shape).toEqual({
      id: "conn-1",
      type: "connector",
      x: 200,
      y: 150,
      width: 120,
      height: 40,
      rotation: 0,
      zIndex: 6,
      version: 1,
      opacity: 1,
      points: [0, 0, 120, 40],
      stroke: "#059669",
      strokeWidth: 2,
      connector: {
        sourceShapeId: "shape-a",
        sourceAnchor: "right",
        targetShapeId: "shape-b",
        targetAnchor: "left",
        routing: "straight",
      },
      arrowHeadEnd: true,
      arrowHeadStart: false,
      pointerLength: 10,
      pointerWidth: 10,
    });
  });
});
