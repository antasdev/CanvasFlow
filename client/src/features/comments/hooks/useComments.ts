import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { commentApi } from "../api";
import { useCommentStore } from "../store";
import type { Comment } from "../types";

export const COMMENT_QUERY_KEYS = {
  boardComments: (boardId: string) => ["boards", boardId, "comments"] as const,
};

export function useComments(boardId?: string) {
  const setComments = useCommentStore((state) => state.setComments);

  const query = useQuery<Comment[], Error>({
    queryKey: boardId ? COMMENT_QUERY_KEYS.boardComments(boardId) : ["comments"],
    queryFn: async () => {
      if (!boardId) {
        return [];
      }
      return commentApi.getComments(boardId);
    },
    enabled: Boolean(boardId),
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  useEffect(() => {
    if (query.data) {
      setComments(query.data);
    }
  }, [query.data, setComments]);

  return query;
}
