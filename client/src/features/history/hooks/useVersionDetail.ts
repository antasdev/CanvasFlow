import { useQuery } from "@tanstack/react-query";

import { historyApi } from "../api";
import type { VersionDetail } from "../types";

export interface UseVersionDetailResult {
  data: VersionDetail | undefined;
  version: VersionDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useVersionDetail(
  boardId?: string,
  versionId?: string | null
): UseVersionDetailResult {
  const query = useQuery<VersionDetail, Error>({
    queryKey: ["boards", boardId, "versions", versionId],
    queryFn: async () => {
      if (!boardId || !versionId) {
        throw new Error("boardId and versionId are required to fetch version detail.");
      }
      return historyApi.getVersionById(boardId, versionId);
    },
    enabled: Boolean(boardId && versionId),
    staleTime: 1000 * 60 * 5, // 5 minutes cache for immutable historical checkpoints
  });

  return {
    data: query.data,
    version: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
