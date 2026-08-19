import { Shape, ShapeDocument } from "./shape.types";
import { ShapeResponseDto } from "./shape.dto";

export class ShapeMapper {
  /**
   * Maps internal MongoDB shape document or entity to public API response DTO.
   */
  static toResponseDto(doc: ShapeDocument | Shape): ShapeResponseDto {
    const style = (doc.style ?? {}) as Record<string, unknown>;

    return {
      id: doc._id.toString(),
      canvasId: doc.canvasId.toString(),
      type: "rectangle",
      x: doc.x,
      y: doc.y,
      width: doc.width,
      height: doc.height,
      rotation: doc.rotation ?? 0,
      zIndex: doc.zIndex,
      style: {
        fill: typeof style.fill === "string" ? style.fill : "#ffffff",
        stroke: typeof style.stroke === "string" ? style.stroke : "#1f2937",
        strokeWidth: typeof style.strokeWidth === "number" ? style.strokeWidth : 2,
        opacity: typeof style.opacity === "number" ? style.opacity : 1,
      },
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
  }
}
