import type {
  Shape,
  RectangleShape,
  CircleShape,
  EllipseShape,
  TriangleShape,
  PolygonShape,
  StarShape,
  TextShape,
  StickyNoteShape,
  FreehandShape,
  LineShape,
  ArrowShape,
  ConnectorShape,
  GroupShape,
  ShapeShadow,
  StrokeStyle,
} from "../types";
import type { ShapeResponseDto, ShapeShadowDto } from "./shape.api";

function mapShadowDto(shadow?: ShapeShadowDto): ShapeShadow | undefined {
  if (!shadow) return undefined;
  return {
    enabled: Boolean(shadow.enabled),
    color: shadow.color ?? "#000000",
    blur: typeof shadow.blur === "number" ? shadow.blur : 10,
    offsetX: typeof shadow.offsetX === "number" ? shadow.offsetX : 0,
    offsetY: typeof shadow.offsetY === "number" ? shadow.offsetY : 4,
    opacity: typeof shadow.opacity === "number" ? shadow.opacity : 0.3,
  };
}

/**
 * Maps Shape API/Socket response DTO to frontend Shape discriminated union.
 */
export function mapShapeResponseToShape(dto: ShapeResponseDto): Shape {
  const shadow: ShapeShadow | undefined = mapShadowDto(dto.style?.shadow as ShapeShadowDto | undefined);
  const strokeStyle: StrokeStyle | undefined = (dto.style && "strokeStyle" in dto.style
    ? dto.style.strokeStyle
    : undefined) as StrokeStyle | undefined;

  if (dto.type === "group") {
    const groupShape: GroupShape = {
      id: dto.id,
      type: "group",
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      rotation: dto.rotation,
      zIndex: dto.zIndex,
      version: dto.version ?? 1,
      opacity: 1,
      ...(dto.parentId ? { parentId: dto.parentId } : {}),
    };
    return groupShape;
  }

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
      ...(dto.parentId ? { parentId: dto.parentId } : {}),
      opacity: dto.style?.opacity ?? 1,
      points: rawPoints,
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
      ...(strokeStyle ? { strokeStyle } : {}),
      ...(shadow ? { shadow } : {}),
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
      ...(dto.parentId ? { parentId: dto.parentId } : {}),
      opacity: dto.style?.opacity ?? 1,
      points: Array.isArray(dto.points) ? dto.points : [0, 0, dto.width, dto.height],
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
      strokeStyle: strokeStyle ?? "solid",
      ...(shadow ? { shadow } : {}),
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
      ...(dto.parentId ? { parentId: dto.parentId } : {}),
      opacity: dto.style?.opacity ?? 1,
      points: Array.isArray(dto.points) ? dto.points : [0, 0, dto.width, dto.height],
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
      ...(strokeStyle ? { strokeStyle } : {}),
      ...(shadow ? { shadow } : {}),
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
      ...(dto.parentId ? { parentId: dto.parentId } : {}),
      opacity: dto.style?.opacity ?? 1,
      points: Array.isArray(dto.points) ? dto.points : [0, 0, dto.width, dto.height],
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
      ...(strokeStyle ? { strokeStyle } : {}),
      ...(shadow ? { shadow } : {}),
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
    const textContent =
      typeof dto.text === "string"
        ? dto.text
        : typeof dto.style?.text === "string"
        ? dto.style.text
        : "";

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
      ...(dto.parentId ? { parentId: dto.parentId } : {}),
      opacity: dto.style?.opacity ?? 1,
      text: textContent,
      fontSize: dto.style?.fontSize ?? 24,
      fontFamily: dto.style?.fontFamily ?? "Inter",
      fontWeight: dto.style?.fontWeight ?? "normal",
      fontStyle: dto.style?.fontStyle === "italic" ? "italic" : "normal",
      textDecoration: dto.style?.textDecoration === "underline" ? "underline" : "none",
      textAlign:
        dto.style?.textAlign === "center" || dto.style?.textAlign === "right"
          ? dto.style.textAlign
          : "left",
      verticalAlign:
        dto.style?.verticalAlign === "middle" || dto.style?.verticalAlign === "bottom"
          ? dto.style.verticalAlign
          : "top",
      fill: dto.style?.fill ?? "#1f2937",
      padding: typeof dto.style?.padding === "number" ? dto.style.padding : 4,
      lineHeight: typeof dto.style?.lineHeight === "number" ? dto.style.lineHeight : 1.2,
      ...(shadow ? { shadow } : {}),
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
      ...(dto.parentId ? { parentId: dto.parentId } : {}),
      opacity: dto.style.opacity ?? 1,
      text: dto.style.text ?? "",
      fontSize: dto.style.fontSize ?? 20,
      backgroundColor: dto.style.backgroundColor ?? "#fef08a",
      textColor: dto.style.textColor ?? "#1f2937",
      ...(shadow ? { shadow } : {}),
    };
    return stickyShape;
  }

  if (dto.type === "circle") {
    const circleShape: CircleShape = {
      id: dto.id,
      type: "circle",
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      rotation: dto.rotation,
      zIndex: dto.zIndex,
      version: dto.version ?? 1,
      ...(dto.parentId ? { parentId: dto.parentId } : {}),
      opacity: dto.style?.opacity ?? 1,
      fill: dto.style?.fill ?? "#ffffff",
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
      ...(strokeStyle ? { strokeStyle } : {}),
      ...(shadow ? { shadow } : {}),
    };
    return circleShape;
  }

  if (dto.type === "ellipse") {
    const ellipseShape: EllipseShape = {
      id: dto.id,
      type: "ellipse",
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      rotation: dto.rotation,
      zIndex: dto.zIndex,
      version: dto.version ?? 1,
      ...(dto.parentId ? { parentId: dto.parentId } : {}),
      opacity: dto.style?.opacity ?? 1,
      fill: dto.style?.fill ?? "#ffffff",
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
      ...(strokeStyle ? { strokeStyle } : {}),
      ...(shadow ? { shadow } : {}),
    };
    return ellipseShape;
  }

  if (dto.type === "triangle") {
    const triangleShape: TriangleShape = {
      id: dto.id,
      type: "triangle",
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      rotation: dto.rotation,
      zIndex: dto.zIndex,
      version: dto.version ?? 1,
      ...(dto.parentId ? { parentId: dto.parentId } : {}),
      opacity: dto.style?.opacity ?? 1,
      fill: dto.style?.fill ?? "#ffffff",
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
      ...(strokeStyle ? { strokeStyle } : {}),
      ...(shadow ? { shadow } : {}),
    };
    return triangleShape;
  }

  if (dto.type === "polygon") {
    const sides = typeof dto.shapeConfig?.sides === "number" ? dto.shapeConfig.sides : 5;
    const polygonShape: PolygonShape = {
      id: dto.id,
      type: "polygon",
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      rotation: dto.rotation,
      zIndex: dto.zIndex,
      version: dto.version ?? 1,
      ...(dto.parentId ? { parentId: dto.parentId } : {}),
      opacity: dto.style?.opacity ?? 1,
      sides,
      shapeConfig: {
        sides,
      },
      fill: dto.style?.fill ?? "#ffffff",
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
      ...(strokeStyle ? { strokeStyle } : {}),
      ...(shadow ? { shadow } : {}),
    };
    return polygonShape;
  }

  if (dto.type === "star") {
    const points = typeof dto.shapeConfig?.points === "number" ? dto.shapeConfig.points : 5;
    const innerRadiusRatio =
      typeof dto.shapeConfig?.innerRadiusRatio === "number"
        ? dto.shapeConfig.innerRadiusRatio
        : 0.5;

    const starShape: StarShape = {
      id: dto.id,
      type: "star",
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      rotation: dto.rotation,
      zIndex: dto.zIndex,
      version: dto.version ?? 1,
      ...(dto.parentId ? { parentId: dto.parentId } : {}),
      opacity: dto.style?.opacity ?? 1,
      shapeConfig: {
        points,
        innerRadiusRatio,
      },
      fill: dto.style?.fill ?? "#ffffff",
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
      ...(strokeStyle ? { strokeStyle } : {}),
      ...(shadow ? { shadow } : {}),
    };
    return starShape;
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
    ...(dto.parentId ? { parentId: dto.parentId } : {}),
    opacity: dto.style?.opacity ?? 1,
    fill: dto.style?.fill ?? "#ffffff",
    stroke: dto.style?.stroke ?? "#1f2937",
    strokeWidth: dto.style?.strokeWidth ?? 2,
    ...(strokeStyle ? { strokeStyle } : {}),
    ...(shadow ? { shadow } : {}),
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
  const shadow: ShapeShadow | undefined = mapShadowDto(dto.style?.shadow as ShapeShadowDto | undefined);
  const strokeStyle: StrokeStyle | undefined = (dto.style && "strokeStyle" in dto.style
    ? dto.style.strokeStyle
    : undefined) as StrokeStyle | undefined;

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
      ...(dto.parentId ? { parentId: dto.parentId } : {}),
      opacity: dto.style?.opacity ?? 1,
      fill: dto.style?.fill ?? "#ffffff",
      stroke: dto.style?.stroke ?? "#1f2937",
      strokeWidth: dto.style?.strokeWidth ?? 2,
      ...(strokeStyle ? { strokeStyle } : {}),
      ...(shadow ? { shadow } : {}),
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
    ...(strokeStyle ? { strokeStyle } : {}),
    ...(shadow ? { shadow } : {}),
  };
}
