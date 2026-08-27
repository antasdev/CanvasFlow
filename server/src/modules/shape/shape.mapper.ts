import { Shape, ShapeDocument, ShapeType, ShapeConnectorData, StrokeStyle } from "./shape.types";
import {
  ShapeResponseDto,
  RectangleShapeResponseDto,
  CircleShapeResponseDto,
  EllipseShapeResponseDto,
  TriangleShapeResponseDto,
  PolygonShapeResponseDto,
  StarShapeResponseDto,
  TextShapeResponseDto,
  StickyNoteShapeResponseDto,
  FreehandShapeResponseDto,
  LineShapeResponseDto,
  ArrowShapeResponseDto,
  ConnectorShapeResponseDto,
  ShapeConnectorDto,
  ShapeAppearanceStyleDto,
} from "./shape.dto";

export class ShapeMapper {
  /**
   * Helper to map shared appearance properties (fill, stroke, strokeWidth, strokeStyle, opacity, shadow).
   */
  private static mapAppearanceStyle(style: Record<string, unknown>): ShapeAppearanceStyleDto {
    const appearance: ShapeAppearanceStyleDto = {
      fill: typeof style.fill === "string" ? style.fill : undefined,
      stroke: typeof style.stroke === "string" ? style.stroke : undefined,
      strokeWidth: typeof style.strokeWidth === "number" ? style.strokeWidth : undefined,
      strokeStyle:
        style.strokeStyle === "solid" || style.strokeStyle === "dashed" || style.strokeStyle === "dotted"
          ? (style.strokeStyle as StrokeStyle)
          : undefined,
      opacity: typeof style.opacity === "number" ? style.opacity : undefined,
    };

    if (style.shadow && typeof style.shadow === "object") {
      const s = style.shadow as Record<string, unknown>;
      appearance.shadow = {
        enabled: Boolean(s.enabled),
        color: typeof s.color === "string" ? s.color : "#000000",
        blur: typeof s.blur === "number" ? s.blur : 10,
        offsetX: typeof s.offsetX === "number" ? s.offsetX : 0,
        offsetY: typeof s.offsetY === "number" ? s.offsetY : 4,
        opacity: typeof s.opacity === "number" ? s.opacity : 0.3,
      };
    }

    return appearance;
  }

