export type SearchEntityType = "board" | "canvas" | "shape" | "comment";

export type SearchScopeType = "workspace" | "board";

export type MatchedField = "name" | "description" | "text" | "content";

export interface SearchQueryParams {
  q: string;
  scope: SearchScopeType;
  workspaceId?: string;
  boardId?: string;
  types?: SearchEntityType[];
  limit?: number;
  cursor?: string;
}

export interface SearchResultItem {
  id: string;
  entityType: SearchEntityType;
  title: string;
  snippet?: string;
  boardId: string;
  boardName?: string;
  canvasId?: string;
  canvasName?: string;
  shapeId?: string;
  commentId?: string;
  matchedField: MatchedField;
  createdAt: string;
  updatedAt: string;
}

export interface SearchPaginationMetadata {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SearchResponse {
  results: SearchResultItem[];
  pagination: SearchPaginationMetadata;
}
