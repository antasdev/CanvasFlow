import {
  SearchEntityType,
  SearchScopeType,
  SearchResultItem,
  SearchPaginationMetadata,
  SearchResponseDto,
} from "./search.types";

export interface SearchRequestDto {
  q: string;
  scope: SearchScopeType;
  workspaceId?: string;
  boardId?: string;
  types?: SearchEntityType[];
  limit: number;
  cursor?: string;
}

export type {
  SearchResultItem,
  SearchPaginationMetadata,
  SearchResponseDto,
};