  /**
   * Maps internal MongoDB shape document or entity to public API response DTO.
   */
  static toResponseDto(doc: ShapeDocument | Shape): ShapeResponseDto {
    const rawStyle = doc.style;
    const style = (
      rawStyle && typeof (rawStyle as any).toObject === "function"
        ? (rawStyle as any).toObject()
        : rawStyle ?? {}
    ) as Record<string, unknown>;

    const base = {
      id: doc._id.toString(),
      canvasId: doc.canvasId.toString(),
      x: doc.x,
      y: doc.y,
      width: doc.width,
      height: doc.height,
      rotation: doc.rotation ?? 0,
      zIndex: doc.zIndex,
      createdBy: doc.createdBy.toString(),
      version: doc.version ?? 1,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
    };

    const shapeType = String(doc.type).toUpperCase();

    const appearance = ShapeMapper.mapAppearanceStyle(style);

    if (shapeType === "TEXT") {
      const docWithText = doc as (ShapeDocument | Shape) & { text?: string };
      const textContent =
        typeof docWithText.text === "string"
          ? docWithText.text
          : typeof style.text === "string"
          ? style.text
          : "";

      const textDto: TextShapeResponseDto = {
        ...base,
        type: "text",
        text: textContent,
        style: {
          fontSize: typeof style.fontSize === "number" ? style.fontSize : 24,
          fontFamily: typeof style.fontFamily === "string" ? style.fontFamily : "Inter",
          fontWeight:
            typeof style.fontWeight === "string" || typeof style.fontWeight === "number"
              ? style.fontWeight
              : "normal",
          fontStyle: style.fontStyle === "italic" ? "italic" : "normal",
          textDecoration: style.textDecoration === "underline" ? "underline" : "none",
          textAlign:
            style.textAlign === "center" || style.textAlign === "right"
              ? style.textAlign
              : "left",
          verticalAlign:
            style.verticalAlign === "middle" || style.verticalAlign === "bottom"
              ? style.verticalAlign
              : "top",
          fill: appearance.fill ?? (typeof style.fill === "string" ? style.fill : "#1f2937"),
          opacity: appearance.opacity ?? 1,
          padding: typeof style.padding === "number" ? style.padding : 4,
          lineHeight: typeof style.lineHeight === "number" ? style.lineHeight : 1.2,
          shadow: appearance.shadow,
        },
      };
      return textDto;
    }

    if (shapeType === "STICKY_NOTE") {
      const stickyDto: StickyNoteShapeResponseDto = {
        ...base,
        type: "sticky_note",
        style: {
          text: typeof style.text === "string" ? style.text : "",
          fontSize: typeof style.fontSize === "number" ? style.fontSize : 18,
          backgroundColor:
            typeof style.backgroundColor === "string"
              ? style.backgroundColor
              : appearance.fill ?? "#fef08a",
          textColor:
            typeof style.textColor === "string"
              ? style.textColor
              : typeof style.fill === "string"
              ? style.fill
              : "#1f2937",
          opacity: appearance.opacity ?? 1,
          shadow: appearance.shadow,
        },
      };
      return stickyDto;
    }

    if (shapeType === "FREEHAND") {
      const docWithPoints = doc as ShapeDocument & { points?: number[] };
      const rawPoints = Array.isArray(docWithPoints.points)
        ? docWithPoints.points
        : Array.isArray(style.points)
        ? (style.points as number[])
        : [];

      const freehandDto: FreehandShapeResponseDto = {
        ...base,
        type: "freehand",
        points: rawPoints,
        style: {
          stroke: appearance.stroke ?? "#1f2937",
          strokeWidth: appearance.strokeWidth ?? 2,
          opacity: appearance.opacity ?? 1,
          strokeStyle: appearance.strokeStyle,
          shadow: appearance.shadow,
        },
      };
      return freehandDto;
    }

    if (shapeType === "LINE") {
      const docWithPoints = doc as ShapeDocument & { points?: number[] };
      const rawPoints = Array.isArray(docWithPoints.points)
        ? docWithPoints.points
        : Array.isArray(style.points)
        ? (style.points as number[])
        : [];

      const lineDto: LineShapeResponseDto = {
        ...base,
        type: "line",
        points: rawPoints,
        style: {
          stroke: appearance.stroke ?? "#1f2937",
          strokeWidth: appearance.strokeWidth ?? 2,
          opacity: appearance.opacity ?? 1,
          strokeStyle: appearance.strokeStyle ?? "solid",
          shadow: appearance.shadow,
        },
      };
      return lineDto;
    }

    if (shapeType === "ARROW") {
      const docWithPoints = doc as ShapeDocument & { points?: number[] };
      const rawPoints = Array.isArray(docWithPoints.points)
        ? docWithPoints.points
        : Array.isArray(style.points)
        ? (style.points as number[])
        : [];

      const arrowDto: ArrowShapeResponseDto = {
        ...base,
        type: "arrow",
        points: rawPoints,
        style: {
          stroke: appearance.stroke ?? "#1f2937",
          strokeWidth: appearance.strokeWidth ?? 2,
          opacity: appearance.opacity ?? 1,
          strokeStyle: appearance.strokeStyle,
          shadow: appearance.shadow,
          arrowHeadEnd: typeof style.arrowHeadEnd === "boolean" ? style.arrowHeadEnd : true,
          arrowHeadStart: typeof style.arrowHeadStart === "boolean" ? style.arrowHeadStart : false,
          pointerLength: typeof style.pointerLength === "number" ? style.pointerLength : 10,
          pointerWidth: typeof style.pointerWidth === "number" ? style.pointerWidth : 10,
        },
      };
      return arrowDto;
    }

    if (shapeType === "CONNECTOR") {
      const docWithPointsAndConnector = doc as ShapeDocument & {
        points?: number[];
        connector?: ShapeConnectorData;
      };
      const rawPoints = Array.isArray(docWithPointsAndConnector.points)
        ? docWithPointsAndConnector.points
        : Array.isArray(style.points)
        ? (style.points as number[])
        : [];

      const rawConnector = docWithPointsAndConnector.connector;
      const connectorDto: ShapeConnectorDto | undefined = rawConnector
        ? {
            sourceShapeId: rawConnector.sourceShapeId ? rawConnector.sourceShapeId.toString() : null,
            sourceAnchor: rawConnector.sourceAnchor ?? null,
            targetShapeId: rawConnector.targetShapeId ? rawConnector.targetShapeId.toString() : null,
            targetAnchor: rawConnector.targetAnchor ?? null,
            routing: rawConnector.routing ?? "straight",
          }
        : undefined;

      const connDto: ConnectorShapeResponseDto = {
        ...base,
        type: "connector",
        points: rawPoints,
        connector: connectorDto,
        style: {
          stroke: appearance.stroke ?? "#1f2937",
          strokeWidth: appearance.strokeWidth ?? 2,
          opacity: appearance.opacity ?? 1,
          strokeStyle: appearance.strokeStyle,
          shadow: appearance.shadow,
          arrowHeadEnd: typeof style.arrowHeadEnd === "boolean" ? style.arrowHeadEnd : true,
          arrowHeadStart: typeof style.arrowHeadStart === "boolean" ? style.arrowHeadStart : false,
          pointerLength: typeof style.pointerLength === "number" ? style.pointerLength : 10,
          pointerWidth: typeof style.pointerWidth === "number" ? style.pointerWidth : 10,
        },
      };
      return connDto;
    }

    if (shapeType === "CIRCLE") {
      const circleDto: CircleShapeResponseDto = {
        ...base,
        type: "circle",
        style: {
          fill: appearance.fill ?? "#ffffff",
          stroke: appearance.stroke ?? "#1f2937",
          strokeWidth: appearance.strokeWidth ?? 2,
          opacity: appearance.opacity ?? 1,
          strokeStyle: appearance.strokeStyle,
          shadow: appearance.shadow,
        },
      };
      return circleDto;
    }

    if (shapeType === "ELLIPSE") {
      const ellipseDto: EllipseShapeResponseDto = {
        ...base,
        type: "ellipse",
        style: {
          fill: appearance.fill ?? "#ffffff",
          stroke: appearance.stroke ?? "#1f2937",
          strokeWidth: appearance.strokeWidth ?? 2,
          opacity: appearance.opacity ?? 1,
          strokeStyle: appearance.strokeStyle,
          shadow: appearance.shadow,
        },
      };
      return ellipseDto;
    }

    if (shapeType === "TRIANGLE") {
      const triangleDto: TriangleShapeResponseDto = {
        ...base,
        type: "triangle",
        style: {
          fill: appearance.fill ?? "#ffffff",
          stroke: appearance.stroke ?? "#1f2937",
          strokeWidth: appearance.strokeWidth ?? 2,
          opacity: appearance.opacity ?? 1,
          strokeStyle: appearance.strokeStyle,
          shadow: appearance.shadow,
        },
      };
      return triangleDto;
    }

    if (shapeType === "POLYGON") {
      const docWithConfig = doc as (ShapeDocument | Shape) & {
        shapeConfig?: { sides?: number };
      };
      const sides =
        typeof docWithConfig.shapeConfig?.sides === "number"
          ? docWithConfig.shapeConfig.sides
          : 5;

      const polygonDto: PolygonShapeResponseDto = {
        ...base,
        type: "polygon",
        shapeConfig: {
          sides,
        },
        style: {
          fill: appearance.fill ?? "#ffffff",
          stroke: appearance.stroke ?? "#1f2937",
          strokeWidth: appearance.strokeWidth ?? 2,
          opacity: appearance.opacity ?? 1,
          strokeStyle: appearance.strokeStyle,
          shadow: appearance.shadow,
        },
      };
      return polygonDto;
    }

    if (shapeType === "STAR") {
      const docWithConfig = doc as (ShapeDocument | Shape) & {
        shapeConfig?: { points?: number; innerRadiusRatio?: number };
      };
      const points =
        typeof docWithConfig.shapeConfig?.points === "number"
          ? docWithConfig.shapeConfig.points
          : 5;
      const innerRadiusRatio =
        typeof docWithConfig.shapeConfig?.innerRadiusRatio === "number"
          ? docWithConfig.shapeConfig.innerRadiusRatio
          : 0.5;

      const starDto: StarShapeResponseDto = {
        ...base,
        type: "star",
        shapeConfig: {
          points,
          innerRadiusRatio,
        },
        style: {
          fill: appearance.fill ?? "#ffffff",
          stroke: appearance.stroke ?? "#1f2937",
          strokeWidth: appearance.strokeWidth ?? 2,
          opacity: appearance.opacity ?? 1,
          strokeStyle: appearance.strokeStyle,
          shadow: appearance.shadow,
        },
      };
      return starDto;
    }

    // Default to rectangle
    const rectDto: RectangleShapeResponseDto = {
      ...base,
      type: "rectangle",
      style: {
        fill: appearance.fill ?? "#ffffff",
        stroke: appearance.stroke ?? "#1f2937",
        strokeWidth: appearance.strokeWidth ?? 2,
        opacity: appearance.opacity ?? 1,
        strokeStyle: appearance.strokeStyle,
        shadow: appearance.shadow,
      },
    };
    return rectDto;
  }
}
