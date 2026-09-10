export type VersionTrigger = "manual" | "automatic" | "restore";

export interface VersionAuthor {
  id: string;
  fullName: string;
  email?: string;
  avatarUrl?: string;
}

export interface VersionChangeSummary {
  shapesAdded: number;
  shapesModified: number;
  shapesDeleted: number;
  canvasModified?: boolean;
  description?: string;
}

export interface VersionSummary {
  id: string;
  boardId: string;
  versionNumber: number;
  name?: string;
  description?: string;
  trigger: VersionTrigger;
  createdBy: string;
  author?: VersionAuthor;
  collaborationRevision: number;
  changeSummary?: VersionChangeSummary;
  canvasCount: number;
  shapeCount: number;
  isNamed: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface VersionPaginationMeta {
  nextCursor?: number;
  hasMore: boolean;
  totalCount: number;
}

export interface VersionListResponse {
  items: VersionSummary[];
  pagination: VersionPaginationMeta;
}

export interface VersionQueryParams {
  limit?: number;
  cursor?: number;
  trigger?: VersionTrigger;
}

export interface VersionShapeSnapshot {
  id: string;
  canvasId: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  text?: string;
  points?: number[];
  connector?: {
    sourceShapeId?: string;
    sourceAnchor?: "top" | "right" | "bottom" | "left" | "center";
    targetShapeId?: string;
    targetAnchor?: "top" | "right" | "bottom" | "left" | "center";
    routing?: "orthogonal" | "straight" | "curved";
  };
  shapeConfig?: Record<string, unknown>;
  style?: Record<string, unknown>;
  createdBy?: string;
  parentId?: string | null;
  version?: number;
}

export interface VersionCanvasSnapshot {
  canvasId: string;
  name: string;
  order: number;
  backgroundColor: string;
  thumbnail?: string;
  shapes: VersionShapeSnapshot[];
}

export interface VersionSnapshot {
  boardId?: string;
  boardName?: string;
  canvases: VersionCanvasSnapshot[];
  shapeCount: number;
  canvasCount?: number;
}

export interface VersionDetail extends VersionSummary {
  snapshot: VersionSnapshot;
}

export interface RestoreVersionPayload {
  expectedCollaborationRevision?: number;
  mutationId?: string;
  description?: string;
}

export interface RestoreVersionResult {
  restoredVersionId: string;
  restoredVersionNumber: number;
  newVersion: VersionSummary;
  collaborationRevision: number;
}
