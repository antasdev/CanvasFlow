import { Types } from "mongoose";

export type SearchEntityType = "board" | "canvas" | "shape" | "comment";

export type SearchScopeType = "workspace" | "board";

export type MatchedField = "name" | "description" | "text" | "content";

export interface SearchScopeFilter {
  scope: SearchScopeType;
  workspaceId?: Types.ObjectId;
  boardId?: Types.ObjectId;
}

export interface SearchQueryInput {
  q: string;
  scope: SearchScopeType;
  workspaceId?: string;
  boardId?: string;
  types?: SearchEntityType[];
  limit?: number;
  cursor?: string;
}

export interface SearchCursorPayload {
  timestamp: number;
  id: string;
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

export interface SearchResponseDto {
  results: SearchResultItem[];
  pagination: SearchPaginationMetadata;
}

export interface RawBoardSearchResult {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  workspaceId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface RawCanvasSearchResult {
  _id: Types.ObjectId;
  name: string;
  boardId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface RawShapeSearchResult {
  _id: Types.ObjectId;
  type: string;
  text?: string;
  canvasId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface RawCommentSearchResult {
  _id: Types.ObjectId;
  content: string;
  boardId: Types.ObjectId;
  canvasId: Types.ObjectId;
  shapeId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}
