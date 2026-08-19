import type { RectangleShape } from "../types";
import type { ShapeResponseDto } from "./shape.api";

/**
 * Maps Shape API response DTO to frontend RectangleShape.
 */
export function mapShapeResponseToRectangleShape(
  dto: ShapeResponseDto
): RectangleShape {
  return {
    id: dto.id,
    type: "rectangle",
    x: dto.x,
    y: dto.y,
    width: dto.width,
    height: dto.height,
    rotation: dto.rotation,
    zIndex: dto.zIndex,
    opacity: dto.style?.opacity ?? 1,
    fill: dto.style?.fill ?? "#ffffff",
    stroke: dto.style?.stroke ?? "#1f2937",
    strokeWidth: dto.style?.strokeWidth ?? 2,
  };
}
