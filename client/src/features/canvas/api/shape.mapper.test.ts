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
});
