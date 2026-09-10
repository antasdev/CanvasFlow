import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { historyApi } from "../api";
import type { VersionSummary } from "../types";
import {
  groupVersionsByDate,
  type DateGroupedVersions,
} from "../utils/history-date.utils";

export const HISTORY_QUERY_KEYS = {
  all: ["versions"] as const,
  boardVersions: (boardId: string) => ["boards", boardId, "versions"] as const,
};

export interface UseVersionHistoryResult {
  versions: VersionSummary[];
  groupedVersions: DateGroupedVersions[];
  totalCount: number;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  isError: boolean;
  error: Error | null;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
}

export function useVersionHistory(boardId?: string): UseVersionHistoryResult {
  const query = useInfiniteQuery({
    queryKey: boardId
      ? HISTORY_QUERY_KEYS.boardVersions(boardId)
      : HISTORY_QUERY_KEYS.all,
    queryFn: async ({ pageParam }) => {
      if (!boardId) {
        return {
          items: [],
          pagination: { hasMore: false, totalCount: 0 },
        };
      }
      return historyApi.getVersions(boardId, {
        limit: 20,
        cursor: pageParam,
      });
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore
        ? lastPage.pagination.nextCursor
        : undefined,
    enabled: Boolean(boardId),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  // Flatten and deduplicate versions by id across pages
  const versions = useMemo(() => {
    if (!query.data?.pages) return [];
    const map = new Map<string, VersionSummary>();
    for (const page of query.data.pages) {
      for (const item of page.items) {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      }
    }
    return Array.from(map.values());
  }, [query.data?.pages]);

  const groupedVersions = useMemo(() => {
    return groupVersionsByDate(versions);
  }, [versions]);

  const totalCount =
    query.data?.pages[0]?.pagination.totalCount ?? versions.length;

  return {
    versions,
    groupedVersions,
    totalCount,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: Boolean(query.hasNextPage),
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}
