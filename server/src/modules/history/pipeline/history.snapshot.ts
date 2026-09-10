import { ClientSession, Types } from "mongoose";
import { canvasRepository } from "@/modules/canvas/canvas.repository";
import { shapeRepository } from "@/modules/shape/shape.repository";
import {
  AnchorPosition,
  ConnectorRouting,
} from "@/modules/shape/shape.types";
import {
  VersionCanvasSnapshot,
  VersionShapeSnapshot,
  VersionSnapshot,
} from "../history.types";

/**
 * SnapshotBuilder
 *
 * Single authoritative snapshot constructor for the history pipeline.
 * Deterministically serializes all active canvas pages and shape documents
 * from committed database state with complete immutability guarantees.
 */
export class SnapshotBuilder {
  /**
   * Serializes an individual raw shape document into an immutable VersionShapeSnapshot.
   */
  private static serializeShape(shapeDoc: unknown): VersionShapeSnapshot {
    const rawObj =
      shapeDoc && typeof (shapeDoc as { toObject?: () => Record<string, unknown> }).toObject === "function"
        ? (shapeDoc as { toObject: () => Record<string, unknown> }).toObject()
        : (shapeDoc as Record<string, unknown>);

    const rawConnector = rawObj.connector as
      | {
          sourceShapeId?: Types.ObjectId | string | null;
          sourceAnchor?: AnchorPosition | null;
          targetShapeId?: Types.ObjectId | string | null;
          targetAnchor?: AnchorPosition | null;
          routing?: ConnectorRouting;
        }
      | undefined;

    return {
      id: rawObj._id ? rawObj._id.toString() : "",
      canvasId: rawObj.canvasId ? rawObj.canvasId.toString() : "",
      type: typeof rawObj.type === "string" ? rawObj.type : String(rawObj.type ?? ""),
      x: Number(rawObj.x ?? 0),
      y: Number(rawObj.y ?? 0),
      width: Number(rawObj.width ?? 0),
      height: Number(rawObj.height ?? 0),
      rotation: Number(rawObj.rotation ?? 0),
      zIndex: Number(rawObj.zIndex ?? 0),
      text: typeof rawObj.text === "string" ? rawObj.text : undefined,
      points: Array.isArray(rawObj.points) ? [...rawObj.points] : undefined,
      connector: rawConnector
        ? {
            sourceShapeId: rawConnector.sourceShapeId
              ? rawConnector.sourceShapeId.toString()
              : null,
            sourceAnchor: rawConnector.sourceAnchor ?? null,
            targetShapeId: rawConnector.targetShapeId
              ? rawConnector.targetShapeId.toString()
              : null,
            targetAnchor: rawConnector.targetAnchor ?? null,
            routing: rawConnector.routing ?? "straight",
          }
        : undefined,
      shapeConfig: rawObj.shapeConfig && typeof rawObj.shapeConfig === "object"
        ? { ...(rawObj.shapeConfig as Record<string, unknown>) }
        : undefined,
      style: rawObj.style && typeof rawObj.style === "object"
        ? JSON.parse(JSON.stringify(rawObj.style))
        : {},
      createdBy: rawObj.createdBy ? rawObj.createdBy.toString() : "",
      parentId: rawObj.parentId ? rawObj.parentId.toString() : null,
      version: Number(rawObj.version ?? 1),
      createdAt:
        rawObj.createdAt instanceof Date
          ? rawObj.createdAt.toISOString()
          : typeof rawObj.createdAt === "string"
          ? rawObj.createdAt
          : new Date().toISOString(),
      updatedAt:
        rawObj.updatedAt instanceof Date
          ? rawObj.updatedAt.toISOString()
          : typeof rawObj.updatedAt === "string"
          ? rawObj.updatedAt
          : new Date().toISOString(),
    };
  }

  /**
   * Captures an authoritative, self-contained snapshot of all active canvases and shapes for a board.
   */
  static async buildBoardSnapshot(
    boardId: Types.ObjectId,
    session?: ClientSession
  ): Promise<VersionSnapshot> {
    const canvases = await canvasRepository.findByBoardId(boardId, session);

    const canvasSnapshots: VersionCanvasSnapshot[] = [];
    let totalShapeCount = 0;

    for (const canvas of canvases) {
      const shapes = await shapeRepository.findByCanvasId(canvas._id, session);

      const shapeSnapshots: VersionShapeSnapshot[] = shapes.map((s) =>
        SnapshotBuilder.serializeShape(s)
      );

      totalShapeCount += shapeSnapshots.length;

      canvasSnapshots.push({
        canvasId: canvas._id.toString(),
        name: canvas.name,
        order: canvas.order,
        backgroundColor: canvas.backgroundColor ?? "#FFFFFF",
        thumbnail: canvas.thumbnail,
        shapes: shapeSnapshots,
      });
    }

    return {
      canvases: canvasSnapshots,
      shapeCount: totalShapeCount,
    };
  }
}
