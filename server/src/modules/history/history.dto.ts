import { Types } from "mongoose";
import {
  VersionChangeSummary,
  VersionSnapshot,
  VersionTrigger,
} from "./history.types";

/**
 * Public representation of a version checkpoint's author.
 */
export type VersionAuthorDto = {
  id: string;
  fullName: string;
  email?: string;
  avatar?: string;
};

/**
 * Canonical Version Response DTO containing full snapshot data.
 * Used for detailed version inspection, timeline inspection, and future preview/restore.
 */
export type VersionResponseDto = {
  id: string;
  boardId: string;
  versionNumber: number;
  name: string;
  description: string;
  trigger: VersionTrigger;
  createdBy: string;
  author?: VersionAuthorDto;
  collaborationRevision: number;
  snapshot: VersionSnapshot;
  shapeCount: number;
  changeSummary?: VersionChangeSummary;
  isNamed: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Lightweight Version Summary DTO for timeline lists.
 * Omits heavy shape arrays to keep response payloads small and fast.
 */
export type VersionSummaryResponseDto = {
  id: string;
  boardId: string;
  versionNumber: number;
  name: string;
  description: string;
  trigger: VersionTrigger;
  createdBy: string;
  author?: VersionAuthorDto;
  collaborationRevision: number;
  shapeCount: number;
  canvasCount: number;
  changeSummary?: VersionChangeSummary;
  isNamed: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Client request DTO for creating a manual named version checkpoint.
 */
export type CreateManualVersionDto = {
  name?: string;
  description?: string;
};

/**
 * Internal/Service DTO for creating a new version.
 */
export type CreateVersionDto = {
  boardId: Types.ObjectId;
  name?: string;
  description?: string;
  trigger?: VersionTrigger;
  createdBy: Types.ObjectId;
  collaborationRevision: number;
  snapshot: VersionSnapshot;
  changeSummary?: VersionChangeSummary;
  isNamed?: boolean;
};

/**
 * Client request DTO for updating version metadata (name/description only).
 */
export type UpdateVersionMetadataDto = {
  name?: string;
  description?: string;
};

/**
 * Query filter DTO for listing versions of a board.
 */
export type VersionFilterDto = {
  trigger?: VersionTrigger;
  isNamed?: boolean;
  cursor?: number;
  limit?: number;
};

/**
 * Paginated response wrapper for version history timeline.
 */
export type PaginatedVersionsResponseDto = {
  versions: VersionSummaryResponseDto[];
  nextCursor?: number;
  hasMore: boolean;
  totalCount: number;
};

/**
 * Client request DTO for restoring a historical version checkpoint.
 */
export type RestoreVersionDto = {
  expectedCollaborationRevision?: number;
  mutationId?: string;
  description?: string;
};

/**
 * Server response DTO returned after successful version restore.
 */
export type RestoreVersionResponseDto = {
  restoredVersionId: string;
  restoredVersionNumber: number;
  newVersion: VersionSummaryResponseDto;
  collaborationRevision: number;
};
