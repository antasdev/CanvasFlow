import { describe, expect, it } from "vitest";

import { mapShapeResponseToRectangleShape } from "./shape.mapper";
import type { ShapeResponseDto } from "./shape.api";

describe("Shape Mapper", () => {
  it("maps ShapeResponseDto to RectangleShape correctly", () => {
    const dto: ShapeResponseDto = {
      id: "6789abcdef0123456789abcd",
      canvasId: "1234567890abcdef12345678",
      type: "rectangle",
      x: 150,
      y: 250,
      width: 300,
      height: 180,
      rotation: 90,
      zIndex: 2,
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

    const rectangle = mapShapeResponseToRectangleShape(dto);

    expect(rectangle).toEqual({
      id: "6789abcdef0123456789abcd",
      type: "rectangle",
      x: 150,
      y: 250,
      width: 300,
      height: 180,
      rotation: 90,
      zIndex: 2,
      fill: "#ff5500",
      stroke: "#222222",
      strokeWidth: 3,
      opacity: 0.9,
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
      style: {} as unknown as ShapeResponseDto["style"],
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
