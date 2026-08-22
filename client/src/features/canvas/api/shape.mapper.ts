import type {
  Shape,
  RectangleShape,
  TextShape,
  StickyNoteShape,
} from "../types";
import type { ShapeResponseDto } from "./shape.api";

/**
 * Maps Shape API/Socket response DTO to frontend Shape discriminated union.
 */
export function mapShapeResponseToShape(dto: ShapeResponseDto): Shape {
  if (dto.type === "text") {
    const textShape: TextShape = {
      id: dto.id,
      type: "text",
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      rotation: dto.rotation,
      zIndex: dto.zIndex,
      opacity: dto.style.opacity ?? 1,
      text: dto.style.text ?? "Text",
      fontSize: dto.style.fontSize ?? 24,
      fontFamily: dto.style.fontFamily ?? "Inter",
      fontWeight: dto.style.fontWeight ?? "normal",
      fontStyle: dto.style.fontStyle ?? "normal",
      textAlign: dto.style.textAlign ?? "left",
      fill: dto.style.fill ?? "#1f2937",
    };
    return textShape;
  }

  if (dto.type === "sticky_note") {
    const stickyShape: StickyNoteShape = {
      id: dto.id,
      type: "sticky_note",
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      rotation: dto.rotation,
      zIndex: dto.zIndex,
      opacity: dto.style.opacity ?? 1,
      text: dto.style.text ?? "",
      fontSize: dto.style.fontSize ?? 20,
      backgroundColor: dto.style.backgroundColor ?? "#fef08a",
      textColor: dto.style.textColor ?? "#1f2937",
    };
    return stickyShape;
  }

  const rectShape: RectangleShape = {
    id: dto.id,
    type: "rectangle",
    x: dto.x,
    y: dto.y,
    width: dto.width,
    height: dto.height,
    rotation: dto.rotation,
    zIndex: dto.zIndex,
    opacity: dto.style.opacity ?? 1,
    fill: dto.style.fill ?? "#ffffff",
    stroke: dto.style.stroke ?? "#1f2937",
    strokeWidth: dto.style.strokeWidth ?? 2,
  };
  return rectShape;
}

/**
 * Maps Shape API response DTO specifically to frontend RectangleShape.
 * Kept for backwards compatibility.
 */
export function mapShapeResponseToRectangleShape(
  dto: ShapeResponseDto
): RectangleShape {
  if (dto.type === "rectangle") {
    return {
      id: dto.id,
      type: "rectangle",
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      rotation: dto.rotation,
      zIndex: dto.zIndex,
      opacity: dto.style.opacity ?? 1,
      fill: dto.style.fill ?? "#ffffff",
      stroke: dto.style.stroke ?? "#1f2937",
      strokeWidth: dto.style.strokeWidth ?? 2,
    };
  }

  return {
    id: dto.id,
    type: "rectangle",
    x: dto.x,
    y: dto.y,
    width: dto.width,
    height: dto.height,
    rotation: dto.rotation,
    zIndex: dto.zIndex,
    opacity: 1,
    fill: "#ffffff",
    stroke: "#1f2937",
    strokeWidth: 2,
  };
}
