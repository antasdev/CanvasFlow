import type {
  Shape,
  RectangleShape,
  TextShape,
  StickyNoteShape,
  FreehandShape,
  LineShape,
  ArrowShape,
  ConnectorShape,
} from "../types";
import type { ShapeResponseDto } from "./shape.api";

/**
 * Maps Shape API/Socket response DTO to frontend Shape discriminated union.
 */
export function mapShapeResponseToShape(dto: ShapeResponseDto): Shape {
  if (dto.type === "freehand") {
    const legacyStyle = dto.style as { points?: number[] };
    const rawPoints = Array.isArray(dto.points)
      ? dto.points
      : Array.isArray(legacyStyle?.points)
      ? legacyStyle.points
      : [];

    const freehandShape: FreehandShape = {
      id: dto.id,
      type: "freehand",
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      rotation: dto.rotation,
      zIndex: dto.zIndex,
      version: dto.version ?? 1,
      opacity: dto.style?.opacity ?? 1,
      points: rawPoints,
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
    };
    return freehandShape;
  }

  if (dto.type === "line") {
    const lineShape: LineShape = {
      id: dto.id,
      type: "line",
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      rotation: dto.rotation,
      zIndex: dto.zIndex,
      version: dto.version ?? 1,
      opacity: dto.style?.opacity ?? 1,
      points: Array.isArray(dto.points) ? dto.points : [0, 0, dto.width, dto.height],
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
      strokeStyle: dto.style?.strokeStyle === "dashed" ? "dashed" : "solid",
    };
    return lineShape;
  }

  if (dto.type === "arrow") {
    const arrowShape: ArrowShape = {
      id: dto.id,
      type: "arrow",
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      rotation: dto.rotation,
      zIndex: dto.zIndex,
      version: dto.version ?? 1,
      opacity: dto.style?.opacity ?? 1,
      points: Array.isArray(dto.points) ? dto.points : [0, 0, dto.width, dto.height],
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
      arrowHeadEnd: typeof dto.style?.arrowHeadEnd === "boolean" ? dto.style.arrowHeadEnd : true,
      arrowHeadStart: typeof dto.style?.arrowHeadStart === "boolean" ? dto.style.arrowHeadStart : false,
      pointerLength: typeof dto.style?.pointerLength === "number" ? dto.style.pointerLength : 10,
      pointerWidth: typeof dto.style?.pointerWidth === "number" ? dto.style.pointerWidth : 10,
    };
    return arrowShape;
  }

  if (dto.type === "connector") {
    const connShape: ConnectorShape = {
      id: dto.id,
      type: "connector",
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      rotation: dto.rotation,
      zIndex: dto.zIndex,
      version: dto.version ?? 1,
      opacity: dto.style?.opacity ?? 1,
      points: Array.isArray(dto.points) ? dto.points : [0, 0, dto.width, dto.height],
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
      connector: dto.connector
        ? {
            sourceShapeId: dto.connector.sourceShapeId ?? null,
            sourceAnchor: dto.connector.sourceAnchor ?? null,
            targetShapeId: dto.connector.targetShapeId ?? null,
            targetAnchor: dto.connector.targetAnchor ?? null,
            routing: dto.connector.routing ?? "straight",
          }
        : undefined,
      arrowHeadEnd: typeof dto.style?.arrowHeadEnd === "boolean" ? dto.style.arrowHeadEnd : true,
      arrowHeadStart: typeof dto.style?.arrowHeadStart === "boolean" ? dto.style.arrowHeadStart : false,
      pointerLength: typeof dto.style?.pointerLength === "number" ? dto.style.pointerLength : 10,
      pointerWidth: typeof dto.style?.pointerWidth === "number" ? dto.style.pointerWidth : 10,
    };
    return connShape;
  }

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
      version: dto.version ?? 1,
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
      version: dto.version ?? 1,
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
    version: dto.version ?? 1,
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
      version: dto.version ?? 1,
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
    version: dto.version ?? 1,
    opacity: 1,
    fill: "#ffffff",
    stroke: "#1f2937",
    strokeWidth: 2,
  };
}
