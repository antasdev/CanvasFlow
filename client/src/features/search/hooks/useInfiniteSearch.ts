import {
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from "@tanstack/react-query";
import { searchApi } from "../api/search.api";
import type { SearchQueryParams, SearchResponse } from "../types/search.types";

export type InfiniteSearchParams = Omit<SearchQueryParams, "cursor">;

export interface UseInfiniteSearchOptions {
  enabled?: boolean;
}

export const INFINITE_SEARCH_QUERY_KEYS = {
  search: (params: InfiniteSearchParams) =>
    [
      "search",
      "infinite",
      {
        scope: params.scope,
        workspaceId: params.workspaceId || null,
        boardId: params.boardId || null,
        q: params.q.trim(),
        types: params.types ? [...params.types].sort() : null,
        limit: params.limit ?? 20,
      },
    ] as const,
};

export function useInfiniteSearch(
  params: InfiniteSearchParams,
  options?: UseInfiniteSearchOptions
): UseInfiniteQueryResult<InfiniteData<SearchResponse, string | null>, Error> {
  const isQueryValid = params.q.trim().length >= 1;
  const isScopeValid =
    (params.scope === "workspace" && Boolean(params.workspaceId)) ||
    (params.scope === "board" && Boolean(params.boardId));

  const isEnabled = (options?.enabled ?? true) && isQueryValid && isScopeValid;

  return useInfiniteQuery({
    queryKey: INFINITE_SEARCH_QUERY_KEYS.search(params),
    queryFn: async ({ pageParam }): Promise<SearchResponse> => {
      return searchApi.search({
        ...params,
        cursor: pageParam ?? undefined,
      });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage): string | undefined => {
      return lastPage.pagination.hasMore && lastPage.pagination.nextCursor
        ? lastPage.pagination.nextCursor
        : undefined;
    },
    enabled: isEnabled,
    staleTime: 1000 * 30, // 30 seconds
  });
}
