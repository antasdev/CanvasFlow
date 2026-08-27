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
      textAlign: "left",
      fill: "#1f2937",
    });
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
});
