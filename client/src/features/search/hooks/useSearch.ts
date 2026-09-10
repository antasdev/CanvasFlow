import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { searchApi } from "../api/search.api";
import type { SearchQueryParams, SearchResponse } from "../types/search.types";

export const SEARCH_QUERY_KEYS = {
  search: (params: SearchQueryParams) =>
    [
      "search",
      {
        scope: params.scope,
        workspaceId: params.workspaceId || null,
        boardId: params.boardId || null,
        q: params.q.trim(),
        types: params.types ? [...params.types].sort() : null,
        limit: params.limit ?? 20,
        cursor: params.cursor || null,
      },
    ] as const,
};

export interface UseSearchOptions {
  enabled?: boolean;
}

export function useSearch(
  params: SearchQueryParams,
  options?: UseSearchOptions
): UseQueryResult<SearchResponse, Error> {
  const isQueryValid = params.q.trim().length >= 1;
  const isScopeValid =
    (params.scope === "workspace" && Boolean(params.workspaceId)) ||
    (params.scope === "board" && Boolean(params.boardId));

  const isEnabled = (options?.enabled ?? true) && isQueryValid && isScopeValid;

  return useQuery({
    queryKey: SEARCH_QUERY_KEYS.search(params),
    queryFn: async () => searchApi.search(params),
    enabled: isEnabled,
    staleTime: 1000 * 30, // 30 seconds
  });
}
