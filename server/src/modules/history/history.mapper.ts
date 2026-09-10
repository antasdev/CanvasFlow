import {
  VersionAuthorDto,
  VersionResponseDto,
  VersionSummaryResponseDto,
} from "./history.dto";
import { BoardVersionDocument, BoardVersion } from "./history.types";

export class HistoryMapper {
  /**
   * Maps a BoardVersion document to a detailed VersionResponseDto (including full snapshot).
   */
  static toResponseDto(
    doc: BoardVersionDocument | BoardVersion,
    author?: VersionAuthorDto
  ): VersionResponseDto {
    const raw = typeof (doc as any).toObject === "function" ? (doc as any).toObject() : doc;

    return {
      id: raw._id.toString(),
      boardId: raw.boardId.toString(),
      versionNumber: raw.versionNumber,
      name: raw.name ?? "",
      description: raw.description ?? "",
      trigger: raw.trigger,
      createdBy: raw.createdBy.toString(),
      author,
      collaborationRevision: raw.collaborationRevision ?? 0,
      snapshot: raw.snapshot,
      shapeCount: raw.snapshot?.shapeCount ?? 0,
      changeSummary: raw.changeSummary,
      isNamed: raw.isNamed ?? false,
      createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : new Date(raw.createdAt).toISOString(),
      updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt.toISOString() : new Date(raw.updatedAt).toISOString(),
    };
  }

  /**
   * Maps a BoardVersion document to a lightweight VersionSummaryResponseDto (omits heavy shape arrays).
   */
  static toSummaryDto(
    doc: BoardVersionDocument | BoardVersion,
    author?: VersionAuthorDto
  ): VersionSummaryResponseDto {
    const raw = typeof (doc as any).toObject === "function" ? (doc as any).toObject() : doc;

    return {
      id: raw._id.toString(),
      boardId: raw.boardId.toString(),
      versionNumber: raw.versionNumber,
      name: raw.name ?? "",
      description: raw.description ?? "",
      trigger: raw.trigger,
      createdBy: raw.createdBy.toString(),
      author,
      collaborationRevision: raw.collaborationRevision ?? 0,
      shapeCount: raw.snapshot?.shapeCount ?? 0,
      canvasCount: raw.snapshot?.canvases?.length ?? 0,
      changeSummary: raw.changeSummary,
      isNamed: raw.isNamed ?? false,
      createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : new Date(raw.createdAt).toISOString(),
      updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt.toISOString() : new Date(raw.updatedAt).toISOString(),
    };
  }
}
