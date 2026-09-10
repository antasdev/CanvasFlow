export type VersionTrigger = "manual" | "automatic";

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
