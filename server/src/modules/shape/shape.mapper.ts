import { Shape, ShapeDocument, ShapeType } from "./shape.types";
import {
  ShapeResponseDto,
  RectangleShapeResponseDto,
  TextShapeResponseDto,
  StickyNoteShapeResponseDto,
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
      createdAt:
        doc.createdAt instanceof Date
          ? doc.createdAt.toISOString()
          : new Date(doc.createdAt).toISOString(),
      updatedAt:
        doc.updatedAt instanceof Date
          ? doc.updatedAt.toISOString()
          : new Date(doc.updatedAt).toISOString(),
    };

    const shapeType = String(doc.type).toUpperCase();

    if (shapeType === ShapeType.TEXT || shapeType === "TEXT") {
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
          fill:
            typeof style.fill === "string"
              ? style.fill
              : typeof style.textColor === "string"
              ? style.textColor
              : "#1f2937",
          opacity: typeof style.opacity === "number" ? style.opacity : 1,
        },
      };
      return textDto;
    }

    if (shapeType === ShapeType.STICKY_NOTE || shapeType === "STICKY_NOTE") {
      const stickyDto: StickyNoteShapeResponseDto = {
        ...base,
        type: "sticky_note",
        style: {
          text: typeof style.text === "string" ? style.text : "",
          fontSize: typeof style.fontSize === "number" ? style.fontSize : 20,
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
