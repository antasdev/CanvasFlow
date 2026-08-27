import { Shape, ShapeDocument, ShapeType, ShapeConnectorData } from "./shape.types";
import {
  ShapeResponseDto,
  RectangleShapeResponseDto,
  TextShapeResponseDto,
  StickyNoteShapeResponseDto,
  FreehandShapeResponseDto,
  LineShapeResponseDto,
  ArrowShapeResponseDto,
  ConnectorShapeResponseDto,
  ShapeConnectorDto,
} from "./shape.dto";

export class ShapeMapper {
  /**
   * Maps internal MongoDB shape document or entity to public API response DTO.
   */
  static toResponseDto(doc: ShapeDocument | Shape): ShapeResponseDto {
    const style = (doc.style ?? {}) as Record<string, unknown>;

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

    if (shapeType === "TEXT") {
      const textDto: TextShapeResponseDto = {
        ...base,
        type: "text",
        style: {
          text: typeof style.text === "string" ? style.text : "Text",
          fontSize: typeof style.fontSize === "number" ? style.fontSize : 24,
          fontFamily: typeof style.fontFamily === "string" ? style.fontFamily : "Inter",
          fontWeight:
            typeof style.fontWeight === "string" || typeof style.fontWeight === "number"
              ? style.fontWeight
              : "normal",
          fontStyle: typeof style.fontStyle === "string" ? style.fontStyle : "normal",
          textAlign:
            style.textAlign === "center" || style.textAlign === "right"
              ? style.textAlign
              : "left",
          fill: typeof style.fill === "string" ? style.fill : "#1f2937",
          opacity: typeof style.opacity === "number" ? style.opacity : 1,
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
              : typeof style.fill === "string"
              ? style.fill
              : "#fef08a",
          textColor:
            typeof style.textColor === "string"
              ? style.textColor
              : typeof style.fill === "string"
              ? style.fill
              : "#1f2937",
          opacity: typeof style.opacity === "number" ? style.opacity : 1,
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
          stroke: typeof style.stroke === "string" ? style.stroke : "#1f2937",
          strokeWidth: typeof style.strokeWidth === "number" ? style.strokeWidth : 2,
          opacity: typeof style.opacity === "number" ? style.opacity : 1,
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
          stroke: typeof style.stroke === "string" ? style.stroke : "#1f2937",
          strokeWidth: typeof style.strokeWidth === "number" ? style.strokeWidth : 2,
          opacity: typeof style.opacity === "number" ? style.opacity : 1,
          strokeStyle: style.strokeStyle === "dashed" ? "dashed" : "solid",
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
          stroke: typeof style.stroke === "string" ? style.stroke : "#1f2937",
          strokeWidth: typeof style.strokeWidth === "number" ? style.strokeWidth : 2,
          opacity: typeof style.opacity === "number" ? style.opacity : 1,
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
          stroke: typeof style.stroke === "string" ? style.stroke : "#1f2937",
          strokeWidth: typeof style.strokeWidth === "number" ? style.strokeWidth : 2,
          opacity: typeof style.opacity === "number" ? style.opacity : 1,
          arrowHeadEnd: typeof style.arrowHeadEnd === "boolean" ? style.arrowHeadEnd : true,
          arrowHeadStart: typeof style.arrowHeadStart === "boolean" ? style.arrowHeadStart : false,
          pointerLength: typeof style.pointerLength === "number" ? style.pointerLength : 10,
          pointerWidth: typeof style.pointerWidth === "number" ? style.pointerWidth : 10,
        },
      };
      return connDto;
    }

    // Default to rectangle
    const rectDto: RectangleShapeResponseDto = {
      ...base,
      type: "rectangle",
      style: {
        fill: typeof style.fill === "string" ? style.fill : "#ffffff",
        stroke: typeof style.stroke === "string" ? style.stroke : "#1f2937",
        strokeWidth: typeof style.strokeWidth === "number" ? style.strokeWidth : 2,
        opacity: typeof style.opacity === "number" ? style.opacity : 1,
      },
    };
    return rectDto;
  }
}
